const supabase = require('../models/supabaseClient');
const { google } = require('googleapis');
const NodeCache = require('node-cache');
const adminCache = new NodeCache({ stdTTL: 60 }); // Default TTL: 60 seconds
exports.adminCache = adminCache;
let previousAnalyticsCounts = null; // Tracks previous analytics counts for diff logging

// 1. List students with pagination, search, and filtering
exports.listStudents = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const { utNo, name, phoneNo, district, bank, beneficiaryName, studentType, courseName, batch } = req.query;

  try {
    let query = supabase.from('students').select('*', { count: 'exact' });

    if (utNo) query = query.ilike('ut_no', `%${utNo}%`);
    if (name) query = query.ilike('full_name', `%${name}%`);
    if (phoneNo) query = query.ilike('phone_number', `%${phoneNo}%`);
    if (district) query = query.eq('district', district);
    if (bank) query = query.eq('bank_name', bank);
    if (beneficiaryName) query = query.ilike('beneficiary_name', `%${beneficiaryName}%`);
    if (studentType) query = query.eq('student_type', studentType);
    if (courseName) query = query.eq('course_name', courseName);
    if (batch) query = query.eq('batch', batch);

    query = query.order('blossom_trust_amount', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data: students, count, error } = await query;

    if (error) throw error;

    const normalizedStudents = (students || []).map(student => {
      const val = student.dropout_status;
      student.dropout_status =
        val === true || 
        val === 1 || 
        String(val).toLowerCase() === "true" || 
        String(val).toLowerCase() === "t" ||
        String(val) === "1";
      return student;
    });

    return res.status(200).json({
      students: normalizedStudents,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error retrieving students list.' });
  }
};

// 2. Fetch specific student details
exports.getStudentDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const val = student.dropout_status;
    student.dropout_status =
      val === true || 
      val === 1 || 
      String(val).toLowerCase() === "true" || 
      String(val).toLowerCase() === "t" ||
      String(val) === "1";

    const { data: requests } = await supabase
      .from('edit_requests')
      .select('*')
      .eq('student_id', id)
      .order('id', { ascending: false });

    return res.status(200).json({
      student,
      requests: requests || []
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error retrieving student details.' });
  }
};

// 3. Update administrative fields
exports.updateAdminColumns = async (req, res) => {
  const { id } = req.params;
  const {
    adminCol1Val, adminCol2Val, adminCol3Val,
    dropout_reason, dropout_date, dropout_status,
    lowAlternanceReason, lowAlternanceHours,
    attendancePercentage, lowAttendanceStatus, lastAttendanceMonth,
    blossomTrustAmount, courseName, batch,
    courseSpecialization, employmentStatus, otherStatus, email,
    courseCompletionStatus
  } = req.body;

  try {
    const { data: student, error: findError } = await supabase
      .from('students')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findError || !student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (adminCol1Val !== undefined) updateData.admin_col1_val = adminCol1Val;
    if (adminCol2Val !== undefined) updateData.admin_col2_val = adminCol2Val;
    if (adminCol3Val !== undefined) updateData.admin_col3_val = parseFloat(adminCol3Val) || 0;
    if (blossomTrustAmount !== undefined) updateData.blossom_trust_amount = parseFloat(blossomTrustAmount) || 0;
    if (courseName !== undefined) {
      updateData.course_name = courseName === '' ? null : courseName;
    }
    if (batch !== undefined) {
      updateData.batch = batch;
      const match = batch.match(/\d{4}/);
      if (match) {
        updateData.batch_year = parseInt(match[0], 10);
      }
    }
    if (dropout_reason !== undefined) updateData.dropout_reason = dropout_reason;
    if (courseSpecialization !== undefined) updateData.course_specialization = courseSpecialization;
    if (employmentStatus !== undefined) updateData.employment_status = employmentStatus;
    if (otherStatus !== undefined) updateData.other_status = otherStatus;
    if (courseCompletionStatus !== undefined) {
      updateData.course_completion_status = courseCompletionStatus === '' ? null : courseCompletionStatus;
    }
    if (email !== undefined) {
      if (email === '') {
        updateData.email = null;
      } else {
        const tempEmail = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(tempEmail)) {
          return res.status(400).json({ message: 'Invalid email address format.' });
        }
        const { data: existingEmail } = await supabase
          .from('students')
          .select('id')
          .eq('email', tempEmail)
          .neq('id', id)
          .maybeSingle();
        if (existingEmail) {
          return res.status(400).json({ message: 'This email address is already in use.' });
        }
        updateData.email = tempEmail;
      }
    }
    if (dropout_date !== undefined) updateData.dropout_date = dropout_date;
    if (dropout_status !== undefined) {
      updateData.dropout_status = 
        dropout_status === true || 
        dropout_status === "true" || 
        dropout_status === 1 || 
        dropout_status === "1";
    }
    if (lowAlternanceReason !== undefined) updateData.low_alternance_reason = lowAlternanceReason;
    if (lowAlternanceHours !== undefined) updateData.low_alternance_hours = parseInt(lowAlternanceHours) || null;
    
    // Consistent update logic for attendance fields to prevent partial updates
    if (attendancePercentage !== undefined) {
      if (attendancePercentage === null || attendancePercentage === '') {
        updateData.attendance_percentage = null;
        updateData.low_attendance_status = false;
        updateData.last_attendance_month = null;
      } else {
        updateData.attendance_percentage = parseFloat(attendancePercentage);
      }
    }
    
    if (lowAttendanceStatus !== undefined) {
      updateData.low_attendance_status = 
        lowAttendanceStatus === true || 
        lowAttendanceStatus === "true" || 
        lowAttendanceStatus === 1 || 
        lowAttendanceStatus === "1";
    }
    
    if (lastAttendanceMonth !== undefined) {
      updateData.last_attendance_month = lastAttendanceMonth === '' ? null : lastAttendanceMonth;
      if (updateData.last_attendance_month === null) {
        updateData.attendance_percentage = null;
        updateData.low_attendance_status = false;
      }
    }

    const { error: updateError } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', id);

    if (updateError) throw updateError;

    // Invalidate cached dashboard stats so next loadStats() call returns fresh data
    adminCache.del('dashboard_stats');

    const { data: updatedStudent } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (updatedStudent) {
      const val = updatedStudent.dropout_status;
      updatedStudent.dropout_status =
        val === true || 
        val === 1 || 
        String(val).toLowerCase() === "true" || 
        String(val).toLowerCase() === "t" ||
        String(val) === "1";
    }

    return res.status(200).json({
      message: 'Student administrative fields updated successfully.',
      student: updatedStudent
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error updating administrative fields.' });
  }
};

// 4a. Get public settings (Only safe UI labels)
exports.getPublicSettings = async (req, res) => {
  try {
    const cachedSettings = adminCache.get('public_settings');
    if (cachedSettings) return res.status(200).json(cachedSettings);

    const { data: settings, error } = await supabase
      .from('admin_settings')
      .select('*')
      .in('key', ['admin_col1_title', 'admin_col2_title', 'admin_col3_title']);

    if (error) throw error;

    const config = {};
    (settings || []).forEach(s => { config[s.key] = s.value; });
    
    adminCache.set('public_settings', config, 3600); // Cache settings for 1 hour
    
    return res.status(200).json(config);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error retrieving system settings.' });
  }
};

// 4. Get active configurations
exports.getSettings = async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('admin_settings')
      .select('*');

    if (error) throw error;

    const config = {};
    (settings || []).forEach(s => { config[s.key] = s.value; });
    return res.status(200).json(config);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error retrieving system settings.' });
  }
};

