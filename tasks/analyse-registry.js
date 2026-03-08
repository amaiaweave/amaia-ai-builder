/**
 * Task: analyseRegistry
 *
 * Fetches all registered agents from the protocol API.
 * Computes score distribution, status breakdown, category spread.
 * Flags outliers — agents with suspiciously high or low scores.
 * Writes report to registry-snapshot.json.
 */

import fs from 'fs';

export async function analyseRegistry({ log, state }) {
  const { agents } = state;

  if (agents.length === 0) {
    log('registry: no agents — protocol awaiting first registrations');
    return 'chore(registry): snapshot — 0 agents, protocol awaiting launch';
  }

  const scores  = agents.map(a => a.nous_score || 0);
  const avg     = scores.reduce((s, x) => s + x, 0) / scores.length;
  const max     = Math.max(...scores);
  const min     = Math.min(...scores);
  const passed  = scores.filter(s => s >= 70).length;
  const stddev  = Math.sqrt(scores.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / scores.length);

  const byStatus = agents.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1; return acc;
  }, {});

  const byCategory = agents.reduce((acc, a) => {
    const cat = a.category || 'uncategorised';
    acc[cat] = (acc[cat] || 0) + 1; return acc;
  }, {});

  // Flag outliers — scores more than 2 stddev from mean
  const outliers = agents.filter(a => Math.abs((a.nous_score || 0) - avg) > 2 * stddev);
  if (outliers.length > 0) {
    log(`registry: ⚠ ${outliers.length} outlier(s) detected — manual review recommended`);
  }

  log(`registry: ${agents.length} agents — avg ${avg.toFixed(1)}pt — stddev ${stddev.toFixed(1)}`);
  log(`registry: passed threshold: ${passed}/${agents.length} (${((passed/agents.length)*100).toFixed(0)}%)`);
  log(`registry: score range ${min}–${max}`);
  log(`registry: status — ${JSON.stringify(byStatus)}`);

  const snapshot = {
    timestamp: new Date().toISOString(),
    total: agents.length,
    avgScore: parseFloat(avg.toFixed(2)),
    stddev: parseFloat(stddev.toFixed(2)),
    scoreRange: { min, max },
    passedThreshold: passed,
    passRate: parseFloat(((passed / agents.length) * 100).toFixed(1)),
    statusBreakdown: byStatus,
    categoryBreakdown: byCategory,
    outlierCount: outliers.length,
  };

  fs.writeFileSync('./registry-snapshot.json', JSON.stringify(snapshot, null, 2));
  log('registry: wrote registry-snapshot.json');

  return `chore(registry): snapshot — ${agents.length} agents, avg score ${avg.toFixed(1)}, pass rate ${snapshot.passRate}%`;
}
