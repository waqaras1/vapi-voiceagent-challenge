import "dotenv/config";
import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import patientRoutes from "./routes/patients.js";
import vapiRoutes from "./routes/vapi.js";
import { healthCheck } from "./repository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// ─── Request logging ───────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ─── Optional Vapi shared-secret auth ──────────────────────────────
const VAPI_SECRET = process.env.VAPI_SECRET;
if (VAPI_SECRET) {
  app.use("/vapi", (req, res, next) => {
    if (req.headers["x-vapi-secret"] !== VAPI_SECRET) {
      return res.status(401).json({ data: null, error: { message: "unauthorized" } });
    }
    next();
  });
}

// ─── Routes ────────────────────────────────────────────────────────
app.use("/patients", patientRoutes);
app.use("/vapi", vapiRoutes);

app.get("/health", async (_req, res) => {
  const db = await healthCheck();
  res.json({ data: { status: "ok", db } });
});

// Serve the voice agent system prompt as plain text
const agentPrompt = readFileSync(join(__dirname, "prompts", "agent.md"), "utf-8");
app.get("/agent-prompt", (_req, res) => {
  res.type("text/plain").send(agentPrompt);
});

app.get("/", (_req, res) => res.json({
  data: {
    service: "CareCloud Patient Registration API",
    endpoints: ["/health", "/patients", "/patients/:id", "/agent-prompt"],
  },
  error: null,
}));

// ─── Error handler ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack ?? err.message);
  res.status(500).json({
    data: null,
    error: { message: "internal server error" },
  });
});

export default app;
