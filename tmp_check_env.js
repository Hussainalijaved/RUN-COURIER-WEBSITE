console.log(JSON.stringify({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '[REDACTED]' : undefined,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL
}, null, 2));