// 5. Update custom columns titles / Sheet details
exports.updateSettings = async (req, res) => {
  const {
    adminCol1Title, adminCol2Title, adminCol3Title,
    googleSheetsId, googleSheetsClientEmail, googleSheetsPrivateKey
  } = req.body;

  try {
    const updates = [];
    if (adminCol1Title !== undefined) updates.push({ key: 'admin_col1_title', value: adminCol1Title });
    if (adminCol2Title !== undefined) updates.push({ key: 'admin_col2_title', value: adminCol2Title });
    if (adminCol3Title !== undefined) updates.push({ key: 'admin_col3_title', value: adminCol3Title });
    if (googleSheetsId !== undefined) updates.push({ key: 'google_sheets_id', value: googleSheetsId });
    if (googleSheetsClientEmail !== undefined) updates.push({ key: 'google_sheets_client_email', value: googleSheetsClientEmail });
    if (googleSheetsPrivateKey !== undefined) updates.push({ key: 'google_sheets_private_key', value: googleSheetsPrivateKey });

    for (const { key, value } of updates) {
      const { error } = await supabase
        .from('admin_settings')
        .upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
    }

    return res.status(200).json({ message: 'System settings updated successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error updating settings.' });
  }
};

// 6. Get edit requests
exports.getEditRequests = async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('edit_requests')
      .select('*, students!inner(full_name, ut_no, phone_number, email:user_id, profile_status)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Flatten the student fields into the request object for compatibility
    const formatted = (requests || []).map(r => ({
      ...r,
      full_name: r.students?.full_name || '',
      ut_no: r.students?.ut_no || '',
      phone_number: r.students?.phone_number || '',
      profile_status: r.students?.profile_status || '',
      students: undefined
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error retrieving edit requests.' });
  }
};

// 7. Approve edit request
exports.approveEditRequest = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: request, error: findError } = await supabase
      .from('edit_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError || !request) {
      return res.status(404).json({ message: 'Edit request not found.' });
    }

    // Update request status
    const { error: reqError } = await supabase
      .from('edit_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (reqError) throw reqError;

    // Unlock student profile
    const { error: stuError } = await supabase
      .from('students')
      .update({ profile_status: 'approved_edit', updated_at: new Date().toISOString() })
      .eq('id', request.student_id);
    if (stuError) throw stuError;

    return res.status(200).json({ message: 'Edit request approved successfully. Student is unlocked.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error approving edit request.' });
  }
};

