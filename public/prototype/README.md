# SamJuniorsOS — Core V3 / Astra-Inspired Interaction Redesign

## 1. Overview & Vision
This document outlines the **Core V3** prototype redesign for the SamJuniorsOS Command Center. Rather than treating the central orb as a decorative visual gimmick, Core V3 establishes the **Central Core as a living, intelligent operating interface** for running an AI-native company.

Inspired by interaction principles from OpenAI Astra (contextual awareness, persistent intent, multi-step transparent progress, human steering, focused decision gates), Core V3 translates these capabilities into the governed, founder-led paradigm of SamJuniorsOS.

---

## 2. The 7 Core Operational States

Core V3 replaces previous simulation states with a clean, product-oriented 7-state lifecycle:

| State | Visual Behavior | Operational Meaning | Core Work Surface Display |
| :--- | :--- | :--- | :--- |
| **`1. READY`** | Rhythmic breathing, calm slow particles | Core is idle and awaiting Founder intent | Clean minimal surface; command bar prominent |
| **`2. UNDERSTANDING`** | Particles converge inward toward center | Context gathering across memory & state | Intent quote + considered context chips |
| **`3. WORKING`** | Controlled particle circulation | Multi-step task execution in progress | Task checklist + `[ ⟳ Redirect ]` & `[ ⏹ Stop ]` |
| **`4. WAITING_FOR_FOUNDER`** | Slow, focused warm amber beacon | Consequential decision requires judgment | Decision context, evidence, impact, `[ Sign & Ratify ]` / `[ Reject ]` |
| **`5. EXECUTING`** | Directional, structured kinetic flow | Deterministic sandbox pass active | Step progress checklist + `[ ⏹ Stop ]` |
| **`6. COMPLETED`** | Gentle emerald settling bloom | Work finished & durably committed | Outcome summary, next actions, `[ Return to Ready ]` |
| **`7. BLOCKED`** | Restrained warning boundary (no glitch) | Invariant safety floor breached | Diagnostic failure rationale & prerequisite actions |

---

## 3. Key Interaction Capabilities

### A. The Core Work Surface
- Located contextually directly below the Core.
- Appears when the Core is actively processing (`UNDERSTANDING`, `WORKING`, `WAITING_FOR_FOUNDER`, `EXECUTING`, `COMPLETED`, `BLOCKED`) and recedes when in `READY`.
- **Operational Transparency, Not Chain-of-Thought**: Displays concise task progress, data inputs, and rationale without exposing raw model tokens or internal prompts.

### B. Founder Steering & Interruption
- While the Core is `WORKING` or `EXECUTING`, the Founder can steer ongoing work in real-time.
- Clicking **`[ ⟳ Redirect ]`** opens a focused popover:
  - *Focus on product context*
  - *Focus on market research*
  - *Show me findings so far*
  - *Give Core another instruction*
- Clicking **`[ ⏹ Stop ]`** gracefully halts execution and returns the Core to `READY`.

### C. Jarvis Mode vs. Manual Mode
- **Core is the Operating Interface**: Jarvis is the natural-language conversational layer; Manual is direct unmediated navigation.
- **AI Credits Governance**: Clicking the `[⚡ Credits: 850]` chip simulates credit depletion. When depleted, Jarvis gracefully disables (`JARVIS UNAVAILABLE`), while Manual operation remains 100% accessible. AI credits never gate or compromise access to the underlying OS.
- **Manual Navigation**: Accesses all 7 governed OS modules directly (`Company`, `Work`, `Decisions`, `Research`, `Workforce`, `Activity`, `Audit`).

### D. Zero Fabricated Facts
- Fixed watermark: `DEMO STATE · NO LIVE COMPANY DATA CONNECTED`.
- Roster strictly reflects v1 reality: **Sophia (COO/Planner)** and **Thorne (Systems Worker)**. Maya, Julian, Elena, and Marcus are designated as standby/target-state non-v1 architectures.

---

## 4. How to Test & Review

- **Direct File**: Open [`public/prototype/index.html`](file:///e:/Projects/SamjuniorsProducts/SamjuniorsOS/public/prototype/index.html) in your browser.
- **Dev Server**: Navigate to `http://localhost:3000/prototype/`.
- **Hotkeys**:
  - `1` through `7`: Instantly cycle the 7 Core states.
  - `C`: Toggle Company State sheet.
  - `W`: Toggle Workforce drawer.
  - `A`: Toggle Activity sheet.
  - `M`: Toggle Messenger.
  - `Escape`: Close any open sheet, popover, or modal.

---

## 5. Scope & What is Intentionally NOT Implemented
- **Backend/API Execution**: All steering, state transitions, and responses run client-side in prototype code.
- **Zero Database / Production Mutations**: No Prisma schemas, Clerk auth rules, cryptographic runtime gates, or live data stores are touched.
