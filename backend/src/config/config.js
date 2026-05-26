const path = require('path');

module.exports = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'blossom_trust_super_secret_jwt_key_2026_!!',
  JWT_EXPIRES_IN: '24h',
  UPLOAD_DIR: path.resolve(__dirname, '../../uploads'),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};
