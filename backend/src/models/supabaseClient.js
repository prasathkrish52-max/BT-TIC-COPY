const { createClient } = require('@supabase/supabase-js');
const config = require('../config/config');
const jwt = require('jsonwebtoken');

let supabase;

if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
  // Use real Supabase client
  supabase = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  console.log('✅ Supabase client initialized.');
} else {
  console.warn('⚠️  Supabase URL/Key missing. Falling back to local SQLite Database emulator.');

  // Initialize/Seed SQLite database if empty
  const { runQuery, allQuery, getQuery, initDb } = require('./db');
  const dbInitPromise = initDb().catch(err => {
    console.error('Error initializing SQLite DB:', err);
  });

  const normalizeDateParam = (val) => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
    }
    return val;
  };

  class SqliteQueryBuilder {
    constructor(table) {
      this.table = table;
      this.op = 'select'; // select, insert, update, delete
      this.selectCols = '*';
      this.insertData = null;
      this.updateData = null;
      this.filters = [];
      this.params = [];
      this.orderCol = null;
      this.orderAsc = true;
      this.offsetVal = null;
      this.limitVal = null;
      this.isSingle = false;
      this.isMaybeSingle = false;
      this.countOption = null;
      this.onConflict = null;
    }

    select(columns = '*', options = {}) {
      this.op = 'select';
      this.selectCols = columns;
      if (options.count) {
        this.countOption = options.count;
      }
      return this;
    }

    insert(data) {
      this.op = 'insert';
      this.insertData = Array.isArray(data) ? data : [data];
      return this;
    }

    upsert(data, options = {}) {
      this.op = 'upsert';
      this.insertData = Array.isArray(data) ? data : [data];
      this.onConflict = options.onConflict;
      return this;
    }

    update(data) {
      this.op = 'update';
      this.updateData = data;
      return this;
    }

    delete() {
      this.op = 'delete';
      return this;
    }

    eq(col, val) {
      if (val === null) {
        this.filters.push(`${col} IS NULL`);
      } else {
        if (typeof val === 'boolean') {
          val = val ? 1 : 0;
        }
        val = normalizeDateParam(val);
        this.filters.push(`${col} = ?`);
        this.params.push(val);
      }
      return this;
    }

    gte(col, val) {
      if (typeof val === 'boolean') {
        val = val ? 1 : 0;
      }
      val = normalizeDateParam(val);
      this.filters.push(`${col} >= ?`);
      this.params.push(val);
      return this;
    }

    lte(col, val) {
      if (typeof val === 'boolean') {
        val = val ? 1 : 0;
      }
      val = normalizeDateParam(val);
      this.filters.push(`${col} <= ?`);
      this.params.push(val);
      return this;
    }

    gt(col, val) {
      if (typeof val === 'boolean') {
        val = val ? 1 : 0;
      }
      val = normalizeDateParam(val);
      this.filters.push(`${col} > ?`);
      this.params.push(val);
      return this;
    }

    lt(col, val) {
      if (typeof val === 'boolean') {
        val = val ? 1 : 0;
      }
      val = normalizeDateParam(val);
      this.filters.push(`${col} < ?`);
      this.params.push(val);
      return this;
    }

    is(col, val) {
      if (val === null) {
        this.filters.push(`${col} IS NULL`);
      } else {
        if (typeof val === 'boolean') {
          val = val ? 1 : 0;
        }
        val = normalizeDateParam(val);
        this.filters.push(`${col} = ?`);
        this.params.push(val);
      }
      return this;
    }

    neq(col, val) {
      if (val === null) {
        this.filters.push(`${col} IS NOT NULL`);
      } else {
        if (typeof val === 'boolean') {
          val = val ? 1 : 0;
        }
        this.filters.push(`${col} != ?`);
        this.params.push(val);
      }
      return this;
    }

    ilike(col, val) {
      // In SQLite, LIKE is case-insensitive by default for ASCII characters.
      // E.g., ilike('full_name', '%john%') -> LIKE '%john%'
      this.filters.push(`${col} LIKE ?`);
      this.params.push(val);
      return this;
    }

    in(col, arr) {
      if (!arr || arr.length === 0) {
        this.filters.push('0 = 1');
      } else {
        const placeholders = arr.map(() => '?').join(', ');
        this.filters.push(`${col} IN (${placeholders})`);
        this.params.push(...arr);
      }
      return this;
    }

    not(col, operator, val) {
      if (operator.toLowerCase() === 'is' && val === null) {
        this.filters.push(`${col} IS NOT NULL`);
      } else {
        if (typeof val === 'boolean') {
          val = val ? 1 : 0;
        }
        this.filters.push(`${col} != ?`);
        this.params.push(val);
      }
      return this;
    }

    order(col, options = {}) {
      this.orderCol = col;
      this.orderAsc = options.ascending !== false;
      return this;
    }

    or(expr) {
      const parts = expr.split(',');
      const orFilters = [];
      for (const part of parts) {
        if (part.includes('.not.is.null')) {
          const col = part.replace('.not.is.null', '');
          orFilters.push(`${col} IS NOT NULL AND ${col} != ''`);
        } else if (part.includes('.ilike.')) {
          const [col, pattern] = part.split('.ilike.');
          const cleanPattern = pattern.replace(/%/g, '');
          orFilters.push(`${col} LIKE ?`);
          this.params.push(`%${cleanPattern}%`);
        } else if (part.includes('.eq.')) {
          const [col, val] = part.split('.eq.');
          orFilters.push(`${col} = ?`);
          this.params.push(val);
        }
      }
      if (orFilters.length > 0) {
        this.filters.push(`(${orFilters.join(' OR ')})`);
      }
      return this;
    }

    range(from, to) {
      this.limitVal = to - from + 1;
      this.offsetVal = from;
      return this;
    }

    limit(count) {
      this.limitVal = count;
      return this;
    }

    maybeSingle() {
      this.isMaybeSingle = true;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    async then(resolve, reject) {
      try {
        const res = await this.execute();
        resolve(res);
      } catch (err) {
        if (reject) reject(err);
        else throw err;
      }
    }

    async execute() {
      if (dbInitPromise) {
        await dbInitPromise;
      }
      let count = null;
      let whereClause = '';
      if (this.filters.length > 0) {
        whereClause = ' WHERE ' + this.filters.join(' AND ');
      }

      if (this.op === 'select') {
        if (this.countOption === 'exact') {
          const countSql = `SELECT COUNT(*) as count FROM ${this.table}${whereClause}`;
          const countRow = await getQuery(countSql, this.params);
          count = countRow ? countRow.count : 0;
        }

        let sql;
        let isJoinQuery = false;
        if (this.table === 'edit_requests' && this.selectCols.includes('students!inner')) {
          isJoinQuery = true;
          sql = `SELECT edit_requests.*, students.full_name, students.ut_no, students.phone_number, students.profile_status FROM edit_requests INNER JOIN students ON edit_requests.student_id = students.id${whereClause}`;
        } else {
          sql = `SELECT ${this.selectCols} FROM ${this.table}${whereClause}`;
        }

        if (this.orderCol) {
          sql += ` ORDER BY ${this.orderCol} ${this.orderAsc ? 'ASC' : 'DESC'}`;
        }
        if (this.limitVal !== null) {
          sql += ` LIMIT ${this.limitVal}`;
        }
        if (this.offsetVal !== null) {
          sql += ` OFFSET ${this.offsetVal}`;
        }

        const rows = await allQuery(sql, this.params);
        let data = rows;

        if (isJoinQuery) {
          data = rows.map(row => {
            const newRow = { ...row };
            newRow.students = {
              full_name: row.full_name,
              ut_no: row.ut_no,
              phone_number: row.phone_number,
              profile_status: row.profile_status
            };
            delete newRow.full_name;
            delete newRow.ut_no;
            delete newRow.phone_number;
            delete newRow.profile_status;
            return newRow;
          });
        }

        // Map Boolean fields for JS consistency
        data = rows.map(row => {
          const newRow = { ...row };
          if (newRow.dropout_status !== undefined) {
            newRow.dropout_status = !!newRow.dropout_status;
          }
          if (newRow.low_attendance_status !== undefined) {
            newRow.low_attendance_status = !!newRow.low_attendance_status;
          }
          return newRow;
        });

        if (this.isSingle || this.isMaybeSingle) {
          data = data.length > 0 ? data[0] : null;
          if (this.isSingle && !data) {
            return { data: null, count: null, error: { message: 'Row not found' } };
          }
        }
        return { data, count, error: null };
      }

      if (this.op === 'insert') {
        const results = [];
        for (const item of this.insertData) {
          const keys = Object.keys(item);
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
          const params = keys.map(k => {
            let val = item[k];
            if (typeof val === 'boolean') val = val ? 1 : 0;
            return val;
          });
          await runQuery(sql, params);
          results.push(item);
        }
        return { data: results, error: null };
      }

      if (this.op === 'upsert') {
        const results = [];
        for (const item of this.insertData) {
          const keys = Object.keys(item);
          const placeholders = keys.map(() => '?').join(', ');
          
          let sql;
          if (this.onConflict) {
            const updateSets = keys
              .filter(k => k !== this.onConflict)
              .map(k => `${k} = excluded.${k}`)
              .join(', ');
            
            if (updateSets) {
              sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${this.onConflict}) DO UPDATE SET ${updateSets}`;
            } else {
              sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${this.onConflict}) DO NOTHING`;
            }
          } else {
            sql = `INSERT OR REPLACE INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
          }

          const params = keys.map(k => {
            let val = item[k];
            if (typeof val === 'boolean') val = val ? 1 : 0;
            return val;
          });
          await runQuery(sql, params);
          results.push(item);
        }
        return { data: results, error: null };
      }

      if (this.op === 'update') {
        const keys = Object.keys(this.updateData);
        if (keys.length === 0) {
          return { data: null, error: null };
        }
        const sets = keys.map(k => `${k} = ?`).join(', ');
        const sql = `UPDATE ${this.table} SET ${sets}${whereClause}`;
        const params = [
          ...keys.map(k => {
            let val = this.updateData[k];
            if (typeof val === 'boolean') val = val ? 1 : 0;
            return val;
          }),
          ...this.params
        ];
        await runQuery(sql, params);
        return { data: this.updateData, error: null };
      }

      if (this.op === 'delete') {
        const sql = `DELETE FROM ${this.table}${whereClause}`;
        await runQuery(sql, this.params);
        return { data: null, error: null };
      }
    }
  }

  // SQLite Auth mock
  const sqliteAuth = {
    admin: {
      createUser: async ({ email, password, email_confirm }) => {
        try {
          const bcrypt = require('bcryptjs');
          const hashedPw = await bcrypt.hash(password, 10);
          
          // Check if exists
          const existing = await getQuery('SELECT id FROM users WHERE email = ?', [email]);
          if (existing) {
            return { data: null, error: new Error('User already exists') };
          }

          await runQuery(
            'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
            [email, hashedPw, 'student']
          );
          const userIdRow = await getQuery('SELECT last_insert_rowid() as id');
          const userId = String(userIdRow.id);

          return {
            data: {
              user: {
                id: userId,
                email: email
              }
            },
            error: null
          };
        } catch (err) {
          return { data: null, error: err };
        }
      }
    },
    signInWithPassword: async ({ email, password }) => {
      try {
        const user = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
          return { data: null, error: new Error('Invalid credentials') };
        }

        const bcrypt = require('bcryptjs');
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          return { data: null, error: new Error('Invalid credentials') };
        }

        // Generate JWT token
        const token = jwt.sign(
          { id: String(user.id), email: user.email, role: user.role },
          config.JWT_SECRET,
          { expiresIn: config.JWT_EXPIRES_IN }
        );

        return {
          data: {
            user: { id: String(user.id), email: user.email },
            session: { access_token: token }
          },
          error: null
        };
      } catch (err) {
        return { data: null, error: err };
      }
    },
    getUser: async (token) => {
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        return {
          data: {
            user: {
              id: decoded.id,
              email: decoded.email
            }
          },
          error: null
        };
      } catch (err) {
        return { data: { user: null }, error: err };
      }
    }
  };

  supabase = {
    from: (table) => new SqliteQueryBuilder(table),
    auth: sqliteAuth
  };
}

module.exports = supabase;
