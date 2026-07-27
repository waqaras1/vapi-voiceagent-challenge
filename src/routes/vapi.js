import { Router } from "express";
import { patientCreate, patientUpdate } from "../schema.js";
import * as repo from "../repository.js";

const router = Router();

// Maps callId → patientId so end-of-call can attach the transcript.
// In-memory only — lost on restart. See README for discussion.
const callPatientMap = new Map();

// ─── Vapi tool-call webhook ────────────────────────────────────────
// Vapi sends: { message: { type: "tool-calls", call: { id }, toolCallList: [...] } }
// We respond: { results: [ { toolCallId, result: "<JSON string>" } ] }
router.post("/tools", async (req, res) => {
  const { message } = req.body ?? {};
  if (message?.type !== "tool-calls") return res.json({ results: [] });

  const callId = message.call?.id;
  const toolCalls = message.toolCallList ?? [];

  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      const toolCallId = tc.id;
      const name = tc.function?.name;
      // Arguments may arrive as an object or a JSON string from Vapi
      let args = tc.function?.arguments ?? {};
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch { args = {}; }
      }

      let result;
      try {
        switch (name) {
          case "lookup_patient":
            result = await handleLookup(args);
            break;
          case "register_patient":
            result = await handleRegister(args, callId);
            break;
          case "update_patient":
            result = await handleUpdate(args);
            break;
          default:
            result = { success: false, message: `unknown tool: ${name}` };
        }
      } catch (err) {
        console.error(`[tool.error] ${name} ${err.message}`);
        result = { success: false, message: "an internal error occurred" };
      }

      return { toolCallId, result: JSON.stringify(result) };
    })
  );

  res.json({ results });
});

// ─── Vapi server-events webhook ────────────────────────────────────
router.post("/events", async (req, res) => {
  const { message } = req.body ?? {};

  if (message?.type === "end-of-call-report") {
    const callId = message.call?.id;
    const { endedReason, duration } = message ?? {};
    console.log(
      `[voice.end] callId=${callId} reason=${endedReason} duration=${duration}s`
    );

    const transcript = message.artifact?.transcript;
    const patientId = callPatientMap.get(callId);
    if (transcript && patientId) {
      try {
        await repo.storeTranscript(patientId, transcript);
      } catch (err) {
        console.error(`[tool.error] storeTranscript ${err.message}`);
      }
      callPatientMap.delete(callId);
    }
  }

  res.sendStatus(200);
});

// ─── Tool handlers ─────────────────────────────────────────────────

async function handleLookup({ phone_number }) {
  if (!phone_number) return { found: false };
  const patient = await repo.findByPhone(phone_number);
  if (!patient) return { found: false };
  return {
    found: true,
    patient_id: patient.patient_id,
    first_name: patient.first_name,
    last_name: patient.last_name,
  };
}

async function handleRegister(args, callId) {
  const parsed = patientCreate.safeParse(args);
  if (!parsed.success) {
    const invalid_fields = parsed.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    return { success: false, invalid_fields };
  }

  console.log(`[voice.register] ${JSON.stringify(parsed.data)}`);

  try {
    const row = await repo.createPatient(parsed.data);
    if (callId) callPatientMap.set(callId, row.patient_id);
    return { success: true, patient_id: row.patient_id, first_name: row.first_name };
  } catch (err) {
    if (err.code === "23505") {
      // Duplicate phone — the partial unique index fires here
      const existing = await repo.findByPhone(parsed.data.phone_number);
      return {
        success: false,
        duplicate: true,
        patient_id: existing?.patient_id,
        message: "A patient with this phone number is already registered.",
      };
    }
    console.error(`[tool.error] register_patient ${err.message}`);
    return { success: false, message: "failed to save patient" };
  }
}

async function handleUpdate({ patient_id, ...fields }) {
  if (!patient_id) return { success: false, message: "patient_id is required" };

  const parsed = patientUpdate.safeParse(fields);
  if (!parsed.success) {
    const invalid_fields = parsed.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    return { success: false, invalid_fields };
  }

  if (Object.keys(parsed.data).length === 0) {
    return { success: false, message: "no fields to update" };
  }

  const row = await repo.updatePatient(patient_id, parsed.data);
  if (!row) return { success: false, message: "patient not found" };
  return { success: true };
}

export default router;
