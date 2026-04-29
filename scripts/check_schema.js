const { Pool } = require('pg');

async function checkSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is missing");
    return;
  }

  const pool = new Pool({
    connectionString: connectionString + (connectionString.includes('?') ? '&sslmode=require' : '?sslmode=require'),
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications'
      ORDER BY ordinal_position;
    `);
    console.log("Columns in 'notifications' table:");
    console.table(res.rows);

    const res2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'driver_notices'
      ORDER BY ordinal_position;
    `);
    if (res2.rows.length > 0) {
      console.log("\nColumns in 'driver_notices' table:");
      console.table(res2.rows);
    }

  } catch (err) {
    console.error("Error checking schema:", err);
  } finally {
    await pool.end();
  }
}

checkSchema();
