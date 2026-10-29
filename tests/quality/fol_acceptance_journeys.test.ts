import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Gate G5.1 — Founder Operating Loop v1 Acceptance Journeys Specification", () => {
  const docPath = path.resolve(__dirname, "../../doc/FOL_V1_ACCEPTANCE_JOURNEYS.md");

  it("1. Acceptance journeys specification document must exist and be non-empty", () => {
    expect(fs.existsSync(docPath), `Expected document to exist at: ${docPath}`).toBe(true);
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content.length).toBeGreaterThan(1500);
  });

  it("2. Document must formally reference governing authority and ratified decision G0.2", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("G0.2");
    expect(content).toContain("Option C");
    expect(content).toContain("AGENTS.md");
    expect(content).toContain("PRODUCT.md");
    expect(content).toContain("VISION.md");
  });

  it("3. Document must define all five core acceptance journeys (J1 through J5)", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toMatch(/Journey 1 \(J1\):.*Cockpit/i);
    expect(content).toMatch(/Journey 2 \(J2\):.*Executive Directive/i);
    expect(content).toMatch(/Journey 3 \(J3\):.*Cryptographic Approval Gate/i);
    expect(content).toMatch(/Journey 4 \(J4\):.*Strategic Decision/i);
    expect(content).toMatch(/Journey 5 \(J5\):.*Epistemic Truth.*Crash Recovery/i);
  });

  it("4. Document must specify non-negotiable security and governance invariants", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("SHA-256");
    expect(content).toContain("payloadHash");
    expect(content).toMatch(/fail-closed/i);
    expect(content).toMatch(/voice.*refus/i);
    expect(content).toContain("Personal Mind");
    expect(content).toContain("Company Brain");
  });

  it("5. Document must define quantitative measurable success metrics", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("Measurable Success Metrics");
    expect(content).toMatch(/1500/);
    expect(content).toMatch(/800/);
    expect(content).toMatch(/0%\s*voice/i);
    expect(content).toMatch(/100%\s*server-authoritative/i);
  });

  it("6. Document must specify Loading, Empty, and Error states for all four surfaces", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("Cockpit");
    expect(content).toContain("Decisions");
    expect(content).toContain("Approvals");
    expect(content).toContain("Activity");
    expect(content).toContain("Loading:");
    expect(content).toContain("Empty:");
    expect(content).toContain("Error:");
  });
});
