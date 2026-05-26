const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const supabase = require('../models/supabaseClient');

// Helper to fetch custom column titles
const getColumnTitles = async () => {
  const { data: colTitles } = await supabase
    .from('admin_settings')
    .select('*')
    .in('key', ['admin_col1_title', 'admin_col2_title', 'admin_col3_title']);

  const titles = {
    admin_col1_title: 'Current Status',
    admin_col2_title: 'Working Company Name',
    admin_col3_title: 'Salary'
  };
  (colTitles || []).forEach(t => { titles[t.key] = t.value; });
  return titles;
};

// Helper to build Supabase query with filters
const buildFilteredQuery = (query, params) => {
  const { utNo, name, phoneNo, district, bank, beneficiaryName } = params;
  if (utNo) query = query.ilike('ut_no', `%${utNo}%`);
  if (name) query = query.ilike('full_name', `%${name}%`);
  if (phoneNo) query = query.ilike('phone_number', `%${phoneNo}%`);
  if (district) query = query.eq('district', district);
  if (bank) query = query.eq('bank_name', bank);
  if (beneficiaryName) query = query.ilike('beneficiary_name', `%${beneficiaryName}%`);
  return query;
};

// Helper to fetch all records in chunks (bypasses 1000 limit and saves memory spikes)
const fetchAllRecords = async (queryBuilderFn) => {
  let allRecords = [];
  let page = 0;
  const limit = 1000;
  while (true) {
    const from = page * limit;
    const to = from + limit - 1;
    let query = queryBuilderFn();
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRecords = allRecords.concat(data);
    if (data.length < limit) break;
    page++;
  }
  return allRecords;
};

// Generates an Excel workbook from student list
const generateExcelHelper = async (students, title, colTitles) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');

  const headers = [
    'No', 'UT No', 'Full Name', 'Phone Number', 'NIC Number', 'District',
    'Beneficiary Name', 'Blossom Trust Amount', 'Bank Name', 'Account Number',
    'Branch', 'Branch Name', 'Branch Code',
    'Current Status', 'Working Company Name', 'Salary'
  ];

  worksheet.mergeCells(1, 1, 1, headers.length);
  worksheet.getCell('A1').value = `Blossom Trust - ${title}`;
  worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 40;

  worksheet.getRow(3).values = headers;
  worksheet.getRow(3).height = 25;
  worksheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (let col = 1; col <= headers.length; col++) {
    const cell = worksheet.getCell(3, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  }

  students.forEach((s, idx) => {
    const rowValues = [
      idx + 1,
      s.ut_no || '', s.full_name || '', s.phone_number || '', s.nic_number || '',
      s.district || '', s.beneficiary_name || '', s.blossom_trust_amount || 0,
      s.bank_name || '', s.account_no || '', s.branch || '', s.branch_name || '',
      s.branch_code || '',
      s.admin_col1_val || '', s.admin_col2_val || '', s.admin_col3_val || 0
    ];

    if (idx === 0) {
      console.log("EXPORT ROW SAMPLE:", {
        no: rowValues[0], ut_no: rowValues[1], full_name: rowValues[2], phone_number: rowValues[3],
        nic_number: rowValues[4], district: rowValues[5], beneficiary_name: rowValues[6],
        blossom_trust_amount: rowValues[7], bank_name: rowValues[8], account_number: rowValues[9],
        branch: rowValues[10], branch_name: rowValues[11], branch_code: rowValues[12],
        current_status: rowValues[13], working_company_name: rowValues[14], salary: rowValues[15]
      });
    }

    const row = worksheet.addRow(rowValues);
    const bgArgb = idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
    for (let col = 1; col <= headers.length; col++) {
      const cell = row.getCell(col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
      if (col === 7 || col === 15) cell.numFmt = '#,##0.00';
    }
  });

  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.row === 1) return;
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.max(maxLen + 4, 12);
  });

  return workbook;
};

