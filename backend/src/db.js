const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// Render Postgres needs SSL on external connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error", err);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
