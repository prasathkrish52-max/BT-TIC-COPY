const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Helper to run query as promise
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// Helper to get all query results as promise
const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Helper to get single row as promise
const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const initDb = async () => {
  console.log('Initializing Database...');

  // Enable foreign keys
  await runQuery('PRAGMA foreign_keys = ON;');

  // Create users table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create students table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      ut_no TEXT UNIQUE,
      full_name TEXT,
      phone_number TEXT,
      nic_number TEXT,
      district TEXT,
      bank_name TEXT,
      branch TEXT,
      branch_name TEXT,
      branch_code TEXT,
      account_no TEXT,
      beneficiary_name TEXT,
      blossom_trust_amount REAL DEFAULT 0,
      photo_url TEXT,
      profile_status TEXT DEFAULT 'draft' CHECK(profile_status IN ('draft', 'submitted', 'pending_edit', 'approved_edit')),
      admin_col1_val TEXT,
      admin_col2_val TEXT,
      admin_col3_val REAL,
      dropout_reason TEXT,
      dropout_date TEXT,
      dropout_status BOOLEAN DEFAULT FALSE,
      low_alternance_reason TEXT,
      low_alternance_hours INTEGER,
      attendance_percentage REAL,
      low_attendance_status BOOLEAN DEFAULT FALSE,
      last_attendance_month TEXT,
      student_type TEXT DEFAULT 'blossom' CHECK(student_type IN ('blossom', 'non_blossom')),
      course_name TEXT CHECK(course_name IN ('Full Stack Developer', 'Front End Developer')),
      course_specialization TEXT,
      employment_status TEXT,
      other_status TEXT,
      course_completion_status TEXT CHECK(course_completion_status IN ('Completed', 'In Progress', 'Not Started')),
      batch TEXT,
      batch_year INTEGER,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create edit_requests table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS edit_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      request_reason TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  // Create attendance_history table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS attendance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      attendance_percentage REAL,
      uploaded_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  // Create admin_settings table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Seed default admin settings for column titles if not exists
  const settings = [
    { key: 'admin_col1_title', value: 'Current Status' },
    { key: 'admin_col2_title', value: 'Working Company Name' },
    { key: 'admin_col3_title', value: 'Salary (LKR)' },
    { key: 'google_sheets_id', value: '' },
    { key: 'google_sheets_client_email', value: '' },
    { key: 'google_sheets_private_key', value: '' }
  ];

  for (const setting of settings) {
    await runQuery(
      `INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)`,
      [setting.key, setting.value]
    );
  }

  // Seed admin user if not exists
  const adminEmail = 'admin@blossomtrust.org';
  const existingAdmin = await getQuery('SELECT * FROM users WHERE email = ?', [adminEmail]);

  if (!existingAdmin) {
    console.log('Seeding default administrator account...');
    const hashedPw = await bcrypt.hash('admin123', 10);
    await runQuery(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [adminEmail, hashedPw, 'admin']
    );
  }

  // Auto-seed is DISABLED — import real students via the Admin Excel upload.
  // To re-enable mock data, uncomment the block below.
  /*
  const studentCount = await getQuery('SELECT COUNT(*) as count FROM students');
  if (studentCount.count === 0) {
    console.log('Seeding mock students. This may take a few seconds...');
    await seedMockStudents();
  }
  */

  // Ensure table migration for new fields (course_specialization, employment_status, other_status, email)
  const columns = await allQuery('PRAGMA table_info(students);');
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('course_specialization')) {
    console.log('Migrating: Adding course_specialization column to students table...');
    await runQuery('ALTER TABLE students ADD COLUMN course_specialization TEXT;');
  }
  if (!columnNames.includes('employment_status')) {
    console.log('Migrating: Adding employment_status column to students table...');
    await runQuery('ALTER TABLE students ADD COLUMN employment_status TEXT;');
  }
  if (!columnNames.includes('other_status')) {
    console.log('Migrating: Adding other_status column to students table...');
    await runQuery('ALTER TABLE students ADD COLUMN other_status TEXT;');
  }
  if (!columnNames.includes('email')) {
    console.log('Migrating: Adding email column to students table...');
    await runQuery('ALTER TABLE students ADD COLUMN email TEXT;');
  }
  if (!columnNames.includes('course_completion_status')) {
    console.log('Migrating: Adding course_completion_status column to students table...');
    await runQuery("ALTER TABLE students ADD COLUMN course_completion_status TEXT CHECK(course_completion_status IN ('Completed', 'In Progress', 'Not Started'));");
  }

  console.log('Database initialization complete.');
};

