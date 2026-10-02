/**
 * Minimal ambient type declarations for the `bun:test` runner surface used by
 * the Phase 3.4.1 security tests. The project's root tsconfig is owned by
 * Next.js; installing @types/bun globally perturbs Node signal typing in
 * unrelated example files, so the test suite ships this precise local shim
 * instead. Runtime is bun's built-in test runner (no extra dependency).
 */
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  export interface ExpectMatchers {
    toBe(expected: unknown): void;
    toMatch(pattern: RegExp | string): void;
    toHaveLength(expected: number): void;
    toEqual(expected: unknown): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeGreaterThan(expected: number): void;
  }
  export function expect(actual: unknown): ExpectMatchers;

  /**
   * Module mocking surface (used by the M4-A default-extractor regression
   * child, which fakes only the z-ai SDK network boundary). `mock.module`
   * also works in plain `bun <script>` runs, not just under `bun test`.
   */
  export interface BunMockModuleApi {
    module(specifier: string, factory: () => unknown): void;
  }
  export const mock: BunMockModuleApi;
}
