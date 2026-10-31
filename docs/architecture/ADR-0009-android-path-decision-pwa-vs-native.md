# ADR 0009: Android Path Decision — Progressive Web App (PWA) vs. Native Client

- **STATUS:** PROPOSED (Ready for Founder Ratification)
- **DECISION:** Implement a high-performance, installable Progressive Web App (PWA) as the primary Android mobile surface for SamJuniorsOS, while preserving a clean boundary for an optional lightweight native background voice companion shell if background wake-word VAD is required in a future milestone.
- **SCOPE:** Gate G8.4 (Milestone M5 — Cockpit and voice that feel finished)
- **AUTHORITY:** Binding upon Founder approval per `AGENTS.md` and `.agent/product-kit/MASTER_PROMPT.md`.

---

## WHY

SamJuniorsOS is an AI-native company operating system designed to give the founder continuous oversight and control over company operations, decisions, cryptographic approvals, and active workstreams. Per `PRODUCT.md` Section 9:
> *"Platform order: Windows first, web later, Android later. Android and web are client surfaces over the same brain."*

Per `AGENTS.md` Section 7:
> *"The architectural destination of SamJuniorsOS is: ONE Sophia · ONE Authoritative Company State · MULTIPLE Execution Surfaces. Cloud Responsibility: Authoritative company state, databases, schemas, central reasoning, workflow engine. Local/Client Responsibility: Perceptual & Execution Boundary (microphone, speakers, touch, notifications). A client runtime must never declare itself an alternate authoritative company database."*

The Founder needs to access the Cockpit, review strategic briefs, sign off on consequential approvals, and converse with Sophia from an Android smartphone. We must evaluate whether to build:
1. **Option A: Progressive Web App (PWA) Client**
2. **Option B: Full Native Android App (Kotlin / Jetpack Compose)**
3. **Option C: Hybrid (PWA for full Cockpit + Lightweight Native Background Shell)**

---

## ALTERNATIVES CONSIDERED

### Option A: Progressive Web App (PWA) First (RECOMMENDED)
- **Architecture:** The responsive Vite + React client is equipped with a Web App Manifest (`public/manifest.json`), mobile meta tags, touch-optimized ergonomics, and service worker capabilities. It is installable directly from Chrome/Edge on Android ("Add to Home Screen" / "Install app").
- **Pros:**
  1. **Zero Maintenance Divergence:** 100% code reuse across desktop, web, and mobile. Every component (Cockpit, Decisions, Approvals, Activity, Voice Presence, Chat) is instantly available without re-implementing state stores, cryptographic hashing, or UI in Kotlin/Compose.
  2. **Instant Continuous Deployment:** Updates deploy instantly to staging/cloud VPS. The founder never waits for Google Play app store review cycles or manual APK sideloading.
  3. **High Performance & Small Footprint:** Total JavaScript bundle size is only ~1.25 MB (gzip ~372 kB), meeting all performance budgets (LCP <= 1.5s, INP <= 50ms, CLS <= 0.02) verified in Gate G8.3.
  4. **Full Web Standards Capabilities:** Supports full-duplex WebSockets, Web Audio API, Web Push notifications, full-screen standalone display (`display: standalone`), and responsive touch interaction.
  5. **Direct Architectural Fit:** Perfectly honors `PRODUCT.md:133` and `AGENTS.md` Section 7 without adding redundant build infrastructure.
- **Cons:**
  1. Background microphone listening is constrained when the phone screen is locked (Android browsers pause audio input when backgrounded).

### Option B: Full Native Android Client (Kotlin / Jetpack Compose)
- **Architecture:** A dedicated Android repository/module built with Kotlin, Jetpack Compose, Retrofit, and LiveKit/WebRTC SDKs.
- **Pros:**
  1. Persistent background services and system-level hotword/VAD integration.
  2. Deep Android OS widget and system tray integrations.
- **Cons:**
  1. **Massive Redundant Engineering:** Requires re-writing all FOL surfaces, stores, cryptographic payload verifiers, and state machines in Kotlin.
  2. **Violates Lean Build vs. Buy (`AGENTS.md` Section 13):** High maintenance burden and slower release cadence for a single-founder internal company OS.
  3. **Divergent State Risk:** Two separate frontends create inevitable behavioral discrepancies.

### Option C: Hybrid Architecture (PWA First + Seam for Future Native Companion)
- **Architecture:** Ship the PWA immediately for all visual surfaces (Cockpit, Decisions, Approvals, Activity, Spotlight, Chat). If continuous background voice capture (screen-off hotword) becomes a priority in Milestone M6/M7, build a minimal Android foreground service companion APK (< 200 lines of Kotlin) that streams audio to the existing WebSocket gateway without duplicating UI.

---

## BOUNDARIES

- **Client Only:** Android devices act strictly as perceptual and governance surfaces (touch input, audio streaming, visual display, cryptographic sign-off).
- **Zero Local Brain:** The Android client never runs local LLMs or maintains a detached company database. All mutations flow through authenticated server routes (`/api/workflow/approvals`, `/api/decisions`, etc.).
- **Fail-Closed Security:** Approvals require valid founder session tokens and SHA-256 payload binding regardless of client platform.

---

## RISKS

| Risk | Impact | Mitigation |
|---|---|---|
| Background audio paused when browser minimized | Voice session drops on lock | PWA handles reconnect cleanly; approvals & decisions remain 100% accessible via notifications. |
| Browser chrome taking screen real estate | Reduced canvas visibility | `display: standalone` in `manifest.json` launches borderless full-screen application. |
| Inadvertent zoom on double-tap | Layout disruption | `touch-action: manipulation` and non-scalable input font sizing ($\ge 16\text{px}$) prevents iOS/Android auto-zoom. |

---

## MIGRATION / REVERSIBILITY

Adopting PWA first is 100% reversible and zero-waste:
- Every responsive enhancement improves desktop web, laptop touchscreens, and mobile browsers alike.
- If a native wrapper (Trusted Web Activity / Capacitor / Kotlin shell) is desired later, the PWA directly serves as the embedded web view with 0 refactoring.

---

## NEXT ACTION

1. Founder ratification of this decision brief.
2. Verify responsive layout on device profiles and execute automated test suite.
