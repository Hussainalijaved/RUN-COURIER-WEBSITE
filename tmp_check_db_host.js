const dbUrl = process.env.DATABASE_URL || '';
const pgHost = process.env.PGHOST || '';

console.log(JSON.stringify({
  DATABASE_URL_EXISTS: !!dbUrl,
  DATABASE_URL_PREFIX: dbUrl.split('@')[1] ? dbUrl.split('@')[1].split('/')[0] : 'not-found',
  PGHOST: pgHost
}, null, 2));