// Generates a PDF document from student list
const generatePDFHelper = (res, students, title, colTitles) => {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  doc.fillColor('#1E1B4B').fontSize(20).text('Blossom Trust Student Reporting Portal', 30, 25);
  doc.fontSize(12).fillColor('#6366F1').text(title, 30, 50);
  doc.fontSize(9).fillColor('#6B7280').text(`Generated on: ${new Date().toLocaleDateString()}`, 650, 50);
  doc.moveDown(1.5);

  const tableHeaders = [
    { label: 'No', width: 25, align: 'center' },
    { label: 'UT No', width: 50, align: 'center' },
    { label: 'Full Name', width: 80, align: 'left' },
    { label: 'Phone No', width: 60, align: 'center' },
    { label: 'District', width: 40, align: 'left' },
    { label: 'Beneficiary Name', width: 75, align: 'left' },
    { label: 'Trust Amt', width: 55, align: 'right' },
    { label: 'Bank Name', width: 60, align: 'left' },
    { label: 'Account No', width: 65, align: 'center' },
    { label: 'Branch Name', width: 65, align: 'left' },
    { label: 'Br. Code', width: 40, align: 'center' },
    { label: colTitles.admin_col1_title, width: 60, align: 'left' },
    { label: colTitles.admin_col2_title, width: 60, align: 'left' },
    { label: colTitles.admin_col3_title, width: 45, align: 'right' }
  ];

  let startY = 80;
  const rowHeight = 22;

  const drawHeader = (y) => {
    doc.rect(30, y, 780, rowHeight).fill('#6366F1');
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
    let currentX = 30;
    tableHeaders.forEach(th => {
      doc.text(th.label, currentX, y + 7, { width: th.width, align: th.align });
      currentX += th.width;
    });
    doc.strokeColor('#4F46E5').lineWidth(1).rect(30, y, 780, rowHeight).stroke();
  };

  drawHeader(startY);
  startY += rowHeight;

  students.forEach((s, index) => {
    if (startY > 520) {
      doc.addPage();
      startY = 40;
      drawHeader(startY);
      startY += rowHeight;
    }

    doc.rect(30, startY, 780, rowHeight).fill(index % 2 === 0 ? '#F9FAFB' : '#FFFFFF');
    doc.fillColor('#374151').fontSize(8).font('Helvetica');

    let currentX = 30;
    const fields = [
      String(index + 1),
      s.ut_no, s.full_name, s.phone_number, s.district, s.beneficiary_name,
      s.blossom_trust_amount ? s.blossom_trust_amount.toLocaleString() : '0',
      s.bank_name, s.account_no, s.branch_name, s.branch_code,
      s.admin_col1_val, s.admin_col2_val,
      s.admin_col3_val ? s.admin_col3_val.toLocaleString() : '0'
    ];
    fields.forEach((val, i) => {
      doc.text(val || '-', currentX, startY + 7, { width: tableHeaders[i].width, align: tableHeaders[i].align, ellipsis: true });
      currentX += tableHeaders[i].width;
    });

    doc.strokeColor('#E5E7EB').lineWidth(0.5).rect(30, startY, 780, rowHeight).stroke();
    startY += rowHeight;
  });

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#9CA3AF').text(`Page ${i + 1} of ${pages.count}`, 30, 565, { align: 'center', width: 782 });
  }
  doc.end();
};

// 1. Full Student Report
exports.fullReport = async (req, res) => {
  const format = req.query.format || 'excel';
  try {
    const colTitles = await getColumnTitles();
    const students = await fetchAllRecords(() => supabase.from('students').select('*').order('blossom_trust_amount', { ascending: false }));

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Full_Student_Report.pdf');
      generatePDFHelper(res, students || [], 'Full Student Report', colTitles);
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Full_Student_Report.xlsx');
      const workbook = await generateExcelHelper(students || [], 'Full Student Report', colTitles);
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to generate Full Student Report.' });
  }
};

// 2. Filtered Student Report
exports.filteredReport = async (req, res) => {
  const format = req.query.format || 'excel';
  try {
    const colTitles = await getColumnTitles();
    const students = await fetchAllRecords(() => {
      let query = supabase.from('students').select('*').order('blossom_trust_amount', { ascending: false });
      return buildFilteredQuery(query, req.query);
    });

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Filtered_Student_Report.pdf');
      generatePDFHelper(res, students || [], 'Filtered Student Report', colTitles);
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Filtered_Student_Report.xlsx');
      const workbook = await generateExcelHelper(students || [], 'Filtered Student Report', colTitles);
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to generate Filtered Student Report.' });
  }
};

