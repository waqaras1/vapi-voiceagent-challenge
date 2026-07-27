# CareCloud Voice Agent

AI-powered patient intake system for CareCloud Family Health. A caller dials in, speaks with an AI voice agent (Riley), and their demographic information is collected conversationally and persisted to Supabase Postgres. The system uses Vapi for telephony/STT/LLM/TTS and exposes a REST API for direct CRUD access.

## Architecture

```
┌────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌───────────────┐
│ Caller │────▶│ Vapi (Phone/STT/    │────▶│ Express API      │────▶│ Supabase      │
│ (PSTN) │◀────│      LLM/TTS)       │◀────│ /vapi/tools      │◀────│ Postgres      │
└────────┘     └─────────────────────┘     │ /vapi/events     │     └───────────────┘
                                           │                  │
                                           │ /patients (REST) │◀──── Admin / Dashboard
                                           │ /health          │
                                           │ /agent-prompt    │
                                           └──────────────────┘
```

## Tech Stack

| Technology | Justification |
|---|---|
| **Node 20** | LTS with native test runner and `--watch` support — no extra dev tooling needed |
| **Express 4** | Mature, minimal HTTP framework — right-sized for a webhook + REST API |
| **pg** | Direct Postgres driver — full control over queries without ORM overhead |
| **Zod** | Runtime schema validation with great error messages — ideal for LLM-generated payloads |
| **dotenv** | Twelve-factor config from `.env` files |
| **Supabase Postgres** | Managed Postgres with connection pooling — zero-ops database |
| **Vapi** | Handles telephony, STT, LLM orchestration, and TTS — we only write the tools |
| **Railway** | One-click deploy from Git with auto-TLS — no infra management |

## Setup

### Prerequisites

- Node.js 20+
- A Supabase project with the `patients` table created (see `schema.sql`)
- A Vapi account

### Local Development

```bash
# 1. Clone the repo
git clone <REPO_URL>
cd voice-agent

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your Supabase connection string

# 4. Create the database schema (if not already done)
#    Run schema.sql against your Supabase database via the SQL Editor

# 5. Start the dev server
npm run dev

# 6. Run tests (requires DATABASE_URL)
npm test
```

### Vapi Dashboard Setup

1. **Create an Assistant** — go to the Vapi dashboard → Assistants → Create
2. **Import Config** — copy the contents of `src/vapi/assistant.json` and paste into the assistant JSON editor. Replace `${SERVER_URL}` with your deployed Railway URL (e.g., `https://your-app.up.railway.app`)
3. **System Prompt** — the system prompt is embedded in the assistant config. The canonical version lives at `src/prompts/agent.md` and is served at `GET /agent-prompt`
4. **Attach a Phone Number** — go to Phone Numbers → Buy or import a number → assign it to the assistant
5. **Set Server URL** — under the assistant's Advanced settings, set the Server URL to `${SERVER_URL}/vapi/events` for end-of-call reports
6. **(Optional) Set Shared Secret** — if you set `VAPI_SECRET` in your env, add the same value as the `x-vapi-secret` header in Vapi's webhook configuration

### Railway Deployment

