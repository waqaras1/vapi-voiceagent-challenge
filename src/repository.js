import pool from "./db.js";

const COLUMNS = [
  "patient_id","first_name","last_name","date_of_birth","sex",
  "phone_number","email","address_line_1","address_line_2","city",
  "state","zip_code","insurance_provider","insurance_member_id",
  "preferred_language","emergency_contact_name","emergency_contact_phone",
  "call_transcript","created_at","updated_at","deleted_at",
];

const SELECT_COLS = COLUMNS.join(", ");

export async function listPatients({ last_name, date_of_birth, phone_number } = {}) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];

  if (last_name) {
    params.push(last_name);
    conditions.push(`LOWER(last_name) = LOWER($${params.length})`);
  }
  if (date_of_birth) {
    params.push(date_of_birth);
    conditions.push(`date_of_birth = $${params.length}`);
  }
  if (phone_number) {
    const digits = phone_number.replace(/\D/g, "");
    params.push(digits);
    conditions.push(`phone_number = $${params.length}`);
  }

  const sql = `SELECT ${SELECT_COLS} FROM patients
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC LIMIT 200`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getPatientById(id) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM patients WHERE patient_id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findByPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  const { rows } = await pool.query(
    `SELECT patient_id, first_name, last_name FROM patients
     WHERE phone_number = $1 AND deleted_at IS NULL`,
    [digits]
  );
  return rows[0] ?? null;
}

export async function createPatient(data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

  const { rows } = await pool.query(
    `INSERT INTO patients (${keys.join(", ")}) VALUES (${placeholders})
     RETURNING ${SELECT_COLS}`,
    values
  );
  return rows[0];
}

export async function updatePatient(id, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;

  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = [id, ...Object.values(data)];

  const { rows } = await pool.query(
    `UPDATE patients SET ${setClauses}
     WHERE patient_id = $1 AND deleted_at IS NULL
     RETURNING ${SELECT_COLS}`,
    values
  );
  return rows[0] ?? null;
}

export async function softDeletePatient(id) {
  const { rows } = await pool.query(
    `UPDATE patients SET deleted_at = now()
     WHERE patient_id = $1 AND deleted_at IS NULL
     RETURNING patient_id, deleted_at`,
    [id]
  );
  return rows[0] ?? null;
}

export async function storeTranscript(patientId, transcript) {
  await pool.query(
    `UPDATE patients SET call_transcript = $2 WHERE patient_id = $1`,
    [patientId, transcript]
  );
}

export async function healthCheck() {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "down";
  }
}
