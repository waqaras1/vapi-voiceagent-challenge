import pg from "pg";

// Return date columns as 'YYYY-MM-DD' strings, not JS Date objects,
// so JSON serialisation doesn't timezone-shift them.
pg.types.setTypeParser(1082, (val) => val);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default pool;
