const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Storage layer with two modes:
//
//  1. DATABASE_URL is set (recommended for production, e.g. a free Supabase
//     or Neon Postgres instance) -> orders & reviews are stored in Postgres,
//     which survives restarts/redeploys.
//
//  2. DATABASE_URL is NOT set -> falls back to the JSON files in /data, which
//     is fine for local development but will be WIPED on hosts with an
//     ephemeral filesystem (e.g. Render's free tier) whenever the app
//     restarts. This is why reviews/orders were disappearing before — see
//     README.md "Fixing disappearing reviews/orders" for setup steps.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
const TABLES = ["orders", "reviews"]; // whitelist - never interpolate arbitrary table names

let pool = null;
let ready = null;

if (DATABASE_URL) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  ready = initTables().catch((err) => {
    console.error("Failed to initialize database tables:", err.message);
  });
}

async function initTables() {
  for (const table of TABLES) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
  }
  console.log("Database tables ready.");
}

function assertTable(table) {
  if (!TABLES.includes(table) && table !== "menu") {
    throw new Error(`Unknown table: ${table}`);
  }
}

// ---------------- JSON file fallback (local dev / no DATABASE_URL) ----------------
function filePath(name) {
  return path.join(__dirname, "..", "data", `${name}.json`);
}
function readJsonFile(name) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf-8").trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to parse ${name}.json`, e);
    return [];
  }
}
function writeJsonFile(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

// ---------------- Public API ----------------

// Menu is always static JSON (edited by hand per the README) regardless of mode.
async function readData(table) {
  assertTable(table);
  if (table === "menu") return readJsonFile("menu");

  if (pool) {
    await ready;
    const res = await pool.query(
      `SELECT data FROM ${table} ORDER BY created_at ASC`
    );
    return res.rows.map((r) => r.data);
  }
  return readJsonFile(table);
}

// Full overwrite — only meaningful in JSON-file mode. In DB mode use addRecord/updateRecord.
async function writeData(table, data) {
  assertTable(table);
  if (pool) {
    throw new Error("writeData() isn't supported in database mode — use addRecord/updateRecord instead.");
  }
  writeJsonFile(table, data);
}

async function addRecord(table, record) {
  assertTable(table);
  if (pool) {
    await ready;
    await pool.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [
      record.id,
      record,
    ]);
    return;
  }
  const data = readJsonFile(table);
  data.push(record);
  writeJsonFile(table, data);
}

async function updateRecord(table, id, updatedRecord) {
  assertTable(table);
  if (pool) {
    await ready;
    await pool.query(`UPDATE ${table} SET data = $2 WHERE id = $1`, [
      id,
      updatedRecord,
    ]);
    return;
  }
  const data = readJsonFile(table);
  const idx = data.findIndex((r) => r.id === id);
  if (idx !== -1) data[idx] = updatedRecord;
  writeJsonFile(table, data);
}

module.exports = {
  readData,
  writeData,
  addRecord,
  updateRecord,
  usingDatabase: !!pool,
};
