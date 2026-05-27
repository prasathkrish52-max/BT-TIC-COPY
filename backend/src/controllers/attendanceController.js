const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const csv = require('csv-parser');
const { Readable } = require('stream');
const supabase = require('../models/supabaseClient');
const { adminCache } = require('./adminController');

// Helper to safely extract cell values from exceljs
const getCellValue = (cell) => {
  if (!cell) return '';
  let val = cell.value;
  if (val === undefined || val === null) return '';
  
  // Extract formula results or plain text/numbers safely from complex object values
  if (typeof val === 'object') {
    if (val.result !== undefined && val.result !== null) {
      val = val.result;
    } else if (val.text !== undefined && val.text !== null) {
      return String(val.text);
    } else if (Array.isArray(val.richText)) {
      return val.richText.map(t => t.text || '').join('');
    } else if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    } else if (val.formula !== undefined) {
      // Return empty if formula exists but no computed result is cached
      return '';
    }
  }
  
  // Handle percentage formatting dynamically (e.g. 0.85 formatted in Excel as 85%)
  if (typeof val === 'number' && cell.numFmt && String(cell.numFmt).includes('%')) {
    return String(val * 100) + '%';
  }
  return String(val !== undefined && val !== null ? val : '').trim();
};

// Robust student unique identifier matching helper
const findMatchedStudent = (excelUt, allStudents) => {
  if (!excelUt) return null;
  const cleanExcel = excelUt.toString().trim();
  const lowerExcel = cleanExcel.toLowerCase();
  const alphaExcel = lowerExcel.replace(/[^a-z0-9]/g, '');

  if (!alphaExcel) return null;

  // Level 1: Exact Match (trimmed, case-insensitive)
  let match = allStudents.find(s => s.ut_no && s.ut_no.trim().toLowerCase() === lowerExcel);
  if (match) return match;

  // Level 2: Student ID integer Match (if Excel unique identifier matches primary ID directly)
  const excelId = parseInt(cleanExcel, 10);
  if (!isNaN(excelId) && String(excelId) === cleanExcel) {
    match = allStudents.find(s => s.id === excelId);
    if (match) return match;
  }

  // Level 3: Fully Sanitized Alphanumeric Match (removes all dashes, spaces, slashes)
  match = allStudents.find(s => {
    if (!s.ut_no) return false;
    const alphaDb = s.ut_no.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return alphaDb === alphaExcel;
  });
  if (match) return match;

  // Level 4: Suffix / Prefix Strip / Substring Match (handles e.g. "UT011200" vs "011200", or "TIC-2026-001" vs "2026-001")
  if (alphaExcel.length >= 3) {
    match = allStudents.find(s => {
      if (!s.ut_no) return false;
      const alphaDb = s.ut_no.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return alphaDb.endsWith(alphaExcel) || alphaExcel.endsWith(alphaDb);
    });
    if (match) return match;
  }

  return null;
};