// 8. Reject edit request
exports.rejectEditRequest = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: request, error: findError } = await supabase
      .from('edit_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError || !request) {
      return res.status(404).json({ message: 'Edit request not found.' });
    }

    const { error: reqError } = await supabase
      .from('edit_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (reqError) throw reqError;

    const { error: stuError } = await supabase
      .from('students')
      .update({ profile_status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', request.student_id);
    if (stuError) throw stuError;

    return res.status(200).json({ message: 'Edit request rejected successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error rejecting edit request.' });
  }
};

// 9. Sync to Google Sheets
exports.syncGoogleSheets = async (req, res) => {
  try {
    const { data: settingsRows } = await supabase
      .from('admin_settings')
      .select('*')
      .in('key', ['google_sheets_id', 'google_sheets_client_email', 'google_sheets_private_key', 'admin_col1_title', 'admin_col2_title', 'admin_col3_title']);

    const settings = {};
    (settingsRows || []).forEach(r => { settings[r.key] = r.value; });

    const sheetId = settings.google_sheets_id;
    const clientEmail = settings.google_sheets_client_email;
    const privateKey = settings.google_sheets_private_key;

    const titles = {
      admin_col1_title: settings.admin_col1_title || 'Current Status',
      admin_col2_title: settings.admin_col2_title || 'Working Company Name',
      admin_col3_title: settings.admin_col3_title || 'Salary'
    };

    // Fetch all students
    const { data: students } = await supabase
      .from('students')
      .select('*')
      .order('ut_no', { ascending: true });

    const headers = [
      'UT No', 'Full Name', 'Phone Number', 'NIC Number', 'District',
      'Beneficiary Name', 'Blossom Trust Amount', 'Bank Name', 'Account Number',
      'Branch', 'Branch Name', 'Branch Code',
      titles.admin_col1_title, titles.admin_col2_title, titles.admin_col3_title,
      'Dropout Reason', 'Dropout Date', 'Low Alternance Reason', 'Low Alternance Hours'
    ];

    const rows = (students || []).map(s => [
      s.ut_no || '', s.full_name || '', s.phone_number || '', s.nic_number || '',
      s.district || '', s.beneficiary_name || '', s.blossom_trust_amount || 0,
      s.bank_name || '', s.account_no || '', s.branch || '', s.branch_name || '',
      s.branch_code || '',
      s.admin_col1_val || '', s.admin_col2_val || '', s.admin_col3_val || 0,
      s.dropout_reason || '', s.dropout_date || '',
      s.low_alternance_reason || '', s.low_alternance_hours || ''
    ]);

    if (!sheetId || !clientEmail || !privateKey) {
      return res.status(200).json({
        simulated: true,
        message: 'Sync simulation completed successfully! Configure real service account credentials to publish directly to Google Sheets.',
        recordsSynced: (students || []).length
      });
    }

    try {
      const formattedKey = privateKey.replace(/\\n/g, '\n');
      const auth = new google.auth.JWT(clientEmail, null, formattedKey, ['https://www.googleapis.com/auth/spreadsheets']);
      const sheets = google.sheets({ version: 'v4', auth });

      await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: 'Sheet1!A:Z' });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers, ...rows] }
      });

      return res.status(200).json({
        simulated: false,
        message: `Synced ${(students || []).length} student records to Google Sheet successfully!`,
        recordsSynced: (students || []).length
      });
    } catch (googleError) {
      console.error('Google Sheets API Error:', googleError);
      return res.status(500).json({ message: 'Failed to connect to Google Sheets API. Error: ' + googleError.message });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error during sheets synchronization.' });
  }
};

