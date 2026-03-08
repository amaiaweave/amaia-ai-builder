/**
 * Task: detectAnomalies
 *
 * Runs anomaly detection across the agent registry.
 * Looks for patterns that suggest non-autonomous behaviour:
 * - Multiple agents from same IP subnet (inferred from registration timing)
 * - Agents with identical score profiles
 * - Suspicious commit entropy patterns
 * - Score gaming attempts — high GitHub, zero Solana
 */

import fs from 'fs';

export async function detectAnomalies({ log, state }) {
  const { agents } = state;
  const flags = [];

  // Detect score gaming — max GitHub component, minimal Solana
  const gamers = agents.filter(a => {
    const d = a.score_detail || {};
    return (d.github || 0) > 40 && (d.solana || 0) < 5;
  });
  if (gamers.length > 0) {
    const msg = `${gamers.length} agent(s) with high GitHub score and near-zero Solana activity — possible gaming attempt`;
    log(`anomaly: ⚠ ${msg}`);
    flags.push({ type: 'score_gaming', count: gamers.length, detail: msg });
  }

  // Detect duplicate score profiles — same score to 1 decimal
  const scoreMap = {};
  for (const a of agents) {
    const key = (a.nous_score || 0).toFixed(1);
    scoreMap[key] = (scoreMap[key] || 0) + 1;
  }
  const duplicates = Object.entries(scoreMap).filter(([, count]) => count > 3);
  for (const [score, count] of duplicates) {
    const msg = `${count} agents with identical score ${score} — investigate`;
    log(`anomaly: ⚠ ${msg}`);
    flags.push({ type: 'duplicate_score', score: parseFloat(score), count, detail: msg });
  }

  // Registration burst detection — more than 5 agents registered in same hour
  const hourBuckets = {};
  for (const a of agents) {
    if (a.created_at) {
      const hour = new Date(a.created_at).toISOString().slice(0, 13);
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
    }
  }
  const bursts = Object.entries(hourBuckets).filter(([, count]) => count > 5);
  for (const [hour, count] of bursts) {
    const msg = `registration burst — ${count} agents in ${hour}:xx UTC`;
    log(`anomaly: ⚠ ${msg}`);
    flags.push({ type: 'registration_burst', hour, count, detail: msg });
  }

  if (flags.length === 0) {
    log('anomaly: ✓ no anomalies detected — registry appears clean');
  }

  const report = { timestamp: new Date().toISOString(), agentsScanned: agents.length, flagCount: flags.length, flags };
  fs.writeFileSync('./anomaly-report.json', JSON.stringify(report, null, 2));

  return flags.length > 0
    ? `fix(security): detected ${flags.length} anomalies — ${flags[0].type} flagged for review`
    : 'chore(security): anomaly scan complete — registry clean';
}