// Parse Excel Buffer
const parseExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Excel file is empty');

  const records = [];
  let headerRowIndex = 1;
  let headersFound = false;

  // Find header row using getCellValue to avoid richText objects causing issues
  for (let r = 1; r <= 10; r++) {
    const row = worksheet.getRow(r);
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(getCellValue(cell).trim().toLowerCase());
    });
    if (values.some(v => v.includes('ut no') || v.includes('ut_no') || v.includes('utnumber') || v.includes('ut number') || v.includes('student id') || v.includes('student_id')) && 
        values.some(v => v.includes('attendance') || v.includes('%') || v.includes('percent'))) {
      headerRowIndex = r;
      headersFound = true;
      break;
    }
  }

  if (!headersFound) throw new Error('Could not find required headers (UT No, Attendance %) in Excel.');

  const headerRow = worksheet.getRow(headerRowIndex);
  const headerMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const headerVal = getCellValue(cell).trim().toLowerCase();
    if (headerVal) {
      headerMap[headerVal] = colNumber;
    }
  });

  const getCol = (names) => {
    for (const name of names) {
      const match = Object.keys(headerMap).find(k => k.includes(name));
      if (match) return headerMap[match];
    }
    return null;
  };

  const utCol = getCol(['ut no', 'ut_no', 'utno', 'ut number', 'student id', 'student_id']);
  const attCol = getCol(['attendance', 'percent', '%']);

  if (!utCol || !attCol) throw new Error('Missing UT No or Attendance % column in Excel.');

  // Use standard for loop to ensure absolutely no physical rows are skipped during parsing
  const totalRows = worksheet.rowCount;
  for (let rowNumber = headerRowIndex + 1; rowNumber <= totalRows; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const utNo = getCellValue(row.getCell(utCol)).trim();
    let attVal = getCellValue(row.getCell(attCol)).trim();

    if (utNo) {
      const hasPercentSign = attVal.includes('%');
      // remove % sign if present
      attVal = attVal.replace(/%/g, '');
      let percentage = parseFloat(attVal);
      if (!isNaN(percentage)) {
        // Decimal percentage normalization (e.g. 0.85 -> 85%)
        // Avoid double-conversion if the cell already had percentage formatting (indicated by percent sign)
        if (!hasPercentSign && percentage >= 0 && percentage <= 1) {
          percentage = percentage * 100;
        }
        records.push({ 
          utNo, 
          attendancePercentage: Math.round(percentage),
          rowNumber
        });
      } else {
        console.warn(`⚠️ Skipped Excel Row ${rowNumber}: Invalid attendance value "${attVal}" for UT No "${utNo}"`);
      }
    }
  }

  return records;
};

// Parse CSV Buffer
const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer.toString('utf-8'));
    let utKey = null;
    let attKey = null;

    stream
      .pipe(csv())
      .on('headers', (headers) => {
        utKey = headers.find(h => {
          const l = h.toLowerCase();
          return l.includes('ut no') || l.includes('ut_no') || l.includes('utnumber') || l.includes('ut number') || l.includes('student id') || l.includes('student_id');
        });
        attKey = headers.find(h => h.toLowerCase().includes('attendance') || h.toLowerCase().includes('%') || h.toLowerCase().includes('percent'));
        if (!utKey || !attKey) {
          reject(new Error('Missing UT No or Attendance % column in CSV.'));
        }
      })
      .on('data', (data) => {
        if (utKey && attKey && data[utKey]) {
          const utNo = data[utKey].trim();
          let attVal = String(data[attKey] || '').trim();
          const hasPercentSign = attVal.includes('%');
          attVal = attVal.replace(/%/g, '');
          let percentage = parseFloat(attVal);
          if (utNo && !isNaN(percentage)) {
            if (!hasPercentSign && percentage >= 0 && percentage <= 1) {
              percentage = percentage * 100;
            }
            results.push({ utNo, attendancePercentage: Math.round(percentage) });
          }
        }
      })
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

// Parse PDF Buffer (Structured table/list format)
const parsePDF = async (buffer) => {
  const data = await pdfParse(buffer);
  const text = data.text;
  const lines = text.split('\n');
  const records = [];

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    // More flexible match for UT numbers (e.g. TIC-2026-001, UT011200, UT-0112-00)
    const utMatch = cleanLine.match(/((?:TIC|UT)[-]?\d{3,}[-]?\d*)/i) || cleanLine.match(/([a-zA-Z0-9-]+[0-9]+-[0-9]+)/);
    
    if (utMatch) {
      const utNo = utMatch[1];
      // Find a percentage value in the line (e.g., 85%, 85.5%, or just 85 at the end)
      const pctMatch = cleanLine.match(/(\d+(?:\.\d+)?)\s*%/);
      let percentage = null;
      if (pctMatch) {
        percentage = parseFloat(pctMatch[1]);
      } else {
        // Fallback: look for the last number in the line
        const tokens = cleanLine.split(/\s+/);
        const lastToken = tokens[tokens.length - 1];
        if (!isNaN(parseFloat(lastToken))) {
          percentage = parseFloat(lastToken);
        }
      }

      if (percentage !== null && !isNaN(percentage)) {
        if (percentage >= 0 && percentage <= 1) {
          percentage = percentage * 100;
        }
        records.push({ utNo, attendancePercentage: Math.round(percentage) });
      }
    }
  }

  if (records.length === 0) {
    throw new Error('Could not extract any structured attendance data from the PDF. Ensure it contains UT numbers and percentage values.');
  }

  return records;
};