// 3. Dropout Students Report
exports.dropoutReport = async (req, res) => {
  const format = req.query.format || 'excel';
  const month = req.query.month; // e.g. "February 2026"
  try {
    const students = await fetchAllRecords(() => {
      let query = supabase.from('students').select('*').eq('dropout_status', true);
      if (month) {
        const monthTrimmed = month.trim();
        let yyyy_mm = monthTrimmed;
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const parts = monthTrimmed.split(' ');
        if (parts.length === 2) {
          const mIndex = monthNames.indexOf(parts[0].toLowerCase());
          if (mIndex !== -1) {
            const mm = String(mIndex + 1).padStart(2, '0');
            yyyy_mm = `${parts[1]}-${mm}`; // "2026-02"
          }
        }
        query = query.or(`dropout_date.ilike.%${monthTrimmed}%,dropout_date.ilike.%${yyyy_mm}%`);
      }
      return query.order('dropout_date', { ascending: false });
    });

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const groups = {};
    const getMonthString = (dateStr) => {
      if (!dateStr) return 'Unknown Date';
      if (/[a-zA-Z]+\s\d{4}/.test(dateStr)) return dateStr;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      return dateStr;
    };

    if (students && students.length > 0) {
      students.forEach(s => {
        const m = getMonthString(s.dropout_date);
        if (!groups[m]) groups[m] = [];
        groups[m].push(s);
      });
    } else if (month) {
      groups[month.trim()] = [];
    } else {
      groups['Unknown Date'] = [];
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Dropout_Students_Report.pdf');
      doc.pipe(res);

      doc.fillColor('#991B1B').fontSize(18).text('Blossom Trust - Dropout Students Report', 30, 25);
      doc.fontSize(9).fillColor('#6B7280').text(`Generated on: ${new Date().toLocaleDateString()}`, 650, 30);
      doc.moveDown();

      const th = [
        { label: 'No', width: 25 },
        { label: 'UT No', width: 45 }, { label: 'Full Name', width: 90 },
        { label: 'Phone No', width: 65 }, { label: 'District', width: 45 },
        { label: 'Beneficiary', width: 75 }, { label: 'Trust Amt', width: 50 },
        { label: 'Bank Name', width: 70 }, { label: 'Branch', width: 60 },
        { label: 'Account No', width: 65 }, { label: 'Br. Code', width: 40 },
        { label: 'Reason', width: 90 }, { label: 'Date', width: 60 }
      ];
      let startY = 70; const rowHeight = 22;
      const drawHeader = (y) => {
        doc.rect(30, y, 780, rowHeight).fill('#EF4444');
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        let x = 30;
        th.forEach(h => { doc.text(h.label, x, y + 7, { width: h.width, align: 'left' }); x += h.width; });
      };

      for (const [groupMonth, groupStudents] of Object.entries(groups)) {
        if (startY > 500) { doc.addPage(); startY = 40; }
        doc.rect(30, startY, 780, rowHeight).fill('#FEE2E2');
        doc.fillColor('#991B1B').fontSize(10).font('Helvetica-Bold');
        doc.text(`Drop Out List - ${groupMonth}`, 35, startY + 6, { width: 770, align: 'left' });
        doc.strokeColor('#FCA5A5').lineWidth(1).rect(30, startY, 780, rowHeight).stroke();
        startY += rowHeight;

        if (groupStudents.length === 0) {
          doc.rect(30, startY, 780, rowHeight).fill('#FFFFFF');
          doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold');
          doc.text(`No Drop out for the month of ${groupMonth}`, 30, startY + 6, { width: 780, align: 'center' });
          doc.strokeColor('#FCA5A5').lineWidth(0.5).rect(30, startY, 780, rowHeight).stroke();
          startY += rowHeight + 10;
          continue;
        }

        drawHeader(startY); startY += rowHeight;
        groupStudents.forEach((s, idx) => {
          if (startY > 520) { doc.addPage(); startY = 40; drawHeader(startY); startY += rowHeight; }
          doc.rect(30, startY, 780, rowHeight).fill(idx % 2 === 0 ? '#FEF2F2' : '#FFFFFF');
          doc.fillColor('#374151').fontSize(7.5).font('Helvetica');
          let x = 30;
          [String(idx + 1), s.ut_no, s.full_name, s.phone_number, s.district, s.beneficiary_name, s.blossom_trust_amount ? String(s.blossom_trust_amount) : '0', s.bank_name, s.branch_name, s.account_no, s.branch_code, s.dropout_reason, s.dropout_date].forEach((v, i) => {
            doc.text(v || '-', x, startY + 7, { width: th[i].width, align: 'left', ellipsis: true }); x += th[i].width;
          });
          doc.strokeColor('#FCA5A5').lineWidth(0.5).rect(30, startY, 780, rowHeight).stroke();
          startY += rowHeight;
        });
        startY += 15;
      }
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.fontSize(8).fillColor('#9CA3AF').text(`Page ${i + 1} of ${pages.count}`, 30, 565, { align: 'center', width: 782 }); }
      doc.end();
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Dropout_Students_Report.xlsx');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Dropouts');
      const headers = ['No', 'UT No', 'Name', 'Phone No', 'District', 'Beneficiary Name', 'Blossom Trust Amount', 'Bank', 'Branch', 'Account No', 'Br. Code', 'Dropout Reason', 'Dropout Date'];
      
      worksheet.mergeCells(1, 1, 1, headers.length);
      worksheet.getCell('A1').value = 'Blossom Trust - Dropout Students Report';
      worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 40;
      
      let currentRow = 3;
      
      for (const [groupMonth, groupStudents] of Object.entries(groups)) {
        worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
        const titleCell = worksheet.getCell(currentRow, 1);
        titleCell.value = `Drop Out List - ${groupMonth}`;
        titleCell.font = { size: 12, bold: true, color: { argb: 'FF991B1B' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.getRow(currentRow).height = 30;
        
        for(let col=1; col<=headers.length; col++) {
           worksheet.getCell(currentRow, col).border = {
              top: { style: 'medium', color: {argb: 'FFFCA5A5'} },
              left: { style: 'medium', color: {argb: 'FFFCA5A5'} },
              bottom: { style: 'medium', color: {argb: 'FFFCA5A5'} },
              right: { style: 'medium', color: {argb: 'FFFCA5A5'} }
           };
        }
        currentRow++;

        if (groupStudents.length === 0) {
          worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
          const emptyCell = worksheet.getCell(currentRow, 1);
          emptyCell.value = `No Drop out for the month of ${groupMonth}`;
          emptyCell.font = { bold: true, color: { argb: 'FF374151' } };
          emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getRow(currentRow).height = 25;
          for(let col=1; col<=headers.length; col++) {
             worksheet.getCell(currentRow, col).border = {
                bottom: { style: 'thin', color: {argb: 'FFFCA5A5'} },
             };
          }
          currentRow += 2;
          continue;
        }

        const headerRow = worksheet.getRow(currentRow);
        headerRow.values = headers;
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.height = 25;
        for (let col = 1; col <= headers.length; col++) {
          const cell = worksheet.getCell(currentRow, col);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF87171' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        currentRow++;

        groupStudents.forEach((s, idx) => {
          worksheet.addRow([idx + 1, s.ut_no || '', s.full_name || '', s.phone_number || '', s.district || '', s.beneficiary_name || '', s.blossom_trust_amount || 0, s.bank_name || '', s.branch_name || '', s.account_no || '', s.branch_code || '', s.dropout_reason || '', s.dropout_date || '']);
          currentRow++;
        });
        currentRow++; // space between groups
      }

      worksheet.columns.forEach(col => {
        let m = 0;
        col.eachCell({ includeEmpty: true }, c => {
          if (c.row === 1 || (c.value && String(c.value).startsWith('Drop Out List -')) || (c.value && String(c.value).startsWith('No Drop out'))) return;
          const l = c.value ? String(c.value).length : 0;
          if (l > m) m = l;
        });
        col.width = Math.max(m + 4, 15);
      });
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to generate Dropout Students Report.' });
  }
};

// 4. Monthly Low Attendance Report
exports.monthlyLowAttendanceReport = async (req, res) => {
  const format = req.query.format || 'excel';
  const month = req.query.month; // e.g. "February 2026"
  try {
    const students = await fetchAllRecords(() => {
      let query = supabase.from('students').select('*').eq('low_attendance_status', true);
      if (month) {
        let searchMonth = month.trim(); // "2026-01"
        if (searchMonth.match(/^\d{4}-\d{2}$/)) {
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const [yyyy, mm] = searchMonth.split('-');
          const mIndex = parseInt(mm, 10) - 1;
          if (mIndex >= 0 && mIndex < 12) {
            searchMonth = `${monthNames[mIndex]} ${yyyy}`; // "January 2026"
          }
        }
        query = query.ilike('last_attendance_month', searchMonth);
      }
      return query.order('blossom_trust_amount', { ascending: false });
    });

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const groups = {};
    const getMonthString = (dateStr) => {
      if (!dateStr) return 'Unknown Date';
      if (/[a-zA-Z]+\s\d{4}/.test(dateStr)) return dateStr;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      return dateStr;
    };

    if (students && students.length > 0) {
      students.forEach(s => {
        const m = getMonthString(s.last_attendance_month);
        if (!groups[m]) groups[m] = [];
        groups[m].push(s);
      });
    } else if (month) {
      let mKey = month.trim();
      if (mKey.match(/^\d{4}-\d{2}$/)) {
        const [yyyy, mm] = mKey.split('-');
        const mIndex = parseInt(mm, 10) - 1;
        if (mIndex >= 0 && mIndex < 12) mKey = `${monthNames[mIndex]} ${yyyy}`;
      }
      groups[mKey] = [];
    } else {
      groups['Unknown Date'] = [];
    }

    const titleStr = 'Low Attendance Report';

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Low_Attendance_Report.pdf');
      doc.pipe(res);
      doc.fillColor('#C2410C').fontSize(18).text(titleStr, 30, 25);
      doc.fontSize(9).fillColor('#6B7280').text(`Generated on: ${new Date().toLocaleDateString()}`, 650, 30);
      doc.moveDown();
      
      const th = [
        { label: 'No', width: 25 },
        { label: 'UT No', width: 45 }, { label: 'Full Name', width: 90 },
        { label: 'Phone No', width: 65 }, { label: 'District', width: 45 },
        { label: 'Beneficiary', width: 75 }, { label: 'Trust Amt', width: 50 },
        { label: 'Bank Name', width: 70 }, { label: 'Branch', width: 65 },
        { label: 'Account No', width: 65 }, { label: 'Br. Code', width: 45 },
        { label: 'Reason', width: 100 }, { label: 'Att %', width: 40 }
      ];
      let startY = 70; const rowHeight = 22;
      const drawHeader = (y) => {
        doc.rect(30, y, 780, rowHeight).fill('#F97316');
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        let x = 30; th.forEach(h => { doc.text(h.label, x, y + 7, { width: h.width }); x += h.width; });
      };

      for (const [groupMonth, groupStudents] of Object.entries(groups)) {
        if (startY > 500) { doc.addPage(); startY = 40; }
        doc.rect(30, startY, 780, rowHeight).fill('#FFEDD5');
        doc.fillColor('#C2410C').fontSize(10).font('Helvetica-Bold');
        doc.text(`Low Attendance List - ${groupMonth}`, 35, startY + 6, { width: 770, align: 'left' });
        doc.strokeColor('#FDBA74').lineWidth(1).rect(30, startY, 780, rowHeight).stroke();
        startY += rowHeight;

        if (groupStudents.length === 0) {
          doc.rect(30, startY, 780, rowHeight).fill('#FFFFFF');
          doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold');
          doc.text(`No Low Attendance for the month of ${groupMonth}`, 30, startY + 6, { width: 780, align: 'center' });
          doc.strokeColor('#FDBA74').lineWidth(0.5).rect(30, startY, 780, rowHeight).stroke();
          startY += rowHeight + 10;
          continue;
        }

        drawHeader(startY); startY += rowHeight;
        groupStudents.forEach((s, idx) => {
          if (startY > 520) { doc.addPage(); startY = 40; drawHeader(startY); startY += rowHeight; }
          doc.rect(30, startY, 780, rowHeight).fill(idx % 2 === 0 ? '#FFF7ED' : '#FFFFFF');
          doc.fillColor('#374151').fontSize(7.5).font('Helvetica');
          let x = 30;
          [String(idx + 1), s.ut_no, s.full_name, s.phone_number, s.district, s.beneficiary_name, s.blossom_trust_amount ? String(s.blossom_trust_amount) : '0', s.bank_name, s.branch_name, s.account_no, s.branch_code, s.low_alternance_reason, s.attendance_percentage !== null ? `${s.attendance_percentage}%` : '0%'].forEach((v, i) => {
            doc.text(v || '-', x, startY + 7, { width: th[i].width, ellipsis: true }); x += th[i].width;
          });
          doc.strokeColor('#FED7AA').lineWidth(0.5).rect(30, startY, 780, rowHeight).stroke();
          startY += rowHeight;
        });
        startY += 15;
      }
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.fontSize(8).fillColor('#9CA3AF').text(`Page ${i + 1} of ${pages.count}`, 30, 565, { align: 'center', width: 782 }); }
      doc.end();
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Low_Attendance_Report.xlsx');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Low Attendance');
      const headers = ['No', 'UT No', 'Name', 'Phone No', 'District', 'Beneficiary Name', 'Blossom Trust Amount', 'Bank', 'Branch', 'Account No', 'Br. Code', 'Low Attendance Reason', 'Attendance %'];
      
      worksheet.mergeCells(1, 1, 1, headers.length);
      worksheet.getCell('A1').value = titleStr;
      worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 40;
      
      let currentRow = 3;

      for (const [groupMonth, groupStudents] of Object.entries(groups)) {
        worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
        const titleCell = worksheet.getCell(currentRow, 1);
        titleCell.value = `Low Attendance List - ${groupMonth}`;
        titleCell.font = { size: 12, bold: true, color: { argb: 'FFC2410C' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
        titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.getRow(currentRow).height = 30;
        
        for(let col=1; col<=headers.length; col++) {
           worksheet.getCell(currentRow, col).border = {
              top: { style: 'medium', color: {argb: 'FFFDBA74'} },
              left: { style: 'medium', color: {argb: 'FFFDBA74'} },
              bottom: { style: 'medium', color: {argb: 'FFFDBA74'} },
              right: { style: 'medium', color: {argb: 'FFFDBA74'} }
           };
        }
        currentRow++;

        if (groupStudents.length === 0) {
          worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
          const emptyCell = worksheet.getCell(currentRow, 1);
          emptyCell.value = `No Low Attendance for the month of ${groupMonth}`;
          emptyCell.font = { bold: true, color: { argb: 'FF374151' } };
          emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getRow(currentRow).height = 25;
          for(let col=1; col<=headers.length; col++) {
             worksheet.getCell(currentRow, col).border = {
                bottom: { style: 'thin', color: {argb: 'FFFDBA74'} },
             };
          }
          currentRow += 2;
          continue;
        }

        const headerRow = worksheet.getRow(currentRow);
        headerRow.values = headers;
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.height = 25;
        for (let col = 1; col <= headers.length; col++) {
          const cell = worksheet.getCell(currentRow, col);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        currentRow++;

        groupStudents.forEach((s, idx) => {
          worksheet.addRow([idx + 1, s.ut_no || '', s.full_name || '', s.phone_number || '', s.district || '', s.beneficiary_name || '', s.blossom_trust_amount || 0, s.bank_name || '', s.branch_name || '', s.account_no || '', s.branch_code || '', s.low_alternance_reason || '', s.attendance_percentage !== null ? s.attendance_percentage : 0]);
          currentRow++;
        });
        currentRow++; // extra space between groups
      }

      worksheet.columns.forEach(col => {
        let m = 0;
        col.eachCell({ includeEmpty: true }, c => {
          if (c.row === 1 || (c.value && String(c.value).startsWith('Low Attendance List -')) || (c.value && String(c.value).startsWith('No Low Attendance'))) return;
          const l = c.value ? String(c.value).length : 0;
          if (l > m) m = l;
        });
        col.width = Math.max(m + 4, 15);
      });
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to generate Low Attendance Report.' });
  }
};
