# Staging Infrastructure Specification (Option A Architecture)

**Gate:** G2.1 — Provision staging hosting and database per infrastructure decision  
**Status:** IMPLEMENTED & VERIFIED  
**Governing Founder Decisions:**
- **Decision G0.3:** Option A — Single VPS with persistent volume & SQLite; Daily automated backups with 30-day retention (`RPO < 24h, RTO < 2h`).
- **Authorization AUTH-2.3C:** Founder authorization to proceed with Option A database persistence migration.

---

## 1. Architectural Topology & Deployment Model

Per the approved Phase 2.3B architecture specification ([`PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md`](./PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md) §9.1), SamJuniorsOS is deployed under **Option A**:

```
                              CLIENT (Desktop / Companion)
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼ (HTTP / REST)                       ▼ (Secure WebSocket)
                   Port 3000                             Port 3001
            ┌────────────────────────────────────────────────────────┐
            │               SamJuniorsOS Staging Node                │
            │                                                        │
            │   ┌─────────────────────┐   ┌──────────────────────┐   │
            │   │  Next.js Standalone │   │ Live WS Companion    │   │
            │   │  (App + Health API) │   │ (Gateway Server)     │   │
            │   └──────────┬──────────┘   └──────────┬───────────┘   │
            │              │                         │               │
            │              ▼                         ▼               │
            │       Prisma Client            Ticket Verification     │
            └──────────────┼─────────────────────────┼───────────────┘
                           │                         │
                 Persistent Mounts         Persistent Mounts
               (/app/db, /app/.data)     (/app/db, /app/.data)
                           │                         │
                           ▼                         ▼
                    ┌──────────────┐          ┌──────────────┐
                    │  SQLite DB   │          │ Durable JSON │
                    │ (custom.db)  │          │ (.data/*.json│
                    └──────┬───────┘          └──────────────┘
                           │
                           ▼ Daily Snapshot (02:00 UTC)
                    ┌──────────────┐
                    │ Daily Backup │ (30-day retention)
                    │  /app/backups│
                    └──────────────┘
```

---

## 2. Ports and Container Exposure

| Port | Service | Protocol | Reachability & Purpose |
|---|---|---|---|
| **3000** | Next.js Standalone Application | HTTP / 1.1 | Cockpit, desktop interface, `/api/*` routes, and canonical `/api/health` check. |
| **3001** | Sophia Live Gateway Companion | WebSocket (`ws://` / `wss://`) | Realtime bidirectional audio streaming, VAD, and voice turn state machine. |

---

## 3. Persistent Volumes

Option A requires that SQLite and durable filesystem stores survive container restarts and rescheduling:

| Host Path | Container Mount | Content & Invariant |
|---|---|---|
| `./db` | `/app/db` | Relational SQLite database (`custom.db`, `-wal`, `-shm`). |
| `./.data` | `/app/.data` | Governed atomic JSON collections (Decisions, Workflows, Memories). |
| `./backups` | `/app/backups` | Compressed timestamped snapshots (`backup_YYYYMMDD_HHMMSS.tar.gz`). |

---

## 4. Healthcheck & Reachability Contract

The canonical health endpoint is exposed at `GET /api/health`:

- **Execution:** Performs a direct `SELECT 1` query against the SQLite database with a strict 2,000ms timeout.
- **Healthy Response (HTTP 200):**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-23T09:50:00.000Z",
    "uptime": 124.5,
    "database": {
      "status": "connected",
      "latencyMs": 4,
      "mode": "authoritative"
    },
    "version": "0.2.1"
  }
  ```
- **Unhealthy Response (HTTP 503):**
  Returned if the database fails to respond within 2 seconds or the connection throws an error.

---

## 5. Automated Backup & Retention Specification

Per Founder Decision `G0.3`, backups run automatically on a daily schedule with a 30-day retention window:

- **Script:** [`scripts/backup-sqlite.sh`](../../scripts/backup-sqlite.sh)
- **Snapshot Technique:** Executes online non-blocking backup via `sqlite3 .backup` or transactional file copy alongside `.data/` state.
- **Retention Policy:**
  ```sh
  find "${BACKUP_DIR}" -name "backup_*.tar.gz" -type f -mtime +30 -exec rm -f {} \;
  ```
- **RPO / RTO Bounds:**
  - **Recovery Point Objective (RPO):** < 24 hours.
  - **Recovery Time Objective (RTO):** < 2 hours (restored by un-taring snapshot into `db/` and restarting container).

---

## 6. Zero-Secret Configuration Record

Staging configuration is managed strictly through environment injection and never committed to source control:
- Configuration template: [`.env.staging.example`](../../.env.staging.example)
- Docker Compose specification: [`docker-compose.staging.yml`](../../docker-compose.staging.yml)
- All secrets (`SAMJUNIORS_DEV_SECRET`, `LIVE_WS_TICKET_SECRET`, `CRON_TRIGGER_SECRET`) are generated via `openssl rand -hex 32` directly on the host machine.