exports.uploadAttendance = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or file format is invalid.' });
  }

  const { month, year, threshold } = req.body;
  if (!month || !year || !threshold) {
    return res.status(400).json({ message: 'Month, Year, and Threshold are required.' });
  }

  const thresholdValue = parseFloat(threshold);
  if (isNaN(thresholdValue)) {
    return res.status(400).json({ message: 'Threshold must be a valid number.' });
  }

  try {
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let records = [];

    if (ext === 'xlsx' || ext === 'xls') {
      records = await parseExcel(req.file.buffer);
    } else if (ext === 'csv') {
      records = await parseCSV(req.file.buffer);
    } else if (ext === 'pdf') {
      records = await parsePDF(req.file.buffer);
    } else {
      return res.status(400).json({ message: 'Unsupported file format.' });
    }

    if (records.length === 0) {
      return res.status(400).json({ message: 'No valid attendance records found in the file.' });
    }

    const cleanMonth = month.trim().toLowerCase();
    const cleanYear = Number(year);

    // Fetch all student records once from DB to build lookup maps for robust offline matching
    const { data: allStudents, error: fetchError } = await supabase
      .from('students')
      .select('id, ut_no, full_name');

    if (fetchError) {
      throw new Error(`Failed to fetch student list for matching: ${fetchError.message}`);
    }

    console.log(`--- Starting Attendance Processing ---`);
    console.log(`Uploaded file: ${req.file.originalname}`);
    console.log(`Month: ${cleanMonth}, Year: ${cleanYear}`);
    console.log(`Low Attendance Threshold: ${thresholdValue}%`);
    console.log(`Total parsed records from file: ${records.length}`);

    let updatedCount = 0;
    let notFoundCount = 0;
    const unmatchedRecords = [];

    for (const record of records) {
      console.log(`Excel Row Data: Row ${record.rowNumber || 'N/A'} - UT No: "${record.utNo}", Attendance: ${record.attendancePercentage}%`);

      const matchedStudent = findMatchedStudent(record.utNo, allStudents);

      if (matchedStudent) {
        console.log(`✅ Matched student: "${record.utNo}" -> DB UT No: "${matchedStudent.ut_no}" (ID: ${matchedStudent.id}, Name: "${matchedStudent.full_name}")`);
        
        const lowAttendance = record.attendancePercentage < thresholdValue;

        try {
          // Update student profile with percentage, month, and low attendance status
          const { error: studentUpdateError } = await supabase
            .from('students')
            .update({
              attendance_percentage: record.attendancePercentage,
              last_attendance_month: `${cleanMonth} ${cleanYear}`,
              low_attendance_status: lowAttendance,
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedStudent.id);

          if (studentUpdateError) throw studentUpdateError;

          // Remove existing duplicate attendance for same student, month, and year if it exists
          const { error: historyDeleteError } = await supabase
            .from('attendance_history')
            .delete()
            .eq('student_id', matchedStudent.id)
            .eq('month', cleanMonth)
            .eq('year', cleanYear);

          if (historyDeleteError) throw historyDeleteError;

          // Insert into history
          const { error: historyInsertError } = await supabase
            .from('attendance_history')
            .insert({
              student_id: matchedStudent.id,
              month: cleanMonth,
              year: cleanYear,
              attendance_percentage: record.attendancePercentage,
              uploaded_file: req.file.originalname
            });

          if (historyInsertError) throw historyInsertError;

          updatedCount++;
        } catch (dbError) {
          console.error(`❌ DB error updating student "${matchedStudent.full_name}" (ID: ${matchedStudent.id}):`, dbError.message);
          unmatchedRecords.push(`${record.utNo} (DB error: ${dbError.message})`);
          notFoundCount++;
        }
      } else {
        console.warn(`❌ Unmatched student: UT No = "${record.utNo}" (No student found in DB)`);
        unmatchedRecords.push(record.utNo);
        notFoundCount++;
      }
    }

    console.log(`--- Attendance Processing Finished ---`);
    console.log(`Success: Updated ${updatedCount} students.`);
    console.log(`Failed/Unmatched: ${notFoundCount} students.`);
    if (unmatchedRecords.length > 0) {
      console.warn(`Unmatched student list:`, unmatchedRecords);
    }

    // Invalidate all administrative caches so the UI reflects new counts
    if (adminCache) {
      adminCache.flushAll();
    }

    return res.status(200).json({
      message: `Attendance processing complete. Updated ${updatedCount} students. ${notFoundCount} students not found.`,
      updated: updatedCount,
      notFound: notFoundCount,
      unmatched: unmatchedRecords
    });

  } catch (error) {
    console.error('Attendance Upload Error:', error);
    return res.status(500).json({ message: 'Error processing attendance file: ' + error.message });
  }
};

