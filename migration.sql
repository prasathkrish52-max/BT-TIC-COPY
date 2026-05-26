-- Blossom Trust Migration SQL
-- Run these commands in the Supabase SQL Editor to update your table to the hybrid structure.

-- 1. Add blossom_trust_amount column if it doesn't exist
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS blossom_trust_amount NUMERIC DEFAULT 0;

-- 2. Add branch_name column if it doesn't exist
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- 3. Copy existing branch data to branch_name for backward compatibility
UPDATE public.students SET branch_name = branch WHERE branch_name IS NULL AND branch IS NOT NULL;

-- 4. Add new attendance tracking and dropout columns
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS attendance_percentage NUMERIC;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS low_attendance_status BOOLEAN DEFAULT FALSE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_attendance_month TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dropout_status BOOLEAN DEFAULT FALSE;

-- 5. Create Attendance History Table
CREATE TABLE IF NOT EXISTS public.attendance_history (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  attendance_percentage NUMERIC,
  uploaded_file TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
