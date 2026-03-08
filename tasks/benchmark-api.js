/**
 * Task: benchmarkApi
 *
 * Runs latency benchmarks against the NOUS API.
 * Fires 5 sequential requests per endpoint, computes p50/p95/p99.
 * Flags endpoints degrading over time by comparing to baseline.
 */

import fetch from 'node-fetch';
import fs from 'fs';

const BENCHMARKS = [
  { method: 'GET',  path: '/health' },
  { method: 'GET',  path: '/api/products' },
  { method: 'POST', path: '/api/auth/challenge', body: { publicKey: 'CbcM9ELJfGs8FfQYbRGcW61gnT1QsLN8TVWRTeJeABZ' } },
];

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function benchmarkApi({ log, API_URL }) {
  const results = {};

  for (const ep of BENCHMARKS) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      try {
        const opts = { method: ep.method, headers: { 'Content-Type': 'application/json' } };
        if (ep.body) opts.body = JSON.stringify(ep.body);
        await fetch(`${API_URL}${ep.path}`, opts);
        samples.push(Date.now() - start);
      } catch {
        samples.push(9999);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const p99 = percentile(samples, 99);
    const avg = Math.round(samples.reduce((s, x) => s + x, 0) / samples.length);

    log(`benchmark: ${ep.method} ${ep.path} — avg ${avg}ms  p50 ${p50}ms  p95 ${p95}ms  p99 ${p99}ms`);
    results[`${ep.method} ${ep.path}`] = { avg, p50, p95, p99 };
  }

  // Compare to previous baseline
  let degraded = 0;
  if (fs.existsSync('./benchmark-baseline.json')) {
    try {
      const baseline = JSON.parse(fs.readFileSync('./benchmark-baseline.json'));
      for (const [key, curr] of Object.entries(results)) {
        const base = baseline[key];
        if (base && curr.p95 > base.p95 * 1.5) {
          log(`benchmark: ⚠ degradation on ${key} — p95 ${curr.p95}ms vs baseline ${base.p95}ms`);
          degraded++;
        }
      }
    } catch {}
  }

  fs.writeFileSync('./benchmark-baseline.json', JSON.stringify(results, null, 2));
  const avgAll = Math.round(Object.values(results).reduce((s, r) => s + r.avg, 0) / Object.keys(results).length);

  return degraded > 0
    ? `perf: api degradation detected — ${degraded} endpoint(s) exceed baseline p95 threshold`
    : `perf: api benchmark clean — avg ${avgAll}ms across ${Object.keys(results).length} endpoints`;
}
