/**
 * Exact binomial intervals. Pure, with no Node imports, so the browser bench and the eval CLI
 * use the same code.
 */
function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let term = Math.pow(1 - p, n);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= ((n - i + 1) / i) * (p / (1 - p));
    sum += term;
  }
  return Math.min(1, sum);
}

/** Exact (Clopper-Pearson) two-sided interval for k successes in n, as proportions. */
export function exactInterval(k: number, n: number, confidence = 0.95): [number, number] {
  if (n <= 0) return [0, 1];
  const alpha = (1 - confidence) / 2;
  const solve = (f: (p: number) => boolean) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const lower = k === 0 ? 0 : solve((p) => 1 - binomialCdf(k - 1, n, p) < alpha);
  const upper = k === n ? 1 : solve((p) => binomialCdf(k, n, p) > alpha);
  return [lower, upper];
}

export const formatInterval = ([lo, hi]: [number, number]) => `${(lo * 100).toFixed(1)} to ${(hi * 100).toFixed(1)}%`;