exports.clearAttendance = async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) {
    return res.status(400).json({ message: 'Month and Year are required to clear attendance.' });
  }

  const cleanMonth = month.trim().toLowerCase();
  const cleanYear = Number(year);

  try {
    console.log("CLEAR REQUEST:", cleanMonth, cleanYear);

    // 1. Fetch history records first before deleting
    const { data: historyRecords, error: historyFetchError } = await supabase
      .from('attendance_history')
      .select('student_id')
      .ilike('month', `%${cleanMonth}%`)
      .eq('year', cleanYear);

    if (historyFetchError) throw historyFetchError;

    let deletedData = [];
    if (historyRecords && historyRecords.length > 0) {
      const { data: deleteResult, error: deleteError } = await supabase
        .from('attendance_history')
        .delete()
        .ilike('month', `%${cleanMonth}%`)
        .eq('year', cleanYear)
        .select();
      
      if (deleteError) throw deleteError;
      deletedData = deleteResult || [];
    }

    console.log("DELETED HISTORY ROWS:", deletedData);

    // 2. Fetch students to update based on last_attendance_month
    const { data: studentsWithMonth, error: selectError } = await supabase
      .from('students')
      .select('id')
      .ilike('last_attendance_month', `%${cleanMonth}%${cleanYear}%`);

    if (selectError) throw selectError;

    // 3. Combine student IDs from history records and student table matches for robustness
    const historyStudentIds = (historyRecords || []).map(r => r.student_id);
    const studentIdsWithMonth = (studentsWithMonth || []).map(s => s.id);
    const uniqueIdsToClear = Array.from(new Set([...historyStudentIds, ...studentIdsWithMonth]));

    let clearedStudentsCount = 0;
    if (uniqueIdsToClear.length > 0) {
      // Clear fields in a single atomic update operation to prevent partial updates
      const { data: updatedStudents, error: updateError } = await supabase
        .from('students')
        .update({
          attendance_percentage: null,
          last_attendance_month: null,
          low_attendance_status: false,
          updated_at: new Date().toISOString()
        })
        .in('id', uniqueIdsToClear)
        .select('id');

      if (updateError) throw updateError;
      clearedStudentsCount = updatedStudents ? updatedStudents.length : 0;
    }

    if ((!deletedData || deletedData.length === 0) && clearedStudentsCount === 0) {
      return res.status(404).json({ message: 'No attendance records or student flags found for the specified month and year. It may have already been cleared.' });
    }

    // 4. Invalidate all administrative cache keys to ensure fresh data
    if (adminCache) {
      adminCache.flushAll();
    }

    return res.status(200).json({
      message: `Successfully removed attendance records and reset flags for ${clearedStudentsCount} students for ${month} ${year}.`
    });
  } catch (error) {
    console.error('Clear Attendance Error:', error);
    return res.status(500).json({ message: 'Error clearing attendance data: ' + error.message });
  }
};