// 10a. Date-Filterable Analytics Stats — for 3D Pie Chart dashboard widget
// NOTE: This endpoint is intentionally NOT cached. Every request hits the DB live.
exports.getAnalyticsStats = async (req, res) => {
  const { year, month } = req.query; // month: 1-12 (optional), year: e.g. 2026 (optional)

  // Force no caching at every layer (browser, CDN, proxy)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Analytics-Timestamp', Date.now().toString());

  try {
    // Build date range filter
    let dateFilter = null;
    if (year) {
      const y = parseInt(year, 10);
      if (month) {
        const m = parseInt(month, 10);
        const start = new Date(y, m - 1, 1).toISOString();
        const end   = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
        dateFilter = { start, end };
      } else {
        dateFilter = {
          start: new Date(y, 0, 1).toISOString(),
          end:   new Date(y, 11, 31, 23, 59, 59, 999).toISOString()
        };
      }
    }

    const applyDate = (q) => {
      if (!dateFilter) return q;
      return q.gte('created_at', dateFilter.start).lte('created_at', dateFilter.end);
    };

    // Always build a fresh Supabase query — never use cached variables
    const base = () => supabase.from('students').select('*', { count: 'exact', head: true });

    // ── Run all counts in parallel — each is a fresh, independent DB query ──
    // NOTE: course_completion_status "Not Started" bucket uses three separate
    // queries (null + 'Not Started' + 'Not Updated') then sums client-side to
    // avoid Supabase .or() issues with space-containing values.
    // IMPORTANT: Promise.all result order MUST exactly match destructuring variable order.
const [
      { count: totalCount,            error: e0  },
      { count: dropoutCount,          error: e1  },
      { count: activeCount,           error: e2  },

      // ── Course Completion Status ──
      { count: completedCount,        error: e3  },
      { count: inProgressCount,       error: e4  },
      { count: notStartedCount,       error: e5  },   // 'Not Started'
      { count: notUpdatedCount,       error: e5b },   // 'Not Updated'
      { count: nullCompletionCount,   error: e5c },   // NULL

      // ── Employment Status ──
      { count: softwareEmpCount,      error: e6  },
      { count: otherEmpCount,         error: e7  },

      // ── Other Status ──
      { count: higherStudyCount,      error: e8  },
      { count: unemploymentCount,     error: e9  },
      { count: foreignCount,          error: e10 },

      // ── Student Type ──
      { count: blossomCount,          error: e11 },
      { count: nonBlossomCount,       error: e12 },

      // ── Course Specialization ──
      { count: fullStackSpecCount,    error: e13 },
      { count: frontEndSpecCount,     error: e14 }
    ] = await Promise.all([
      // Total & Dropout Status
      applyDate(base()),
      applyDate(base().eq('dropout_status', true)),
      applyDate(base().eq('dropout_status', false)),

      // Course Completion — each value as its own query (avoids .or() space issues)
      applyDate(base().eq('course_completion_status', 'Completed')),
      applyDate(base().eq('course_completion_status', 'In Progress')),
      applyDate(base().eq('course_completion_status', 'Not Started')),
      applyDate(base().eq('course_completion_status', 'Not Updated')),
      applyDate(base().is('course_completion_status', null)),

      // Employment Status
      applyDate(base().eq('employment_status', 'Software Industry Employment')),
      applyDate(base().eq('employment_status', 'Other Industry Employment')),

      // Other Status
      applyDate(base().eq('other_status', 'Higher Study')),
      applyDate(base().eq('other_status', 'Unemployment')),
      applyDate(base().eq('other_status', 'Foreign')),

      // Student Type
      applyDate(base().eq('student_type', 'blossom')),
      applyDate(base().eq('student_type', 'non_blossom')),

      // Course Specialization
      applyDate(base().eq('course_specialization', 'Full Stack Development')),
      applyDate(base().eq('course_specialization', 'Front End'))
    ]);

    // Validate each count to avoid undefined/null values and log warnings if needed
    const ensureNumber = (name, val) => {
      if (val == null) {
        console.warn(`${name} returned null/undefined, defaulting to 0`);
        return 0;
      }
      return val;
    };

    const totalCountN = ensureNumber('totalCount', totalCount);
    const dropoutCountN = ensureNumber('dropoutCount', dropoutCount);
    const activeCountN = ensureNumber('activeCount', activeCount);
    const completedCountN = ensureNumber('completedCount', completedCount);
    const inProgressCountN = ensureNumber('inProgressCount', inProgressCount);
    const notStartedCountN = ensureNumber('notStartedCount', notStartedCount);
    const notUpdatedCountN = ensureNumber('notUpdatedCount', notUpdatedCount);
    const nullCompletionCountN = ensureNumber('nullCompletionCount', nullCompletionCount);
    const softwareEmpCountN = ensureNumber('softwareEmpCount', softwareEmpCount);
    const otherEmpCountN = ensureNumber('otherEmpCount', otherEmpCount);
    const higherStudyCountN = ensureNumber('higherStudyCount', higherStudyCount);
    const unemploymentCountN = ensureNumber('unemploymentCount', unemploymentCount);
    const foreignCountN = ensureNumber('foreignCount', foreignCount);
    const blossomCountN = ensureNumber('blossomCount', blossomCount);
    const nonBlossomCountN = ensureNumber('nonBlossomCount', nonBlossomCount);
    const fullStackSpecCountN = ensureNumber('fullStackSpecCount', fullStackSpecCount);
    const frontEndSpecCountN = ensureNumber('frontEndSpecCount', frontEndSpecCount);

    // Aggregate "not started" bucket using validated counts
    const notStartedTotalN = (notStartedCountN || 0) + (notUpdatedCountN || 0) + (nullCompletionCountN || 0);

    // Log raw counts for debugging (server logs only)
    console.log('RAW ANALYTICS COUNTS:', {
      totalCount: totalCountN,
      dropoutCount: dropoutCountN,
      activeCount: activeCountN,
      completedCount: completedCountN,
      inProgressCount: inProgressCountN,
      notStartedCount: notStartedCountN,
      notUpdatedCount: notUpdatedCountN,
      nullCompletionCount: nullCompletionCountN,
      softwareEmpCount: softwareEmpCountN,
      otherEmpCount: otherEmpCountN,
      higherStudyCount: higherStudyCountN,
      unemploymentCount: unemploymentCountN,
      foreignCount: foreignCountN,
      blossomCount: blossomCountN,
      nonBlossomCount: nonBlossomCountN,
      fullStackSpecCount: fullStackSpecCountN,
      frontEndSpecCount: frontEndSpecCountN,
      notStartedTotal: notStartedTotalN
    });

    // Store previous counts for diff logging (only server logs)
    if (typeof previousAnalyticsCounts !== 'undefined') {
      const diffs = {};
      const keys = Object.keys({ totalCountN, dropoutCountN, activeCountN, completedCountN, inProgressCountN, notStartedTotalN, softwareEmpCountN, otherEmpCountN, higherStudyCountN, unemploymentCountN, foreignCountN, blossomCountN, nonBlossomCountN, fullStackSpecCountN, frontEndSpecCountN });
      keys.forEach(k => {
        if (previousAnalyticsCounts && previousAnalyticsCounts[k] !== undefined && previousAnalyticsCounts[k] !== eval(k)) {
          diffs[k] = { previous: previousAnalyticsCounts[k], current: eval(k) };
        }
      });
      if (Object.keys(diffs).length) console.log('Analytics count changes since last request:', diffs);
    }
    previousAnalyticsCounts = {
      totalCountN,
      dropoutCountN,
      activeCountN,
      completedCountN,
      inProgressCountN,
      notStartedTotalN,
      softwareEmpCountN,
      otherEmpCountN,
      higherStudyCountN,
      unemploymentCountN,
      foreignCountN,
      blossomCountN,
      nonBlossomCountN,
      fullStackSpecCountN,
      frontEndSpecCountN
    };

    // Collect query errors into an array for reporting
    const queryErrors = [];
    const errorList = [e0, e1, e2, e3, e4, e5, e5b, e5c, e6, e7, e8, e9, e10, e11, e12, e13, e14];
    errorList.forEach(err => { if (err) queryErrors.push(err); });
    if (queryErrors.length > 0) {
      console.warn('getAnalyticsStats: some sub-queries had errors:', queryErrors);
    }

    // Return response using validated counts
    return res.status(200).json({
      total: totalCountN || 0,
      // Include a server-side timestamp so the client can verify freshness
      fetchedAt: new Date().toISOString(),
      dateFilter: dateFilter ? { year, month: month || null } : null,

      // 1. Dropout Status
      dropoutStatus: {
        active: activeCountN || 0,
        dropped: dropoutCountN || 0
      },

      // 2. Course Completion Status
      courseCompletionStatus: {
        completed: completedCountN || 0,
        inProgress: inProgressCountN || 0,
        notStarted: notStartedTotalN
      },

      // 3. Employment Status
      employmentStatus: {
        software: softwareEmpCountN || 0,
        other: otherEmpCountN || 0
      },

      // 4. Other Status
      otherStatus: {
        higherStudy: higherStudyCountN || 0,
        unemployment: unemploymentCountN || 0,
        foreign: foreignCountN || 0
      },

      // 5. Student Type
      studentTypes: {
        blossom: blossomCountN || 0,
        nonBlossom: nonBlossomCountN || 0
      },

      // 6. Course Specialization
      courseSpecialization: {
        fullStack: fullStackSpecCountN || 0,
        frontEnd: frontEndSpecCountN || 0
      }
    });
  } catch (error) {
    console.error('getAnalyticsStats error:', error);
    return res.status(500).json({ message: 'Error retrieving analytics stats.' });
  }
};

