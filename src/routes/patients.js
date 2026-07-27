import { Router } from "express";
import { patientCreate, patientUpdate } from "../schema.js";
import * as repo from "../repository.js";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ok(res, data, status = 200) {
  return res.status(status).json({ data, error: null });
}

function fail(res, status, message, details) {
  return res.status(status).json({
    data: null,
    error: { message, ...(details && { details }) },
  });
}

// GET /patients
router.get("/", async (req, res, next) => {
  try {
    const rows = await repo.listPatients(req.query);
    ok(res, rows);
  } catch (err) {
    next(err);
  }
});

// GET /patients/:id
router.get("/:id", async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return fail(res, 400, "invalid UUID");
    const row = await repo.getPatientById(req.params.id);
    if (!row) return fail(res, 404, "patient not found");
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

// POST /patients
router.post("/", async (req, res, next) => {
  try {
    const parsed = patientCreate.safeParse(req.body);
    if (!parsed.success) {
      const details = Object.fromEntries(
        parsed.error.errors.map((e) => [e.path.join("."), e.message])
      );
      return fail(res, 422, "validation failed", details);
    }
    const row = await repo.createPatient(parsed.data);
    ok(res, row, 201);
  } catch (err) {
    // Unique constraint on phone_number (pg error 23505)
    if (err.code === "23505") {
      return fail(res, 409, "a patient with this phone number already exists");
    }
    next(err);
  }
});

// PUT /patients/:id
router.put("/:id", async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return fail(res, 400, "invalid UUID");
    if (!req.body || Object.keys(req.body).length === 0) {
      return fail(res, 400, "request body must not be empty");
    }
    const parsed = patientUpdate.safeParse(req.body);
    if (!parsed.success) {
      const details = Object.fromEntries(
        parsed.error.errors.map((e) => [e.path.join("."), e.message])
      );
      return fail(res, 422, "validation failed", details);
    }
    const row = await repo.updatePatient(req.params.id, parsed.data);
    if (!row) return fail(res, 404, "patient not found");
    ok(res, row);
  } catch (err) {
    if (err.code === "23505") {
      return fail(res, 409, "a patient with this phone number already exists");
    }
    next(err);
  }
});

// DELETE /patients/:id  (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return fail(res, 400, "invalid UUID");
    const row = await repo.softDeletePatient(req.params.id);
    if (!row) return fail(res, 404, "patient not found or already deleted");
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

export default router;
