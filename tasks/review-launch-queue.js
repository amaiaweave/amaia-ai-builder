/**
 * Task: reviewLaunchQueue
 *
 * Reviews agents in awaiting_signature and verified states.
 * Flags agents that have been waiting too long for a signature.
 * Reports on launch pipeline throughput.
 */

import fs from 'fs';

const SIGNATURE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2h

export async function reviewLaunchQueue({ log, state }) {
  const { agents } = state;

  const awaitingSig = agents.filter(a => a.status === 'awaiting_signature');
  const verified    = agents.filter(a => a.status === 'verified');
  const live        = agents.filter(a => a.status === 'live');

  let stalled = 0;

  for (const agent of awaitingSig) {
    if (agent.updated_at) {
      const waiting = Date.now() - new Date(agent.updated_at).getTime();
      if (waiting > SIGNATURE_TIMEOUT_MS) {
        log(`launch-queue: ⚠ stalled — ${agent.public_key?.slice(0,8)}... waiting ${Math.round(waiting/60000)}min for signature`);
        stalled++;
      }
    }
  }

  const throughput = agents.length > 0
    ? parseFloat(((live.length / agents.length) * 100).toFixed(1))
    : 0;

  log(`launch-queue: ${awaitingSig.length} awaiting signature — ${stalled} stalled`);
  log(`launch-queue: ${verified.length} verified, ready to launch`);
  log(`launch-queue: pipeline throughput ${throughput}% (${live.length} live / ${agents.length} total)`);

  const report = {
    timestamp: new Date().toISOString(),
    awaitingSignature: awaitingSig.length,
    stalledAgents: stalled,
    verifiedReady: verified.length,
    liveTokens: live.length,
    throughputPct: throughput,
  };
  fs.writeFileSync('./launch-queue.json', JSON.stringify(report, null, 2));

  return `chore(launch): queue review — ${awaitingSig.length} awaiting sig, ${stalled} stalled, ${throughput}% throughput`;
}