// 10. Dashboard Stats — efficient count queries
exports.getStats = async (req, res) => {
  try {
    // Use a short 5-second cache window to reduce DB load while still serving near-live data.
    // The cache is explicitly invalidated in updateAdminColumns after each student update.
    const cachedStats = adminCache.get('dashboard_stats');
    if (cachedStats) return res.status(200).json(cachedStats);

    const [
      { count: totalCount },
      { count: pendingCount },
      { count: dropoutCount },
      { count: lowAltCount },
      
      // Pie 1: Completed vs Dropped Out
      { count: completedCount },
      
      // Pie 2: Course splits (Non-Blossom)
      { count: fullStackCount },
      { count: frontEndCount },
      
      // Pie 3: Employment status
      { count: employedCount },
      { count: internshipCount },
      { count: inTrainingCount },
      { count: higherStudiesCount },
      { count: unemployedCount },
      
      // Pie 4: Student Type
      { count: blossomCount },
      { count: nonBlossomCount },

      // NEW Pie 2: Course Specialization splits
      { count: fullStackSpecCount },
      { count: frontEndSpecCount },

      // NEW Pie 3: Employment status splits
      { count: softwareEmpCount },
      { count: otherEmpCount },

      // NEW Pie 4: Other status splits
      { count: higherStudyCount },
      { count: unemploymentCount },
      { count: foreignCount }
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('edit_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('dropout_status', true),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('low_attendance_status', true),
      
      // Pie 1: Completed vs Dropped Out
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('dropout_status', false).in('admin_col1_val', ['Employed', 'Internship', 'In Training', 'Higher Studies']),
      
      // Pie 2: Course splits
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('course_name', 'Full Stack Developer'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('course_name', 'Front End Developer'),
      
      // Pie 3: Employment status
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('admin_col1_val', 'Employed'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('admin_col1_val', 'Internship'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('admin_col1_val', 'In Training'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('admin_col1_val', 'Higher Studies'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('admin_col1_val', 'Unemployed'),
      
      // Pie 4: Student Type
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('student_type', 'blossom'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('student_type', 'non_blossom'),

      // NEW Pie 2: Course Specialization splits
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('course_specialization', 'Full Stack Development'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('course_specialization', 'Front End'),

      // NEW Pie 3: Employment status splits
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('employment_status', 'Software Industry Employment'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('employment_status', 'Other Industry Employment'),

      // NEW Pie 4: Other status splits
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('other_status', 'Higher Study'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('other_status', 'Unemployment'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('other_status', 'Foreign')
    ]);

    const stats = {
      total: totalCount || 0,
      pendingRequests: pendingCount || 0,
      dropouts: dropoutCount || 0,
      lowAlternance: lowAltCount || 0,
      
      charts: {
        completedVsDropped: {
          completed: completedCount || 0,
          dropped: dropoutCount || 0
        },
        courses: {
          fullStack: fullStackCount || 0,
          frontEnd: frontEndCount || 0
        },
        employment: {
          employed: employedCount || 0,
          internship: internshipCount || 0,
          inTraining: inTrainingCount || 0,
          higherStudies: higherStudiesCount || 0,
          unemployed: unemployedCount || 0
        },
        studentTypes: {
          blossom: blossomCount || 0,
          nonBlossom: nonBlossomCount || 0
        },
        courseSpecialization: {
          fullStack: fullStackSpecCount || 0,
          frontEnd: frontEndSpecCount || 0
        },
        employmentStatus: {
          software: softwareEmpCount || 0,
          other: otherEmpCount || 0
        },
        otherStatus: {
          higherStudy: higherStudyCount || 0,
          unemployment: unemploymentCount || 0,
          foreign: foreignCount || 0
        }
      }
    };

    adminCache.set('dashboard_stats', stats, 5); // Short 5s cache; invalidated on every student update

    return res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error retrieving dashboard stats.' });
  }
};
