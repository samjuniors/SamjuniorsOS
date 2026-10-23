# Current development setup — kit/integration

**Applicability:** SamjuniorsOS branch kit/integration at d209f67b4414b4e211ef25291d5782c615ea7930 (23 October 2026).  
**Status:** Source-code-grounded guide; commands have NOT been executed or certified in this audit.  
**Other branches:** Follow the corresponding branch's package.json and server entrypoint; this guide does not generalize to all branches.

## What changed

The active scripts use **Vite + Express**, rather than Next.js:

- package.json: npm run dev = tsx server.ts; npm run build = vite build; npm run start = tsx server.ts.
- server.ts: Express application and integrated realtime WebSocket at /api/live-ws.
- Default HTTP port: 3000 (PORT environment variable controls it).
- The previous npm run dev:ws command is **not present on this branch**. Do not start a separate port-3001 gateway based on docs/SETUP.md or the old patch guide.

## Checkout and safe first run

Clone the repository and select the **target branch** before installing:

~~~sh
git clone https://github.com/samjuniors/SamjuniorsOS.git
cd SamjuniorsOS
git switch kit/integration
npm install
cp .env.example .env.local
~~~

The code in server.ts explicitly loads .env.local then .env via dotenv. Keep credentials in ignored local environment files; do not commit them. Review .env.example for the supported keys. Some comments in that template still reference Next.js and the old gateway; the application entrypoint above takes precedence.

For the currently configured server-side Gemini Live experience, supply a valid GEMINI_API_KEY in .env.local, subject to your account access, billing and model availability. The model name in server.ts and the actual provider configuration should be verified against current Google API support; this audit did not call the external API. When no key is configured, do not infer that realtime voice is functional merely because a greeting plays.

**Database safety:** package.json defines db:push with --accept-data-loss. Do not run that script against existing user/company data or a production database for a documentation test. Back up data and review the proposed Prisma changes first. Prisma generation is already included in postinstall.

Start the single app process:

~~~sh
npm run dev
~~~

Open http://localhost:3000 and allow mic access only if you intend to test voice. The intended same-origin realtime transport path is ws://localhost:3000/api/live-ws in local HTTP development. In production, use correctly secured HTTPS/WSS and independently verify authentication, CORS, consent and credential scoping.

## Useful read-only checks

~~~sh
npm run typecheck
npm run lint
npm test
~~~

These are defined by package.json. Their success was **NOT VERIFIED** in this GitHub-only audit.

In the browser, check the Network tab for /api/status and the WebSocket connection to /api/live-ws. Never post tokenized WebSocket URLs or credentials into issues.

## Where voice is wired

- src/App.tsx: app entry/router
- src/os/App.tsx: mounts the Sofia surface and shared OS presence
- src/sofia/App.tsx: renders the new SofiaVoiceCompanion
- src/components/SofiaVoiceCompanion.tsx: current Sofia display
- src/os/components/voice/SharedSophiaVoicePresence.tsx: OS desktop controls the SofiaOS singleton
- server.ts: HTTP and WebSocket host

See [Voice documentation map](../voice/README.md) and [document reconciliation audit](../audit/KIT_INTEGRATION_DOCUMENT_RECONCILIATION_2026-10-23.md).

## Historical setup instructions

[docs/SETUP.md](../SETUP.md) and the root README were authored for an older Next.js runtime. They are preserved for provenance pending a full reference audit, but are not the startup contract for this branch.
