/**
 * Core Web Vitals Telemetry and Observer
 * Step G8.3: Performance budgets enforced in CI (LCP, INP, CLS, JavaScript size)
 */

export interface WebVitalMetric {
  name: 'LCP' | 'INP' | 'CLS';
  value: number;
  unit: 'ms' | 'score';
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

export interface WebVitalsThresholds {
  LCP_MS: number;
  INP_MS: number;
  CLS: number;
}

export const CANONICAL_BUDGETS: WebVitalsThresholds = {
  LCP_MS: 2500,
  INP_MS: 200,
  CLS: 0.10,
};

export interface JourneyVitalsMeasurement {
  journeyId: string;
  lcpMs: number;
  inpMs: number;
  cls: number;
  passed: boolean;
  violations: string[];
}

class VitalsRegistry {
  private metrics: Map<string, WebVitalMetric> = new Map();
  private clsEntries: Array<{ value: number }> = [];
  private observerInitialized = false;

  public init() {
    if (this.observerInitialized || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      // 1. Largest Contentful Paint (LCP)
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          const value = lastEntry.startTime;
          this.recordMetric('LCP', value, 'ms', value <= CANONICAL_BUDGETS.LCP_MS ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor');
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // 2. Cumulative Layout Shift (CLS)
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            this.clsEntries.push(entry);
          }
        }
        const totalCls = this.clsEntries.reduce((acc, curr) => acc + (curr.value || 0), 0);
        this.recordMetric('CLS', totalCls, 'score', totalCls <= CANONICAL_BUDGETS.CLS ? 'good' : totalCls <= 0.25 ? 'needs-improvement' : 'poor');
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      // 3. Interaction to Next Paint (INP) proxy via event timing
      if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
        const inpObserver = new PerformanceObserver((entryList) => {
          let maxDuration = 0;
          for (const entry of entryList.getEntries()) {
            if (entry.duration > maxDuration) {
              maxDuration = entry.duration;
            }
          }
          if (maxDuration > 0) {
            const current = this.metrics.get('INP')?.value || 0;
            const finalVal = Math.max(current, maxDuration);
            this.recordMetric('INP', finalVal, 'ms', finalVal <= CANONICAL_BUDGETS.INP_MS ? 'good' : finalVal <= 500 ? 'needs-improvement' : 'poor');
          }
        });
        inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
      }

      this.observerInitialized = true;
    } catch {
      // Graceful fallback in environments without full PerformanceObserver support
    }
  }

  public recordMetric(
    name: 'LCP' | 'INP' | 'CLS',
    value: number,
    unit: 'ms' | 'score',
    rating: 'good' | 'needs-improvement' | 'poor'
  ) {
    this.metrics.set(name, {
      name,
      value: Number(value.toFixed(unit === 'ms' ? 1 : 4)),
      unit,
      rating,
      timestamp: Date.now(),
    });
  }

  public getMetric(name: 'LCP' | 'INP' | 'CLS'): WebVitalMetric | undefined {
    return this.metrics.get(name);
  }

  public getSnapshot(): Record<string, WebVitalMetric> {
    return Object.fromEntries(this.metrics.entries());
  }

  public reset() {
    this.metrics.clear();
    this.clsEntries = [];
  }
}

export const vitalsRegistry = new VitalsRegistry();

/**
 * Validates a journey's measurements against canonical budgets.
 */
export function evaluateJourneyVitals(
  journeyId: string,
  measurements: { lcpMs: number; inpMs: number; cls: number },
  budgets: WebVitalsThresholds = CANONICAL_BUDGETS
): JourneyVitalsMeasurement {
  const violations: string[] = [];
  if (measurements.lcpMs > budgets.LCP_MS) {
    violations.push(`LCP ${measurements.lcpMs}ms exceeds budget ${budgets.LCP_MS}ms`);
  }
  if (measurements.inpMs > budgets.INP_MS) {
    violations.push(`INP ${measurements.inpMs}ms exceeds budget ${budgets.INP_MS}ms`);
  }
  if (measurements.cls > budgets.CLS) {
    violations.push(`CLS ${measurements.cls} exceeds budget ${budgets.CLS}`);
  }

  return {
    journeyId,
    lcpMs: measurements.lcpMs,
    inpMs: measurements.inpMs,
    cls: measurements.cls,
    passed: violations.length === 0,
    violations,
  };
}
