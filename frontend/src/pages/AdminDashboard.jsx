import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, UserCheck, ShieldAlert, FileSpreadsheet, 
  Search, Filter, Sliders, FileText, Download, Upload, 
  ChevronLeft, ChevronRight, X, Lock, Check, CheckSquare, 
  AlertTriangle, RefreshCw, Save, HelpCircle, Server, DollarSign
} from 'lucide-react';
import MonthDropdown from '../components/MonthDropdown';

const AdminDashboard = ({ setView }) => {
  const { token, logout, showToast, API_URL } = useAuth();
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('overview'); // overview, students, requests, reports, integration
  
  // Student List & Filtering States
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    utNo: '',
    name: '',
    phoneNo: '',
    beneficiaryName: '',
    bank: ''
  });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const limit = 50;

  // Selected Student Drawer
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [adminFieldInputs, setAdminFieldInputs] = useState({
    adminCol1Val: '',
    adminCol2Val: '',
    adminCol3Val: 0,
    blossomTrustAmount: 0,
    isDropout: false,
    dropoutReason: '',
    dropoutDate: '',
    isLowAlternance: false,
    lowAlternanceReason: '',
    lowAlternanceHours: ''
  });
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Edit Requests State
  const [editRequests, setEditRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Admin Custom Column Settings
  const [settings, setSettings] = useState({
    admin_col1_title: 'Current Status',
    admin_col2_title: 'Working Company Name',
    admin_col3_title: 'Salary (LKR)',
    google_sheets_id: '',
    google_sheets_client_email: '',
    google_sheets_private_key: ''
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    adminCol1Title: '',
    adminCol2Title: '',
    adminCol3Title: ''
  });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // File Upload State
  const [excelFile, setExcelFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Attendance Upload State
  const [attendanceFile, setAttendanceFile] = useState(null);
  const [attendanceMonth, setAttendanceMonth] = useState('January');
  const [attendanceYear, setAttendanceYear] = useState(new Date().getFullYear().toString());
  const [attendanceThreshold, setAttendanceThreshold] = useState('80');
  const [attendanceUploadLoading, setAttendanceUploadLoading] = useState(false);

  // Reports State
  const [reportMonth, setReportMonth] = useState('');
  const [dropoutMonth, setDropoutMonth] = useState('');
  const [reportThreshold, setReportThreshold] = useState('80');

  // Integration Sheets Settings
  const [sheetsForm, setSheetsForm] = useState({
    googleSheetsId: '',
    googleSheetsClientEmail: '',
    googleSheetsPrivateKey: ''
  });
  const [syncLoading, setSyncLoading] = useState(false);

  // Stats State
  const [stats, setStats] = useState({
    total: 0,
    pendingRequests: 0,
    dropouts: 0,
    lowAlternance: 0
  });

  const banks = [
    'Bank of Ceylon', "People's Bank", 'Commercial Bank', 'Hatton National Bank',
    'Sampath Bank', 'Amana Bank', 'National Savings Bank', 'DFCC Bank',
    'Seylan Bank', 'Nations Trust Bank', 'Pan Asia Banking Corporation', 'Union Bank'
  ];

  // 1. Fetch Admin Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
        setSettingsForm({
          adminCol1Title: data.admin_col1_title,
          adminCol2Title: data.admin_col2_title,
          adminCol3Title: data.admin_col3_title
        });
        setSheetsForm({
          googleSheetsId: data.google_sheets_id,
          googleSheetsClientEmail: data.google_sheets_client_email,
          googleSheetsPrivateKey: data.google_sheets_private_key
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 2. Fetch Student List
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: currentPage,
        limit,
        utNo: searchParams.utNo,
        name: searchParams.name,
        phoneNo: searchParams.phoneNo,
        beneficiaryName: searchParams.beneficiaryName,
        bank: searchParams.bank,
        _t: Date.now()
      }).toString();

      const res = await fetch(`${API_URL}/admin/students?${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok) {
        if (data.students && Array.isArray(data.students)) {
          data.students.sort((a, b) => Number(b.blossom_trust_amount || 0) - Number(a.blossom_trust_amount || 0));
        }
        setStudents(data.students);
        setTotalPages(data.pagination.totalPages);
        setTotalRecords(data.pagination.total);
      } else {
        showToast(data.message || 'Failed to load student list.', 'error');
      }
    } catch (err) {
      showToast('Error connecting to the server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch Edit Requests
  const fetchEditRequests = async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/edit-requests?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setEditRequests(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRequestsLoading(false);
    }
  };

  // 4. Load Stats for Dashboard
  const loadStats = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/stats?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats({
          total: data.total || 0,
          pendingRequests: data.pendingRequests || 0,
          dropouts: data.dropouts || 0,
          lowAlternance: data.lowAlternance || 0
        });
      }
    } catch (err) {
      console.error('Stats load error:', err);
    }
  };

  // Trigger loads on mount/page change
  useEffect(() => {
    if (token) {
      fetchSettings();
      fetchStudents();
      fetchEditRequests();
      loadStats();
    }
  }, [token, currentPage]);

  // Debounced Live Search
  useEffect(() => {
    if (!token) return;
    
    // We only want to trigger search if user actually changed filters, 
    // not on initial mount (which is handled above)
    const timeoutId = setTimeout(() => {
      // Reset to page 1 on search change
      if (currentPage !== 1) {
        setCurrentPage(1); // this will trigger the main useEffect
      } else {
        fetchStudents();
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [searchParams]);

  const handleSearchChange = (e) => {
    const { name, value } = e.target;
    setSearchParams(prev => ({ ...prev, [name]: value }));
  };

  const triggerSearch = (e) => {
    if (e) e.preventDefault();
    setCurrentPage(1);
    fetchStudents();
  };

  const resetSearch = () => {
    setSearchParams({ utNo: '', name: '', phoneNo: '', beneficiaryName: '', bank: '' });
    setCurrentPage(1);
  };

  // 5. Open Student Details Drawer
  const openStudentDrawer = async (studentId) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/students/${studentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedStudent(data.student);
        setAdminFieldInputs({
          adminCol1Val: data.student.admin_col1_val || '',
          adminCol2Val: data.student.admin_col2_val || '',
          adminCol3Val: data.student.admin_col3_val || 0,
          blossomTrustAmount: data.student.blossom_trust_amount || 0,
          dropout_status: String(data.student.dropout_status) === "true" || Number(data.student.dropout_status) === 1,
          dropout_reason: data.student.dropout_reason || '',
          dropout_date: data.student.dropout_date || '',
          isLowAlternance: !!data.student.low_alternance_reason,
          lowAlternanceReason: data.student.low_alternance_reason || '',
          lowAlternanceHours: data.student.low_alternance_hours || ''
        });
      } else {
        showToast(data.message || 'Error loading details.', 'error');
        setDrawerOpen(false);
      }
    } catch (err) {
      showToast('Error loading details.', 'error');
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  // 6. Save Admin Editable Fields (includes Blossom Trust Amount)
  const saveAdminFields = async (e) => {
    e.preventDefault();
    setSaveLoading(true);

    try {
      const res = await fetch(`${API_URL}/admin/students/${selectedStudent.id}/admin-fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminCol1Val: adminFieldInputs.adminCol1Val,
          adminCol2Val: adminFieldInputs.adminCol2Val,
          adminCol3Val: adminFieldInputs.adminCol3Val,
          blossomTrustAmount: adminFieldInputs.blossomTrustAmount,
          dropout_status: adminFieldInputs.dropout_status,
          dropout_reason: adminFieldInputs.dropout_status ? adminFieldInputs.dropout_reason : null,
          dropout_date: adminFieldInputs.dropout_status ? adminFieldInputs.dropout_date : null,
          isLowAlternance: adminFieldInputs.isLowAlternance,
          lowAlternanceReason: adminFieldInputs.isLowAlternance ? adminFieldInputs.lowAlternanceReason : null,
          lowAlternanceHours: adminFieldInputs.isLowAlternance ? adminFieldInputs.lowAlternanceHours : null
        })
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message);
        setSelectedStudent(data.student);
        await fetchStudents();
        setStudents(prev => {
          const updated = prev.map(s => s.id === data.student.id ? data.student : s);
          return updated.sort((a, b) => Number(b.blossom_trust_amount || 0) - Number(a.blossom_trust_amount || 0));
        });
        loadStats();
      } else {
        showToast(data.message || 'Failed to save details.', 'error');
      }
    } catch (err) {
      showToast('Connection error.', 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  // 7. Approve / Reject Request
  const handleRequestStatus = async (requestId, action) => {
    try {
      const res = await fetch(`${API_URL}/admin/edit-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message);
        fetchEditRequests();
        fetchStudents();
        loadStats();
        if (selectedStudent) {
          openStudentDrawer(selectedStudent.id);
        }
      } else {
        showToast(data.message || 'Request failed.', 'error');
      }
    } catch (err) {
      showToast('Connection error.', 'error');
    }
  };

  // 8. Custom Headers Modifying
  const saveCustomHeaders = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminCol1Title: settingsForm.adminCol1Title,
          adminCol2Title: settingsForm.adminCol2Title,
          adminCol3Title: settingsForm.adminCol3Title
        })
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message);
        fetchSettings();
        setShowSettingsModal(false);
      } else {
        showToast(data.message || 'Error updating titles.', 'error');
      }
    } catch (err) {
      showToast('Connection error.', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  // 9. Excel Upload
  const handleExcelUpload = async (e) => {
    e.preventDefault();
    if (!excelFile) return;

    setUploadLoading(true);
    const formData = new FormData();
    formData.append('excel', excelFile);

    try {
      const res = await fetch(`${API_URL}/admin/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setExcelFile(null);
        fetchStudents();
        loadStats();
      } else {
        showToast(data.message || 'Import failed.', 'error');
      }
    } catch (err) {
      showToast('Error uploading spreadsheet.', 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  // 9.5 Attendance Upload
  const handleAttendanceUpload = async (e) => {
    e.preventDefault();
    if (!attendanceFile) return;

    setAttendanceUploadLoading(true);
    const formData = new FormData();
    formData.append('attendanceFile', attendanceFile);
    formData.append('month', attendanceMonth);
    formData.append('year', attendanceYear);
    formData.append('threshold', attendanceThreshold);

    try {
      const res = await fetch(`${API_URL}/admin/attendance/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setAttendanceFile(null);
        await fetchStudents();
        loadStats();
      } else {
        showToast(data.message || 'Upload failed.', 'error');
      }
    } catch (err) {
      showToast('Error uploading attendance.', 'error');
    } finally {
      setAttendanceUploadLoading(false);
    }
  };

  // 10. Google Sheets Credentials save and Sync
  const saveGoogleSheetsSettings = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          googleSheetsId: sheetsForm.googleSheetsId,
          googleSheetsClientEmail: sheetsForm.googleSheetsClientEmail,
          googleSheetsPrivateKey: sheetsForm.googleSheetsPrivateKey
        })
      });

      const data = await res.json();
      if (res.ok) {
        showToast('Google Sheets settings saved successfully!');
        fetchSettings();
      } else {
        showToast(data.message || 'Failed to save settings.', 'error');
      }
    } catch (err) {
      showToast('Error saving settings.', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const triggerGoogleSheetsSync = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/sync-sheets`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, data.simulated ? 'warning' : 'success');
      } else {
        showToast(data.message || 'Google Sheets sync failed.', 'error');
      }
    } catch (err) {
      showToast('Error triggering sync.', 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  // 11. Secure Reports Downloader
  const downloadReport = async (reportEndpoint, filename) => {
    try {
      showToast('Preparing your report download...', 'warning');
      const res = await fetch(`${API_URL}/admin/reports/${reportEndpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Generation failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Report downloaded successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download report.', 'error');
    }
  };

  // Download Sample Excel Template
  const downloadSampleTemplate = async () => {
    try {
      showToast('Downloading sample template...', 'warning');
      const res = await fetch(`${API_URL}/admin/import/sample`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Download failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Student_Bulk_Upload_Sample.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Sample template downloaded.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download sample.', 'error');
    }
  };

  // Filtered report URL builder (uses current searchParams)
  const filteredReportUrl = (format) => {
    const p = new URLSearchParams({
      format,
      utNo: searchParams.utNo,
      name: searchParams.name,
      phoneNo: searchParams.phoneNo,
      beneficiaryName: searchParams.beneficiaryName,
      bank: searchParams.bank
    }).toString();
    return `filtered?${p}`;
  };

  // Safe paginated rendering numbers
  const renderPagination = () => {
    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pages.push(
        <button
          key={p}
          onClick={() => setCurrentPage(p)}
          className="btn btn-secondary"
          style={{
            padding: '6px 12px',
            fontSize: '0.85rem',
            background: p === currentPage ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.04)',
            color: p === currentPage ? '#fff' : 'hsl(var(--text-secondary))',
            borderColor: p === currentPage ? 'hsl(var(--primary))' : 'hsla(var(--border-glass))'
          }}
        >
          {p}
        </button>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          className="btn btn-secondary"
          style={{ padding: '6px 10px' }}
          disabled={currentPage === 1}
        >
          <ChevronLeft size={16} />
        </button>
        {pages}
        <button
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          className="btn btn-secondary"
          style={{ padding: '6px 10px' }}
          disabled={currentPage === totalPages}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      
      {/* Sidebar Navigation */}
      <div className="glass-panel" style={{
        width: '260px',
        borderRadius: '0',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        zIndex: 5
      }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet color="hsl(var(--primary))" size={24} /> Blossom Trust
          </h2>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' }}>
            Reporting Portal
          </p>
        </div>

        {/* Tab Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'overview' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'overview' ? 'hsl(var(--primary-hover))' : 'hsl(var(--text-secondary))',
              border: 'none',
              width: '100%'
            }}
            onClick={() => setActiveTab('overview')}
          >
            <Server size={18} /> Overview
          </button>
          
          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'students' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'students' ? 'hsl(var(--primary-hover))' : 'hsl(var(--text-secondary))',
              border: 'none',
              width: '100%'
            }}
            onClick={() => { setActiveTab('students'); fetchStudents(); }}
          >
            <Users size={18} /> Student List
          </button>
          
          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'requests' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'requests' ? 'hsl(var(--primary-hover))' : 'hsl(var(--text-secondary))',
              border: 'none',
              width: '100%',
              position: 'relative'
            }}
            onClick={() => { setActiveTab('requests'); fetchEditRequests(); }}
          >
            <ShieldAlert size={18} /> Edit Requests
            {stats.pendingRequests > 0 && (
              <span style={{ position: 'absolute', right: '12px', background: 'hsl(var(--warning))', color: '#1e1b4b', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '8px' }}>
                {stats.pendingRequests}
              </span>
            )}
          </button>
          
          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'reports' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'reports' ? 'hsl(var(--primary-hover))' : 'hsl(var(--text-secondary))',
              border: 'none',
              width: '100%'
            }}
            onClick={() => setActiveTab('reports')}
          >
            <FileText size={18} /> Report Center
          </button>
          
          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'integration' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'integration' ? 'hsl(var(--primary-hover))' : 'hsl(var(--text-secondary))',
              border: 'none',
              width: '100%'
            }}
            onClick={() => setActiveTab('integration')}
          >
            <RefreshCw size={18} /> Data Settings
          </button>
        </div>

        <button className="btn btn-secondary" onClick={logout} style={{ width: '100%' }}>
          Logout
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto', height: '100vh' }}>
        
        {/* TOP TITLE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem' }}>Admin Dashboard</h1>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', marginTop: '4px' }}>
              Manage Blossom Trust student profiles, generate sheets reports, and configure integration.
            </p>
          </div>
          
          {activeTab === 'students' && (
            <button className="btn btn-primary" onClick={() => setShowSettingsModal(true)}>
              <Sliders size={16} /> Edit Column Titles
            </button>
          )}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Stats Cards */}
            <div className="grid-4">
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', color: 'hsl(var(--primary-hover))' }}>
                  <Users size={32} />
                </div>
                <div>
                  <h4 style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '4px' }}>Total Records</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.total.toLocaleString()}</p>
                </div>
              </div>

              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', color: 'hsl(var(--warning))' }}>
                  <ShieldAlert size={32} />
                </div>
                <div>
                  <h4 style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '4px' }}>Pending Requests</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.pendingRequests}</p>
                </div>
              </div>

              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: 'hsl(var(--danger))' }}>
                  <AlertTriangle size={32} />
                </div>
                <div>
                  <h4 style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '4px' }}>Dropouts</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.dropouts}</p>
                </div>
              </div>

              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '16px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '12px', color: '#f97316' }}>
                  <HelpCircle size={32} />
                </div>
                <div>
                  <h4 style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '4px' }}>Low Alternance</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.lowAlternance}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="grid-2" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
              
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Excel Student Bulk Importer</h3>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', marginBottom: '24px', lineHeight: '1.5' }}>
                  Upload an Excel workbook (<code>.xlsx</code>) to bulk import student records. New students will receive credentials automatically, and existing students will have their profile information updated.
                  <button className="btn btn-secondary" onClick={downloadSampleTemplate} style={{ marginTop: '12px' }}>Download Sample</button>
                </p>

                <form onSubmit={handleExcelUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ border: '2px dashed hsla(var(--border-glass))', borderRadius: '10px', padding: '32px', textAlign: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.2)', transition: 'var(--transition-smooth)' }} onClick={() => document.getElementById('excel-file-uploader').click()}>
                    <Upload size={32} style={{ color: 'hsl(var(--primary-hover))', marginBottom: '12px' }} />
                    <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>
                      {excelFile ? excelFile.name : 'Choose Excel Workbook'}
                    </div>
                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.78rem', marginTop: '6px' }}>
                      Supports .xlsx file sheets up to 10MB
                    </div>
                    <input 
                      type="file" 
                      id="excel-file-uploader" 
                      accept=".xlsx" 
                      style={{ display: 'none' }} 
                      onChange={(e) => setExcelFile(e.target.files[0])}
                    />
                  </div>
                  
                  {excelFile && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setExcelFile(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={uploadLoading}>
                        {uploadLoading ? 'Uploading...' : 'Execute Import'}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Google Sheets Sync</h3>
                  <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '16px' }}>
                    Publish and sync the centralized student repository directly to your organization's Google Sheet.
                  </p>
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid hsla(var(--border-glass))', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>Target ID:</span>
                      <span style={{ color: '#fff', fontFamily: 'monospace' }}>{settings.google_sheets_id ? `${settings.google_sheets_id.substring(0, 8)}...` : 'Not Configured'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Connection:</span>
                      <span>{settings.google_sheets_client_email ? <span style={{ color: 'hsl(var(--success))' }}>Configured</span> : <span style={{ color: 'hsl(var(--warning))' }}>Simulation Fallback</span>}</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', gap: '8px', marginTop: '24px' }}
                  onClick={triggerGoogleSheetsSync}
                  disabled={syncLoading}
                >
                  <RefreshCw size={16} className={syncLoading ? 'spin' : ''} />
                  {syncLoading ? 'Syncing...' : 'Sync to Google Sheets Now'}
                </button>
              </div>

            </div>

            {/* Second Row Quick Actions */}
            <div className="grid-2" style={{ gridTemplateColumns: '1.5fr 1fr', marginTop: '32px' }}>
              
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Monthly Attendance Upload</h3>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', marginBottom: '24px', lineHeight: '1.5' }}>
                  Upload a monthly attendance file (Excel, CSV, or structured PDF). The system will automatically parse the file, update student records, and flag students below the attendance threshold you set here.
                </p>

                <form onSubmit={handleAttendanceUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label className="form-label">Month</label>
                      <select className="form-select" value={attendanceMonth} onChange={(e) => setAttendanceMonth(e.target.value)}>
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label className="form-label">Year</label>
                      <input type="number" className="form-input" value={attendanceYear} onChange={(e) => setAttendanceYear(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label className="form-label">Threshold (%)</label>
                      <input type="number" className="form-input" placeholder="e.g. 80" value={attendanceThreshold} onChange={(e) => setAttendanceThreshold(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ border: '2px dashed hsla(var(--border-glass))', borderRadius: '10px', padding: '24px', textAlign: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.2)', transition: 'var(--transition-smooth)' }} onClick={() => document.getElementById('attendance-file-uploader').click()}>
                    <Upload size={24} style={{ color: 'hsl(var(--primary-hover))', marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>
                      {attendanceFile ? attendanceFile.name : 'Choose Attendance File (.xlsx, .csv, .pdf)'}
                    </div>
                    <input 
                      type="file" 
                      id="attendance-file-uploader" 
                      accept=".xlsx,.xls,.csv,.pdf" 
                      style={{ display: 'none' }} 
                      onChange={(e) => setAttendanceFile(e.target.files[0])}
                    />
                  </div>
                  
                  {attendanceFile && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setAttendanceFile(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={attendanceUploadLoading}>
                        {attendanceUploadLoading ? 'Uploading...' : 'Process Attendance'}
                      </button>
                    </div>
                  )}

                  {!attendanceFile && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ border: '1px solid hsl(var(--danger))', color: 'hsl(var(--danger))', background: 'transparent' }}
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to completely clear the attendance data for ${attendanceMonth} ${attendanceYear}? This will delete the records for this month and reset student statuses.`)) {
                            try {
                              setAttendanceUploadLoading(true);
                              const res = await fetch(`${API_URL}/admin/attendance/clear`, {
                                method: 'POST',
                                headers: { 
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ month: attendanceMonth, year: attendanceYear })
                              });
                              const data = await res.json();
                              // Always refresh student list and stats regardless of response
                              // This ensures stale low_attendance_status is cleared from UI
                              // even when the server says records were already cleared
                              await fetchStudents();
                              loadStats();
                              if (res.ok) {
                                showToast(data.message || `Attendance cleared for ${attendanceMonth} ${attendanceYear}.`, 'success');
                              } else if (res.status === 404) {
                                showToast('Attendance data was already cleared. Student list has been refreshed.', 'success');
                              } else {
                                showToast(data.message || 'Error clearing attendance.', 'error');
                              }
                            } catch (err) {
                              showToast('Error connecting to the server.', 'error');
                            } finally {
                              setAttendanceUploadLoading(false);
                            }
                          }
                        }}
                        disabled={attendanceUploadLoading}
                      >
                        {attendanceUploadLoading ? 'Processing...' : `Clear ${attendanceMonth} ${attendanceYear}`}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Attendance Status Info</h3>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '16px' }}>
                  Students flagged with low attendance will automatically be highlighted in <strong style={{ color: 'hsl(var(--warning))' }}>yellow</strong> on the Student List. 
                  Dropout students will be highlighted in <strong style={{ color: 'hsl(var(--danger))' }}>red</strong>.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.3)', border: '1px solid hsl(var(--danger))' }}></div>
                    <span>Dropout (Overrides low attendance)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.3)', border: '1px solid hsl(var(--warning))' }}></div>
                    <span>Low Attendance Flagged</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: STUDENTS GRID */}
        {activeTab === 'students' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Search/Filters Panel */}
            <form onSubmit={triggerSearch} className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Search UT No</label>
                  <input
                    type="text"
                    name="utNo"
                    className="form-input"
                    placeholder="e.g. UT-2025"
                    value={searchParams.utNo}
                    onChange={handleSearchChange}
                  />
                </div>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Search Name</label>
                  <input
                    type="text"
                    name="name"
                    className="form-input"
                    placeholder="e.g. Priyantha"
                    value={searchParams.name}
                    onChange={handleSearchChange}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Search Phone</label>
                  <input
                    type="text"
                    name="phoneNo"
                    className="form-input"
                    placeholder="e.g. 077"
                    value={searchParams.phoneNo}
                    onChange={handleSearchChange}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Beneficiary Name</label>
                  <input
                    type="text"
                    name="beneficiaryName"
                    className="form-input"
                    placeholder="Search beneficiary"
                    value={searchParams.beneficiaryName}
                    onChange={handleSearchChange}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Bank Filter</label>
                  <select
                    name="bank"
                    className="form-select"
                    value={searchParams.bank}
                    onChange={handleSearchChange}
                  >
                    <option value="">All Banks</option>
                    {banks.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                  Found <span style={{ color: '#fff', fontWeight: 'bold' }}>{totalRecords}</span> student records.
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={resetSearch}>Reset</button>
                  <button type="submit" className="btn btn-primary"><Search size={16} /> Search</button>
                </div>
              </div>
            </form>

            {/* Students Table */}
            <div className="glass-panel" style={{ padding: '0px', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
                  <div className="loader-spinner"></div>
                </div>
              ) : (
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>UT No</th>
                        <th>Name</th>
                        <th>Phone No</th>
                        <th>Beneficiary Name</th>
                        <th>Blossom Trust Amt</th>
                        <th>Bank</th>
                        <th>Branch Name</th>
                        <th>Br. Code</th>
                        <th>Account No</th>
                        <th>{settings.admin_col1_title}</th>
                        <th>{settings.admin_col2_title}</th>
                        <th>{settings.admin_col3_title}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, index) => {
                        const isDropout = Boolean(
                          s.dropout_status === true ||
                          s.dropout_status === "true" ||
                          s.dropout_status === 1 ||
                          s.dropout_status === "1"
                        );
                        const isLowAttendance = s.low_attendance_status === true || s.low_attendance_status === 1 || String(s.low_attendance_status) === "true";

                        return (
                          <tr 
                            key={s.id} 
                            onClick={() => openStudentDrawer(s.id)}
                            className={isDropout ? 'row-danger' : isLowAttendance ? 'row-warning' : ''}
                            style={{ cursor: 'pointer' }}
                          >
                            <td style={{ fontWeight: '600' }}>
                              {(currentPage - 1) * limit + index + 1}
                            </td>
                            <td style={{ fontWeight: '600' }}>
                              {s.ut_no || '-'}
                              {isDropout && (
                                <span className="badge badge-danger" style={{ marginLeft: '8px', fontSize: '0.65rem' }}>DROPOUT</span>
                              )}
                              {!isDropout && isLowAttendance && (
                                <span className="badge badge-warning" style={{ marginLeft: '8px', fontSize: '0.65rem' }}>LOW ATTENDANCE</span>
                              )}
                            </td>
                            <td>{s.full_name || '-'}</td>
                          <td>{s.phone_number || '-'}</td>
                          <td>{s.beneficiary_name || '-'}</td>
                          <td style={{ fontWeight: '500', color: 'hsl(var(--primary-hover))' }}>
                            {s.blossom_trust_amount ? `LKR ${Number(s.blossom_trust_amount).toLocaleString()}` : 'LKR 0'}
                          </td>
                          <td>{s.bank_name || '-'}</td>
                          <td>{s.branch_name || s.branch || '-'}</td>
                          <td>{s.branch_code || '-'}</td>
                          <td>{s.account_no || '-'}</td>
                          <td>
                            <span className="badge badge-draft" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}>
                              {s.admin_col1_val || 'N/A'}
                            </span>
                          </td>
                          <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.admin_col2_val || 'N/A'}</td>
                          <td style={{ fontWeight: '500', color: 'hsl(var(--success))' }}>
                            {s.admin_col3_val ? `LKR ${s.admin_col3_val.toLocaleString()}` : 'LKR 0'}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination Panel */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                Showing page <span style={{ color: '#fff', fontWeight: 'bold' }}>{currentPage}</span> of {totalPages} pages.
              </div>
              {renderPagination()}
            </div>

          </div>
        )}

        {/* TAB 3: EDIT REQUESTS */}
        {activeTab === 'requests' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Student Profile Access Requests</h2>
            
            {requestsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                <div className="loader-spinner"></div>
              </div>
            ) : editRequests.length === 0 ? (
              <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '40px 0' }}>No profile edit requests found.</p>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>UT No</th>
                      <th>Reason for Edit</th>
                      <th>Date Requested</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editRequests.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: '600' }}>{r.full_name}</td>
                        <td>{r.ut_no}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: '300px', lineHeight: '1.4' }}>{r.request_reason}</td>
                        <td>{new Date(r.created_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge badge-${r.status}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {r.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                onClick={() => handleRequestStatus(r.id, 'approve')}
                              >
                                <Check size={12} /> Approve
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 12px', fontSize: '0.78rem', background: 'rgba(239, 68, 68, 0.1)', color: 'hsl(var(--danger))', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                onClick={() => handleRequestStatus(r.id, 'reject')}
                              >
                                <X size={12} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: REPORTS PORTAL */}
        {activeTab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div className="grid-2">
              
              {/* Full Student Report Card */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '200px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText color="hsl(var(--primary))" size={20} /> Full Student Report
                  </h3>
                  <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', lineHeight: '1.4' }}>
                    Export the entire student database, including all personal details, bank accounts and Blossom Trust amounts.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => downloadReport('full?format=excel', 'Full_Student_Report.xlsx')}>
                    <Download size={14} /> Excel (.xlsx)
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadReport('full?format=pdf', 'Full_Student_Report.pdf')}>
                    <Download size={14} /> PDF Format
                  </button>
                </div>
              </div>

              {/* Filtered Student Report Card */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '200px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter color="hsl(var(--primary))" size={20} /> Filtered Student Report
                  </h3>
                  <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', lineHeight: '1.4' }}>
                    Generate reports containing only students matching the current filters set in the Student List view.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => downloadReport(filteredReportUrl('excel'), 'Filtered_Student_Report.xlsx')}>
                    <Download size={14} /> Excel (.xlsx)
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadReport(filteredReportUrl('pdf'), 'Filtered_Student_Report.pdf')}>
                    <Download size={14} /> PDF Format
                  </button>
                </div>
              </div>

              {/* Dropout Report Card */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 'auto', paddingBottom: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--danger))' }}>
                    <AlertTriangle size={20} /> Dropout Students Report
                  </h3>
                  <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', lineHeight: '1.4', marginBottom: '16px' }}>
                    Export a monthly list of dropout students. Generates a list mapping reasons for dropouts and dates.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <MonthDropdown 
                      value={dropoutMonth} 
                      onChange={(e) => setDropoutMonth(e.target.value)} 
                    />
                    {/* Cache break test */}
                    <span style={{ display: 'none' }}>Render Test</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => downloadReport(`dropout?format=excel&month=${dropoutMonth}`, 'Dropout_Students_Report.xlsx')}>
                    <Download size={14} /> Excel (.xlsx)
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadReport(`dropout?format=pdf&month=${dropoutMonth}`, 'Dropout_Students_Report.pdf')}>
                    <Download size={14} /> PDF Format
                  </button>
                </div>
              </div>

              {/* Low Attendance Report Card */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 'auto', paddingBottom: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f97316' }}>
                    <HelpCircle size={20} /> Low Attendance Report
                  </h3>
                  <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.88rem', lineHeight: '1.4', marginBottom: '16px' }}>
                    Generates the Monthly Low Attendance report for a specific month using a defined attendance threshold.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <MonthDropdown 
                      value={reportMonth} 
                      onChange={(e) => setReportMonth(e.target.value)} 
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-secondary" onClick={() => downloadReport(`low-attendance?format=excel&month=${reportMonth}`, 'Low_Attendance_Report.xlsx')}>
                    <Download size={14} /> Excel (.xlsx)
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadReport(`low-attendance?format=pdf&month=${reportMonth}`, 'Low_Attendance_Report.pdf')}>
                    <Download size={14} /> PDF Format
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 5: INTEGRATION SETTINGS */}
        {activeTab === 'integration' && (
          <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={20} color="hsl(var(--primary))" /> Google Sheets Integration Settings
            </h2>
            
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '24px' }}>
              Provide your Google Sheets ID and Service Account Credentials below. The backend connects directly to Google APIs using JWT configuration. Leaving fields empty runs sheets actions in simulated mock mode.
            </p>

            <form onSubmit={saveGoogleSheetsSettings}>
              <div className="form-group">
                <label className="form-label">Google Sheet ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
                  value={sheetsForm.googleSheetsId}
                  onChange={(e) => setSheetsForm(prev => ({ ...prev, googleSheetsId: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Service Account Client Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. project-service@gcp-account.iam.gserviceaccount.com"
                  value={sheetsForm.googleSheetsClientEmail}
                  onChange={(e) => setSheetsForm(prev => ({ ...prev, googleSheetsClientEmail: e.target.value }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '28px' }}>
                <label className="form-label">Service Account Private Key (PEM format)</label>
                <textarea
                  className="form-textarea"
                  rows={6}
                  placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                  value={sheetsForm.googleSheetsPrivateKey}
                  onChange={(e) => setSheetsForm(prev => ({ ...prev, googleSheetsPrivateKey: e.target.value }))}
                ></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" disabled={settingsLoading}>
                  <Save size={16} /> Save Credentials
                </button>
              </div>
            </form>
          </div>
        )}

      </div>

      {/* Slide-out Student Details Drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}></div>
          <div className="drawer">
            <div className="drawer-header">
              <h3 style={{ fontSize: '1.25rem' }}>Student Profile Detail</h3>
              <button 
                onClick={() => setDrawerOpen(false)} 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-secondary))' }}
              >
                <X size={20} />
              </button>
            </div>
            
            {drawerLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flex: 1 }}>
                <div className="loader-spinner"></div>
              </div>
            ) : selectedStudent && (
              <>
                <div className="drawer-body">
                  
                  {/* Photo & Main Details */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '1px solid hsla(var(--border-glass))', background: '#0f172a' }}>
                      {selectedStudent.photo_url ? (
                        <img 
                          src={selectedStudent.photo_url} 
                          alt="Profile" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: 'hsl(var(--text-muted))' }}>
                          <Users size={32} />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1.2rem' }}>{selectedStudent.full_name}</h4>
                      <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.8rem' }}>UT No: {selectedStudent.ut_no || 'N/A'}</p>
                      <span className={`badge badge-${selectedStudent.profile_status}`} style={{ marginTop: '6px' }}>
                        {selectedStudent.profile_status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Profile Edit requests inside drawer */}
                  {selectedStudent.profile_status === 'pending_edit' && (
                    <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                      <h5 style={{ fontSize: '0.9rem', color: 'hsl(var(--warning))', marginBottom: '4px' }}>Pending Edit Access Request</h5>
                      
                      <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginBottom: '12px', lineHeight: '1.4' }}>
                        This student has requested access to modify their profile details. Approve request to unlock edits.
                      </p>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                          onClick={async () => {
                            const reqRes = await fetch(`${API_URL}/admin/edit-requests`, {
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            const requestsList = await reqRes.json();
                            const activeReq = requestsList.find(r => r.student_id === selectedStudent.id && r.status === 'pending');
                            if (activeReq) {
                              await handleRequestStatus(activeReq.id, 'approve');
                            } else {
                              showToast('Could not find active request ID.', 'error');
                            }
                          }}
                        >
                          Approve Request
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Standard student details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '4px' }}>Personal Info</p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>Phone Number:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.phone_number || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>NIC Number:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.nic_number || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>District:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.district || '-'}</span>
                    </div>

                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))', fontWeight: '600', letterSpacing: '0.05em', marginTop: '8px', marginBottom: '4px', borderTop: '1px solid hsla(var(--border-glass))', paddingTop: '12px' }}>Bank Details</p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>Bank Name:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.bank_name || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>Branch Name:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.branch_name || selectedStudent.branch || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>Branch Code:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.branch_code || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>Account No:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.account_no || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'hsl(var(--text-secondary))' }}>Beneficiary:</span>
                      <span style={{ fontWeight: '500' }}>{selectedStudent.beneficiary_name || '-'}</span>
                    </div>
                  </div>

                  {/* Administrative details form */}
                  <form onSubmit={saveAdminFields}>
                    <h4 style={{ fontSize: '1rem', borderBottom: '1px solid hsla(var(--border-glass))', paddingBottom: '8px', marginBottom: '16px' }}>
                      Admin Managed Settings
                    </h4>

                    {/* Blossom Trust Amount */}
                    <div className="form-group" style={{ marginBottom: '20px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '14px' }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <DollarSign size={14} color="hsl(var(--primary-hover))" /> Blossom Trust Amount (LKR)
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 25000"
                        value={adminFieldInputs.blossomTrustAmount}
                        onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, blossomTrustAmount: e.target.value }))}
                      />
                      <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
                        This amount is visible to the student in read-only mode.
                      </p>
                    </div>

                    <div className="form-group">
                      <label className="form-label">{settings.admin_col1_title}</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Employed"
                        value={adminFieldInputs.adminCol1Val}
                        onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, adminCol1Val: e.target.value }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">{settings.admin_col2_title}</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. WSO2"
                        value={adminFieldInputs.adminCol2Val}
                        onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, adminCol2Val: e.target.value }))}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '24px' }}>
                      <label className="form-label">{settings.admin_col3_title}</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="e.g. 50000"
                        value={adminFieldInputs.adminCol3Val}
                        onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, adminCol3Val: e.target.value }))}
                      />
                    </div>

                    {/* Dropout configuration */}
                    <div style={{ marginBottom: '20px', borderTop: '1px solid hsla(var(--border-glass))', paddingTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'hsl(var(--text-secondary))' }}>
                        <input 
                          type="checkbox" 
                          checked={String(adminFieldInputs.dropout_status) === "true" || Number(adminFieldInputs.dropout_status) === 1}
                          onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, dropout_status: e.target.checked }))}
                        /> Mark as Dropout
                      </label>
                      
                      {(String(adminFieldInputs.dropout_status) === "true" || Number(adminFieldInputs.dropout_status) === 1) && (
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', padding: '12px' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Reason for Dropout</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. Financial difficulties"
                              value={adminFieldInputs.dropout_reason}
                              onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, dropout_reason: e.target.value }))}
                              required
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Dropout Date</label>
                            <input
                              type="date"
                              className="form-input"
                              value={adminFieldInputs.dropout_date}
                              onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, dropout_date: e.target.value }))}
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Low Alternance configuration */}
                    <div style={{ marginBottom: '24px', borderTop: '1px solid hsla(var(--border-glass))', paddingTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'hsl(var(--text-secondary))' }}>
                        <input 
                          type="checkbox" 
                          checked={adminFieldInputs.isLowAlternance}
                          onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, isLowAlternance: e.target.checked }))}
                        /> Mark as Low Alternance
                      </label>
                      
                      {adminFieldInputs.isLowAlternance && (
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(249, 115, 22, 0.05)', border: '1px solid rgba(249,115,22,0.15)', borderRadius: '8px', padding: '12px' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Reason for Low Alternance</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. Transportation issues"
                              value={adminFieldInputs.lowAlternanceReason}
                              onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, lowAlternanceReason: e.target.value }))}
                              required
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Alternance Hours (Attendance)</label>
                            <input
                              type="number"
                              className="form-input"
                              placeholder="e.g. 20"
                              value={adminFieldInputs.lowAlternanceHours}
                              onChange={(e) => setAdminFieldInputs(prev => ({ ...prev, lowAlternanceHours: e.target.value }))}
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      style={{ width: '100%', gap: '8px' }}
                      disabled={saveLoading}
                    >
                      <Save size={16} /> {saveLoading ? 'Saving...' : 'Save Administrative Fields'}
                    </button>
                  </form>

                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Settings Modal (Modify Column Titles) */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders color="hsl(var(--primary))" size={20} /> Edit Administrative Column Titles
            </h3>
            
            <form onSubmit={saveCustomHeaders}>
              <div className="form-group">
                <label className="form-label">Admin Column 1 Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={settingsForm.adminCol1Title}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, adminCol1Title: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Admin Column 2 Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={settingsForm.adminCol2Title}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, adminCol2Title: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '28px' }}>
                <label className="form-label">Admin Column 3 Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={settingsForm.adminCol3Title}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, adminCol3Title: e.target.value }))}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowSettingsModal(false)}
                  disabled={settingsLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={settingsLoading}
                >
                  {settingsLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