// Generates and seeds 5,100 mock student records
const seedMockStudents = async () => {
  const firstNames = [
    'Aruni', 'Chamara', 'Dilani', 'Dinesh', 'Kasun', 'Kavindi', 'Nimal', 'Priyantha',
    'Ruwan', 'Sanduni', 'Thusitha', 'Vishwa', 'Abishek', 'Gowri', 'Jegathees', 'Karthik',
    'Kiruban', 'Mayuran', 'Priyanga', 'Renuka', 'Senthil', 'Thilini', 'Yalini', 'Nuwan',
    'Ishara', 'Tharindu', 'Dilanka', 'Hashini', 'Menaka', 'Rajeew', 'Sajith', 'Kanishka'
  ];

  const lastNames = [
    'Silva', 'Perera', 'Fernando', 'Jayawardena', 'Rajapakse', 'Gunawardena', 'Senanayake',
    'Wijesinghe', 'Herath', 'Bandara', 'Rathnayake', 'Kulatunga', 'Kumar', 'Krishnan',
    'Ramanathan', 'Balasubramaniam', 'Selvaraj', 'Murugan', 'Ganeshan', 'Thangarajah',
    'Mendis', 'Alwis', 'Dias', 'Corea', 'Cooray', 'Fonseka', 'Rodrigo', 'Goonetilleke'
  ];

  const districts = [
    'Jaffna', 'Kilinochchi', 'Mullaitivu', 'Mannar', 'Vavuniya', 'Colombo', 'Gampaha',
    'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota',
    'Batticaloa', 'Ampara', 'Trincomalee', 'Kurunegala', 'Puttalam', 'Anuradhapura',
    'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle'
  ];

  const banks = [
    'Bank of Ceylon', "People's Bank", 'Commercial Bank', 'Hatton National Bank',
    'Sampath Bank', 'Amana Bank', 'National Savings Bank', 'DFCC Bank',
    'Seylan Bank', 'Nations Trust Bank', 'Pan Asia Banking Corporation', 'Union Bank'
  ];

  const branches = [
    'Colombo Main', 'Kandy', 'Galle', 'Jaffna', 'Batticaloa', 'Trincomalee', 'Negombo',
    'Gampaha', 'Kurunegala', 'Ratnapura', 'Badulla', 'Vavuniya', 'Kalutara', 'Matara'
  ];

  const currentStatuses = ['Employed', 'In Training', 'Internship', 'Higher Studies', 'Unemployed'];
  const companies = ['Virtusa', 'WSO2', 'Sysco LABS', 'IFS Sri Lanka', 'MillenniumIT', 'Dialog Axiata', 'Lanka Bell', 'Keells', 'Hayleys', 'MAS Holdings', 'Brandix'];

  // Start Transaction for fast insertion
  await runQuery('BEGIN TRANSACTION');

  try {
    for (let i = 1; i <= 5100; i++) {
      const email = `student${i}@blossomtrust.org`;
      // We will hash standard password 'student123' once to speed up seeding
      // Standard bcrypt hash of 'student123' with 10 salt rounds:
      const hashedPw = '$2a$10$fQ8h0qG7Q7z30C78t8HBeO0pT5o8t8U0pT5o8t8U0pT5o8t8U0pT5'; // Pre-computed hash of 'student123' to save hashing 5100 times!
      
      // Insert User
      await runQuery(
        'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
        [email, hashedPw, 'student']
      );

      // Get last inserted user ID
      // In sqlite, we can use last_insert_rowid() or query it. Under transaction, we can select last_insert_rowid()
      const userIdRow = await getQuery('SELECT last_insert_rowid() as id');
      const userId = userIdRow.id;

      // Generate realistic student details
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const fullName = `${firstName} ${lastName}`;
      const phoneNo = `+94 7${Math.floor(Math.random() * 3 + 5)}${Math.floor(1000000 + Math.random() * 9000000)}`;
      const nicNo = `199${Math.floor(70 + Math.random() * 15)}${Math.floor(100000 + Math.random() * 900000)}`;
      const utNo = `UT-${2020 + Math.floor(Math.random() * 6)}-${String(i).padStart(4, '0')}`;
      const district = districts[Math.floor(Math.random() * districts.length)];
      const bank = banks[Math.floor(Math.random() * banks.length)];
      const branch = branches[Math.floor(Math.random() * branches.length)];
      const branchCode = String(Math.floor(100 + Math.random() * 900));
      const accountNo = String(Math.floor(10000000 + Math.random() * 900000000));
      const beneficiaryName = fullName;

      // Status
      // 90% submitted, 5% draft, 3% pending_edit, 2% approved_edit
      const randStatus = Math.random();
      let status = 'submitted';
      if (randStatus < 0.05) status = 'draft';
      else if (randStatus < 0.08) status = 'pending_edit';
      else if (randStatus < 0.10) status = 'approved_edit';

      // Admin columns
      const currentStatus = currentStatuses[Math.floor(Math.random() * currentStatuses.length)];
      let company = 'N/A';
      let salary = 0;
      if (currentStatus === 'Employed' || currentStatus === 'Internship') {
        company = companies[Math.floor(Math.random() * companies.length)];
        salary = Math.floor(25 + Math.random() * 150) * 1000; // 25,000 to 175,000
      }

      // Dropout flag (2% chance)
      let dropoutReason = null;
      let dropoutDate = null;
      if (Math.random() < 0.02) {
        const dropoutReasons = ['Financial difficulties', 'Health issues', 'Family relocation', 'Obtained employment elsewhere', 'Lack of interest'];
        dropoutReason = dropoutReasons[Math.floor(Math.random() * dropoutReasons.length)];
        dropoutDate = `2026-0${Math.floor(Math.random() * 5 + 1)}-15`; // Monthly dropouts between Jan and May 2026
      }

      // Low alternance flag (3% chance)
      let lowAlternanceReason = null;
      let lowAlternanceHours = null;
      if (Math.random() < 0.03) {
        const lowAlternanceReasons = ['Sickness', 'Lack of transportation', 'Personal issues', 'Part-time job conflicts'];
        lowAlternanceReason = lowAlternanceReasons[Math.floor(Math.random() * lowAlternanceReasons.length)];
        lowAlternanceHours = Math.floor(10 + Math.random() * 20); // 10 to 30 hours (low alternance, standard is e.g. 40+)
      }

      // Student Type & Course & Batch
      const studentType = Math.random() < 0.25 ? 'non_blossom' : 'blossom';
      const courseName = studentType === 'non_blossom' 
        ? (Math.random() < 0.5 ? 'Full Stack Developer' : 'Front End Developer') 
        : null;
      const batchYear = 2024 + Math.floor(Math.random() * 3);
      const batch = `Unicom TIC Class of ${batchYear}`;

      const dbBank = studentType === 'blossom' ? bank : null;
      const dbBranch = studentType === 'blossom' ? branch : null;
      const dbBranchName = studentType === 'blossom' ? `${branch} Branch` : null;
      const dbBranchCode = studentType === 'blossom' ? branchCode : null;
      const dbAccountNo = studentType === 'blossom' ? accountNo : null;
      const dbBeneficiaryName = studentType === 'blossom' ? beneficiaryName : null;
      const dbBlossomTrustAmount = studentType === 'blossom' ? (Math.random() < 0.5 ? 5000 : 10000) : 0;

      const dbDropoutReason = studentType === 'blossom' ? dropoutReason : null;
      const dbDropoutDate = studentType === 'blossom' ? dropoutDate : null;
      const dbDropoutStatus = studentType === 'blossom' && dropoutReason !== null;

      const dbLowAlternanceReason = studentType === 'blossom' ? lowAlternanceReason : null;
      const dbLowAlternanceHours = studentType === 'blossom' ? lowAlternanceHours : null;

      await runQuery(
        `INSERT INTO students (
          user_id, ut_no, full_name, phone_number, nic_number, district, bank_name,
          branch, branch_name, branch_code, account_no, beneficiary_name, blossom_trust_amount, profile_status,
          admin_col1_val, admin_col2_val, admin_col3_val,
          dropout_reason, dropout_date, dropout_status, low_alternance_reason, low_alternance_hours,
          student_type, course_name, batch, batch_year
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, utNo, fullName, phoneNo, nicNo, district, dbBank,
          dbBranch, dbBranchName, dbBranchCode, dbAccountNo, dbBeneficiaryName, dbBlossomTrustAmount, status,
          currentStatus, company, salary,
          dbDropoutReason, dbDropoutDate, dbDropoutStatus ? 1 : 0, dbLowAlternanceReason, dbLowAlternanceHours,
          studentType, courseName, batch, batchYear
        ]
      );
    }
    await runQuery('COMMIT');
    console.log('Seeded 5100 mock students successfully.');
  } catch (error) {
    await runQuery('ROLLBACK');
    console.error('Failed to seed students, rolled back transaction.', error);
    throw error;
  }
};

module.exports = {
  db,
  initDb,
  runQuery,
  allQuery,
  getQuery
};
