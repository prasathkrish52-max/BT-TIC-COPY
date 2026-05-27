const supabase = require('../models/supabaseClient');

exports.register = async (req, res) => {
  const { email, password, fullName, utNo, studentType = 'blossom' } = req.body;
  if (!email || !password || !fullName || !utNo) {
    return res.status(400).json({ message: 'Email, password, full name, and UT number are required.' });
  }

  try {
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Invalid email address format.' });
    }

    // Check if user exists in custom users table
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', trimmedEmail).maybeSingle();
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    // Check if student with same UT number exists
    const { data: existingStudent } = await supabase.from('students').select('id').eq('ut_no', utNo).maybeSingle();
    if (existingStudent) {
      return res.status(400).json({ message: 'UT Number is already registered.' });
    }

    // Check duplicate in students table (for both Blossom and Non-Blossom)
    const { data: existingStudentEmail } = await supabase.from('students').select('id').eq('email', trimmedEmail).maybeSingle();
    if (existingStudentEmail) {
      return res.status(400).json({ message: 'This email address is already in use by another student.' });
    }

    // 1. Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: password,
      email_confirm: true // Auto-confirm for this app
    });

    if (authError) throw authError;

    // 2. Add to public.users table.
    // In SQLite mode, createUser already inserts (with password hash), so only insert if not present.
    // In Supabase mode, createUser only writes to auth.users, so manual insert is needed.
    const { data: alreadyInPublic } = await supabase
      .from('users')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!alreadyInPublic) {
      const { error: insertError } = await supabase.from('users').insert([{
        id: authData.user.id,
        email: authData.user.email,
        role: 'student'
      }]);
      if (insertError) throw insertError;
    }

    // 3. Create initial student profile
    const studentPayload = {
      user_id: authData.user.id,
      ut_no: utNo,
      full_name: fullName,
      profile_status: 'draft',
      student_type: studentType,
      batch: 'Unicom TIC Class of 2026',
      batch_year: 2026
    };

    studentPayload.email = trimmedEmail;

    await supabase.from('students').insert([studentPayload]);

    return res.status(201).json({ message: 'Registration successful. Please login.' });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ message: error.message || 'Error registering user.' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // Sign in using Supabase
    // Note: since we use Service Role for supabaseClient, we shouldn't mix sessions.
    // So we use standard auth flow via REST to get a token for the user.
    // Instead of using the admin client, we create a temporary anon client to sign in.
    const config = require('../config/config');
    let clientToUse;
    if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
      const { createClient } = require('@supabase/supabase-js');
      clientToUse = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { persistSession: false }});
    } else {
      clientToUse = supabase;
    }
    
    const { data, error } = await clientToUse.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Get the custom role from our users table
    const { data: userData, error: userError } = await supabase.from('users').select('role').eq('id', data.user.id).maybeSingle();
    if (userError || !userData) {
      return res.status(401).json({ message: 'User role not found.' });
    }

    // Supabase access token will be used by the frontend
    const token = data.session.access_token;
    
    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: userData.role
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ message: 'Error logging in.' });
  }
};

exports.me = async (req, res) => {
  // req.user is populated by verifyToken middleware (which now verifies via Supabase)
  try {
    const { data: userData, error } = await supabase.from('users').select('role').eq('id', req.user.id).maybeSingle();
    
    if (error || !userData) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({
      id: req.user.id,
      email: req.user.email,
      role: userData.role
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error retrieving user data.' });
  }
};
