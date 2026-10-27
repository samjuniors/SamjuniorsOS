# Production Secrets Handling & Rotation Runbook

**Document:** `docs/security/PRODUCTION_SECRETS_HANDLING_AND_ROTATION.md`  
**Author:** Antigravity Security Lane (Gate G3.5)  
**Status:** AUTHORITATIVE & TESTED  
**Scope:** SamJuniorsOS Production Deployment & Always-On Cloud Infrastructure (Milestone M2)

---

## 1. Core Security Invariants

In accordance with `AGENTS.md` (Section 11) and the OWASP Agentic Threat Model (`docs/security/OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md`):

1. **Zero Client Secrets:** Production secrets, provider API keys, and database credentials must never reach client-accessible assets (`dist/assets`, `public/`, or client components). All client assets are automatically scanned by `scripts/scan-client-bundle-secrets.mjs` (`npm run scan:client-secrets`).
2. **Fail-Closed Storage:** No secret is ever committed to Git or pushed to remote repositories. Secrets exist solely in isolated server-side environment variables or protected production secret vaults.
3. **Least Privilege Ingress:** Machine credentials (e.g. `x-cron-secret`) admit exactly one path (`POST /api/workflow/scheduling`) and can never impersonate a Founder session.
4. **Constant-Time Verification:** All secret comparisons in middleware and route handlers use constant-time XOR comparison to prevent side-channel timing leaks.

---

## 2. Production Secrets Inventory

| Secret Identifier | Domain / Purpose | Ingress / Usage Point | Minimum Rotation Cadence |
|---|---|---|---|
| `CRON_TRIGGER_SECRET` | Machine auth for autonomous scheduler heartbeat | Middleware `proxy.ts`, `/api/workflow/scheduling` | 90 days or on compromise |
| `SAMJUNIORS_DEV_SECRET` | Single-tenant Founder executive authorization | Middleware `proxy.ts`, `/api/auth/founder-session` | 90 days or on compromise |
| `CLERK_SECRET_KEY` | Identity verification & session authentication | Server auth middleware & user resolution | 180 days or on compromise |
| `CLERK_WEBHOOK_SECRET` | Inbound Clerk webhook signature verification | `/api/auth/webhook` | 180 days or on compromise |
| `ELEVENLABS_API_KEY` | Neural text-to-speech voice generation | `/api/tts/elevenlabs`, `/api/sophia/mouth/speak` | 90 days or on compromise |
| `DEEPGRAM_API_KEY` | Realtime streaming speech-to-text token minting | `/api/sophia/dg/session` | 90 days or on compromise |
| `OPENAI_API_KEY` | Primary autonomous LLM reasoning & embeddings | `src/lib/server/ai/providers` | 90 days or on compromise |
| `ANTHROPIC_API_KEY` | Secondary reasoning provider | `src/lib/server/ai/providers` | 90 days or on compromise |
| `GEMINI_API_KEY` | Epistemic multimodal processing | `src/lib/server/ai/providers` | 90 days or on compromise |
| `DATABASE_URL` | Persistent SQLite file path or PostgreSQL URI | `prisma/schema.prisma`, `src/lib/server/db` | On host migration or compromise |

---

## 3. Cryptographic Entropy & Generation Standard

All internally-managed secrets must be generated using cryptographically secure pseudorandom number generators (CSPRNG) with at least 256 bits (32 bytes) of entropy:

```bash
# Generate 256-bit hexadecimal secret (default for CRON_TRIGGER_SECRET, SAMJUNIORS_DEV_SECRET):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Alternative shell command:
openssl rand -hex 32
```

---

## 4. Step-by-Step Rotation Procedures

### Procedure A: Rotating Internal Machine Secrets (`CRON_TRIGGER_SECRET`)

The scheduler heartbeat (`mini-services/scheduler-heartbeat`) calls `POST /api/workflow/scheduling` with header `x-cron-secret`.

1. **Generate New Secret:**
   ```bash
   NEW_CRON_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```
2. **Update Server Environment:**
   Update the cloud server's `.env.production` or systemd service environment:
   ```env
   CRON_TRIGGER_SECRET="<NEW_CRON_SECRET>"
   ```
3. **Reload Server Application:**
   Trigger zero-downtime process reload (e.g. `pm2 reload samjuniors-os` or systemd reload).
4. **Update Scheduler Heartbeat Client:**
   Update the heartbeat runner's environment with `<NEW_CRON_SECRET>` and restart heartbeat service.
5. **Verify Verification Trail:**
   Inspect response from heartbeat POST:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/workflow/scheduling -H "x-cron-secret: $NEW_CRON_SECRET"
   # Must return 200 OK.
   ```
   Verify old secret is rejected:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/workflow/scheduling -H "x-cron-secret: old-stale-secret"
   # Must return 401 Unauthorized.
   ```

---

### Procedure B: Rotating Third-Party Provider Keys (ElevenLabs, Deepgram, LLM Providers)

1. **Log in to Provider Dashboard:**
   Navigate to the provider API Keys management page (e.g., ElevenLabs / Deepgram / OpenAI).
2. **Mint Secondary Secret:**
   Create a new API key labeled `SamJuniorsOS-Prod-YYYY-MM`. *Do not delete the active key yet.*
3. **Inject Into Server Environment:**
   Update `.env.production` on the production host with the newly minted key.
4. **Perform Live Smoke Test:**
   Execute provider-specific verification endpoint (e.g. `/api/tts/voices` or `/api/sophia/mouth/speak`).
5. **Revoke Previous Key:**
   Return to provider dashboard and permanently delete/deactivate the prior key.
6. **Audit Logs:**
   Verify `server.log` confirms healthy traffic with zero authentication failures.

---

### Procedure C: Emergency Compromise Protocol

If any secret is leaked, committed, or suspected compromised:

1. **Immediate Invalidation:** Revoke the exposed credential immediately at the third-party provider or generate a replacement for internal tokens.
2. **Deploy Replacement:** Update server environment variables and restart process immediately.
3. **Run Full Repository & Client Scan:**
   ```bash
   npm run scan:secrets         # Gitleaks full-history verification
   npm run scan:client-secrets  # Client bundle leak verification
   ```
4. **Audit Audit Logs:**
   Inspect server access logs for anomalous requests during the exposure window.

---

## 5. Verification & Testing Evidence

This rotation protocol was verified under automated test suite:
- **Test Suite:** `tests/sophia/g3_5_secrets_handling_and_rotation.test.ts`
- **Verified Invariants:**
  1. Rejection of unauthenticated and invalid credentials (401).
  2. Zero-downtime transition to rotated secret.
  3. Strict refusal of the retired secret after rotation.
  4. Client bundle scanning (`scripts/scan-client-bundle-secrets.mjs`) passes with zero client leaks.