```bash
# Railway auto-detects Node.js projects
# Set these environment variables in the Railway dashboard:
#   DATABASE_URL, PORT (Railway sets this), VAPI_SECRET, SERVER_URL
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection string (session pooler) |
| `PORT` | No | Server port (default: 3000, Railway sets this automatically) |
| `VAPI_SECRET` | No | Shared secret for webhook authentication. If set, all `/vapi/*` requests must include `x-vapi-secret` header |
| `SERVER_URL` | No | Public base URL of the deployed app (used in assistant.json) |

## API Endpoints

All responses use the envelope format:
- Success: `{ "data": ..., "error": null }`
- Failure: `{ "data": null, "error": { "message": "...", "details": {...} } }`

### REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check with DB status |
| `GET` | `/agent-prompt` | Voice agent system prompt (text/plain) |
| `GET` | `/patients` | List patients (newest first, limit 200) |
| `GET` | `/patients/:id` | Get patient by UUID |
| `POST` | `/patients` | Create a new patient |
| `PUT` | `/patients/:id` | Partial update |
| `DELETE` | `/patients/:id` | Soft delete |

### Vapi Webhooks

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/vapi/tools` | Tool-call webhook (lookup, register, update) |
| `POST` | `/vapi/events` | Server events webhook (end-of-call transcript) |

### Query Filters

`GET /patients` supports optional query parameters:

- `?last_name=Smith` — case-insensitive exact match
- `?date_of_birth=1990-03-15` — exact date match
- `?phone_number=555-867-5309` — digits are stripped before matching

### Example Requests

**Create a patient:**
```bash
curl -X POST <API_BASE_URL>/patients \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "03/15/1990",
    "sex": "Female",
    "phone_number": "555-867-5309",
    "address_line_1": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "zip_code": "73301"
  }'
```

Response (201):
```json
{
  "data": {
    "patient_id": "a1b2c3d4-...",
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "1990-03-15",
    "sex": "Female",
    "phone_number": "5558675309",
    "address_line_1": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "zip_code": "73301",
    "preferred_language": "English",
    "created_at": "2025-01-15T10:30:00.000Z",
    "updated_at": "2025-01-15T10:30:00.000Z",
    "deleted_at": null
  },
  "error": null
}
```

**Validation error (422):**
```json
{
  "data": null,
  "error": {
    "message": "validation failed",
    "details": {
      "phone_number": "must be exactly 10 digits",
      "state": "must be a valid US state abbreviation"
    }
  }
}
```

**Get a patient:**
```bash
curl <API_BASE_URL>/patients/a1b2c3d4-...
```

**Update a patient:**
```bash
curl -X PUT <API_BASE_URL>/patients/a1b2c3d4-... \
  -H "Content-Type: application/json" \
  -d '{"city": "Dallas", "zip_code": "75201"}'
```

**Soft delete:**
```bash
curl -X DELETE <API_BASE_URL>/patients/a1b2c3d4-...
```

Response (200):
```json
{
  "data": {
    "patient_id": "a1b2c3d4-...",
    "deleted_at": "2025-01-15T11:00:00.000Z"
  },
  "error": null
}
```

**Health check:**
```bash
curl <API_BASE_URL>/health
```

Response:
```json
{ "data": { "status": "ok", "db": "ok" } }
```

## Prompt Engineering

Key design decisions in the voice agent system prompt:

1. **One question at a time** — Voice conversations break down when the agent asks multiple questions. Each turn collects exactly one piece of information, keeping the cognitive load low for callers who may be elderly or distracted.

2. **Server-side validation as source of truth** — The LLM formats data as best it can, but Zod schemas on the server are the authority. When validation fails, human-readable error messages are returned to the LLM, which asks the caller for corrections. This prevents silent data corruption from LLM hallucination.

3. **Read-back before write** — The agent reads back all collected information and waits for explicit confirmation before calling `register_patient`. This catches mishearings and transcription errors before they hit the database. Single-item correction avoids the tedium of re-reading the entire list.

4. **Graceful failure** — Tool errors get one silent retry. If that fails, the agent apologizes and offers a human handoff rather than looping or going silent. The caller never hears technical jargon.

5. **Silent phone lookup** — After collecting the phone number, the agent checks for existing records without telling the caller. This avoids an awkward pause explanation and only surfaces the result if a match is found, offering an update path.

6. **Digit-by-digit readback** — Phone numbers, DOBs, and ZIP codes are read digit-by-digit to avoid TTS misinterpretation of large numbers.

## Known Limitations & Trade-offs

- **In-memory call-to-patient mapping** — The `callId → patientId` map used to attach end-of-call transcripts is stored in-memory. It is lost on server restart, meaning transcripts from calls in progress during a deploy will not be saved. For production, this should be moved to Redis or a database table.

- **No authentication on REST API** — The `/patients` REST endpoints have no auth. In production, add JWT or API key middleware. The Vapi webhook path has optional shared-secret auth via `VAPI_SECRET`.

- **Single-instance only** — The in-memory map also means this cannot scale horizontally without a shared store. Railway's single-instance default is fine for the demo.

- **No pagination cursor** — The patient list endpoint uses a hard limit of 200 with no cursor. Sufficient for a demo but not for a production patient registry.

- **Transcript storage is best-effort** — If the server restarts between patient registration and the end-of-call report, the transcript is lost. The patient record itself is safe in Postgres.

- **Phone number as unique identifier** — The partial unique index means only one active patient per phone number. Family members sharing a phone would need the previous record soft-deleted first.

- **No rate limiting** — The API has no rate limiting. In production, add express-rate-limit or similar.

## Next Steps

- [ ] Add Redis for the `callId → patientId` map to survive restarts and enable horizontal scaling
- [ ] Add JWT authentication to the REST API
- [ ] Implement cursor-based pagination on `GET /patients`
- [ ] Add rate limiting middleware
- [ ] Add structured logging (pino) with request IDs for observability
- [ ] Implement a `/vapi/events` handler for `status-update` messages to track call state transitions
- [ ] Add a `calls` table to persist call metadata independently of patient records
- [ ] Set up CI/CD with GitHub Actions (lint, test, deploy to Railway)
- [ ] Add Spanish language support in the voice prompt
- [ ] Implement HIPAA audit logging for all data access
