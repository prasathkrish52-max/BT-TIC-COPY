-- Blossom Trust Supabase PostgreSQL Schema

-- Note: 'users' are typically managed by Supabase Auth (auth.users). 
-- We create a custom 'public.users' table to store roles and link to auth.users.
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students Table (Hybrid Structure)
CREATE TABLE public.students (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  ut_no TEXT UNIQUE,
  full_name TEXT,
  phone_number TEXT,
  nic_number TEXT,
  district TEXT,
  bank_name TEXT,
  branch TEXT,               -- Keep old branch text
  branch_name TEXT,          -- New branch name field
  branch_code TEXT,          -- Branch Code
  account_no TEXT,           -- Account number
  beneficiary_name TEXT,     -- Beneficiary name
  blossom_trust_amount NUMERIC DEFAULT 0, -- Blossom Trust Amount
  photo_url TEXT,
  profile_status TEXT DEFAULT 'draft' CHECK(profile_status IN ('draft', 'submitted', 'pending_edit', 'approved_edit')),
  admin_col1_val TEXT,       -- Current Status
  admin_col2_val TEXT,       -- Working Company Name
  admin_col3_val NUMERIC,    -- Salary (LKR)
  dropout_reason TEXT,
  dropout_date TEXT,
  dropout_status BOOLEAN DEFAULT FALSE,
  low_alternance_reason TEXT,
  low_alternance_hours INTEGER,
  attendance_percentage NUMERIC,
  low_attendance_status BOOLEAN DEFAULT FALSE,
  last_attendance_month TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_student_ut_no ON public.students(ut_no);
CREATE INDEX idx_student_name ON public.students(full_name);
CREATE INDEX idx_student_phone ON public.students(phone_number);
CREATE INDEX idx_student_district ON public.students(district);
CREATE INDEX idx_student_bank ON public.students(bank_name);

-- Edit Requests Table
CREATE TABLE public.edit_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  request_reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Settings Table
CREATE TABLE public.admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert Default Admin Settings
INSERT INTO public.admin_settings (key, value) VALUES 
('admin_col1_title', 'Current Status'),
('admin_col2_title', 'Working Company Name'),
('admin_col3_title', 'Salary (LKR)'),
('google_sheets_id', ''),
('google_sheets_client_email', ''),
('google_sheets_private_key', '')
ON CONFLICT (key) DO NOTHING;

-- Attendance History Table
CREATE TABLE public.attendance_history (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  attendance_percentage NUMERIC,
  uploaded_file TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
