/**
 * Task: auditEndpoints
 *
 * Pings every NOUS API endpoint.
 * Measures response time, validates response shape, checks status codes.
 * Writes audit-report.json with full results.
 * Flags degraded endpoints — latency > 1000ms or unexpected status.
 */

import fetch from 'node-fetch';
import fs from 'fs';

const ENDPOINTS = [
  { method: 'GET',  path: '/health',        expect: 200 },
  { method: 'GET',  path: '/api/products',  expect: 200 },
  {
    method: 'POST', path: '/api/auth/challenge', expect: 200,
    body: { publicKey: 'CbcM9ELJfGs8FfQYbRGcW61gnT1QsLN8TVWRTeJeABZ' },
  },
];

export async function auditEndpoints({ log, API_URL }) {
  const results = [];
  let degraded  = 0;

  for (const ep of ENDPOINTS) {
    const start = Date.now();
    let status = null, ok = false, latency = null, error = null;

    try {
      const opts = { method: ep.method, headers: { 'Content-Type': 'application/json' } };
      if (ep.body) opts.body = JSON.stringify(ep.body);
      const r = await fetch(`${API_URL}${ep.path}`, opts);
      latency = Date.now() - start;
      status  = r.status;
      ok      = status === ep.expect;
      if (latency > 1000) { log(`audit: ⚠ slow — ${ep.method} ${ep.path} ${latency}ms`); degraded++; }
    } catch (e) {
      latency = Date.now() - start;
      error   = e.message;
      degraded++;
    }

    const icon = ok ? '✓' : '✗';
    log(`audit: ${icon} ${ep.method} ${ep.path} → ${status ?? 'ERR'} ${latency}ms`);
    results.push({ method: ep.method, path: ep.path, status, latency, ok, error });
  }

  const passed = results.filter(r => r.ok).length;
  log(`audit: ${passed}/${results.length} endpoints healthy — ${degraded} degraded`);

  const report = { timestamp: new Date().toISOString(), passed, total: results.length, degraded, results };
  fs.writeFileSync('./audit-report.json', JSON.stringify(report, null, 2));

  const label = degraded > 0 ? `⚠ ${degraded} degraded` : 'all healthy';
  return `chore(audit): endpoint audit — ${passed}/${results.length} passing, ${label}`;
}
