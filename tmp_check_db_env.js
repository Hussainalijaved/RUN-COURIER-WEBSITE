console.log(JSON.stringify({
  DATABASE_URL: process.env.DATABASE_URL ? '[PRESENT]' : 'MISSING',
  PGPASSWORD: process.env.PGPASSWORD ? '[PRESENT]' : 'MISSING',
  PGHOST: process.env.PGHOST,
  PGUSER: process.env.PGUSER,
  PGDATABASE: process.env.PGDATABASE
}, null, 2));
