# Shared SofiaUI voice for SamjuniorsOS

This patch replaces the OS desktop's **second** push-to-talk WebSocket / Deepgram
voice interface with a visual/control surface over the **already-mounted**
`getSophiaOS()` singleton. The full-screen Sofia tab and OS desktop now use the
same Gemini Live / provider fallback, the same microphone, context, audio output,
and interrupt path. The old bridge/Deepgram modules remain in the repository for
other callers, but are not mounted in the OS shell by default.

## Apply

Run at the repository root on the matching `main` branch:

```sh
git apply --check SamjuniorsOS-voice-unification.patch
git apply SamjuniorsOS-voice-unification.patch
npm run typecheck
npm run lint
npx tsx tests/sophia/os_shared_voice_contract.test.ts
npm run test:smoke
```

## Check with real audio

1. Run SamjuniorsOS with valid `GEMINI_API_KEY` / configured provider.
2. Open Sofia, grant mic permission, activate live voice and say a sentence.
3. Switch to the SamjuniorsOS tab *during* the same live session. It must keep
   talking/listening without opening another WebSocket or requiring Space/PTT.
4. Interrupt her while speaking and say a follow-up. Verify the mic resumes
   and only one response plays. Repeat at least 10 turns.
5. End voice on the OS desktop and verify the Sofia tab shows it stopped too.
6. Revoke microphone permissions and verify a visible error instead of a fake
   "listening" state. Check HTTPS or `localhost` browser security requirements.
7. Disable your cloud key to verify fallback error messaging; check browser
   developer console and server logs for the actual provider cause.

## For the legacy `dev:ws` gateway (separate process)

The old in-memory tickets did **not** transfer between the Next.js and gateway
processes. To enable cross-process encrypted, single-use tickets, configure the
SAME random 32+ byte `LIVE_WS_TICKET_SECRET` in both process environments. The
standalone gateway loads Next's `.env.local` via `@next/env`. Restart both.

Generate a secret locally, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Never commit the secret or log live tickets. If the secret is unset the old
same-process ticket behavior remains, so split-process auth still requires it.

## Important limits

This is a code-review patch, not a verified live-audio deployment. Browser
mic/speaker tests and `npm run typecheck` must run in a checked-out repository.
**Integration trade-off:** the desktop now uses SofiaUI's existing provider
and `controlLayer` execution flow, rather than the former Deepgram →
`executeSophiaTurn` path. This matches SofiaUI's natural voice but is **not**
a proof of equivalence for SamjuniorsOS tool permissions, audit, durable
memory or canonical-turn idempotency. Before enabling sensitive OS actions,
review `controlLayer` and the `/api/sophia/*` adapters against the canonical
authorization/approval rules. Do not treat speech parity as governance parity.
The legacy PTT gateway modules are kept in the tree for reversible migration.
