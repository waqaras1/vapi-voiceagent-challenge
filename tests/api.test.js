import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  console.log("⏭  DATABASE_URL is not set — skipping integration tests.");
  console.log("   Set DATABASE_URL to a Supabase Postgres connection string to run tests.");
  process.exit(0);
}

const { default: app } = await import("../src/index.js");
const { default: pool } = await import("../src/db.js");

const PORT = 9876 + Math.floor(Math.random() * 1000);
let server;
let BASE;
let createdId;

before(async () => {
  // Clean up stale test data from prior runs
  await pool.query(
    "DELETE FROM patients WHERE phone_number IN ('5558675309', '9725550199')"
  );
  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      BASE = `http://localhost:${PORT}`;
      resolve();
    });
  });
});

after(async () => {
  server?.close();
  await pool.end();
});

// ─── helpers ───────────────────────────────────────────────────────
function api(path, opts = {}) {
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
}

const validPatient = {
  first_name: "Jane",
  last_name: "Doe",
  date_of_birth: "03/15/1990",
  sex: "Female",
  phone_number: "555-867-5309",
  address_line_1: "123 Main St",
  city: "Austin",
  state: "TX",
  zip_code: "73301",
};

// ─── tests ─────────────────────────────────────────────────────────
describe("patients API", () => {
  it("POST /patients → 201 for valid patient", async () => {
    const res = await api("/patients", {
      method: "POST",
      body: JSON.stringify(validPatient),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    createdId = body.data.patient_id;
    assert.ok(createdId);
    assert.equal(body.data.first_name, "Jane");
    assert.equal(body.data.phone_number, "5558675309");
    assert.equal(body.data.date_of_birth, "1990-03-15");
  });

  it("POST /patients → 422 missing required field", async () => {
    const { first_name, ...incomplete } = validPatient;
    const res = await api("/patients", {
      method: "POST",
      body: JSON.stringify(incomplete),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.error.details.first_name);
  });

  it("POST /patients → 422 future DOB", async () => {
    const res = await api("/patients", {
      method: "POST",
      body: JSON.stringify({ ...validPatient, date_of_birth: "01/01/2099", phone_number: "3125550000" }),
    });
    assert.equal(res.status, 422);
  });

  it("POST /patients → 422 bad state", async () => {
    const res = await api("/patients", {
      method: "POST",
      body: JSON.stringify({ ...validPatient, state: "XX", phone_number: "3125550001" }),
    });
    assert.equal(res.status, 422);
  });

  it("POST /patients → 422 7-digit phone", async () => {
    const res = await api("/patients", {
      method: "POST",
      body: JSON.stringify({ ...validPatient, phone_number: "8675309" }),
    });
    assert.equal(res.status, 422);
  });

  it("POST /patients → 409 duplicate phone", async () => {
    const res = await api("/patients", {
      method: "POST",
      body: JSON.stringify(validPatient),
    });
    assert.equal(res.status, 409);
  });

  it("GET /patients/:id → 200", async () => {
    const res = await api(`/patients/${createdId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.patient_id, createdId);
  });

  it("GET /patients/:id → 400 bad uuid", async () => {
    const res = await api("/patients/not-a-uuid");
    assert.equal(res.status, 400);
  });

  it("GET /patients/:id → 404 unknown uuid", async () => {
    const res = await api("/patients/00000000-0000-0000-0000-000000000000");
    assert.equal(res.status, 404);
  });

  it("PUT /patients/:id → 200 partial update", async () => {
    const res = await api(`/patients/${createdId}`, {
      method: "PUT",
      body: JSON.stringify({ city: "Dallas" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.city, "Dallas");
  });

  it("DELETE /patients/:id → 200 soft delete", async () => {
    const res = await api(`/patients/${createdId}`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.deleted_at);
  });

  it("GET /patients/:id → 404 after soft delete", async () => {
    const res = await api(`/patients/${createdId}`);
    assert.equal(res.status, 404);
  });
});

describe("Vapi webhook", () => {
  it("POST /vapi/tools register_patient round trip", async () => {
    const res = await api("/vapi/tools", {
      method: "POST",
      body: JSON.stringify({
        message: {
          type: "tool-calls",
          call: { id: "test-call-001" },
          toolCallList: [
            {
              id: "tc_1",
              function: {
                name: "register_patient",
                arguments: {
                  first_name: "Test",
                  last_name: "Vapi",
                  date_of_birth: "1985-06-15",
                  sex: "Male",
                  phone_number: "9725550199",
                  address_line_1: "456 Oak Ave",
                  city: "Plano",
                  state: "TX",
                  zip_code: "75024",
                },
              },
            },
          ],
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.results);
    assert.equal(body.results.length, 1);
    const result = JSON.parse(body.results[0].result);
    assert.equal(result.success, true);
    assert.ok(result.patient_id);

    // Clean up
    await api(`/patients/${result.patient_id}`, { method: "DELETE" });
  });
});
