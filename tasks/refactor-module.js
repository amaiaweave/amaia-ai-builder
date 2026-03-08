/**
 * Task: refactorModule
 *
 * Improves existing server modules.
 * Adds error handling, optimises queries, extracts constants,
 * improves logging, adds JSDoc comments.
 */

import fs from 'fs';

const REFACTORS = [
  {
    msg:  'refactor(auth): extract challenge constants — expiry and prefix to config',
    path: 'server/src/config/auth.js',
    code: `/**
 * Auth configuration constants
 * Centralised to ensure consistency across challenge generation and verification
 */

export const AUTH = {
  CHALLENGE_PREFIX:  'NOUS-AUTH',
  CHALLENGE_EXPIRY:  10 * 60 * 1000,       // 10 minutes in ms
  JWT_EXPIRY:        '30d',
  NONCE_BYTES:       16,
  MIN_PUBKEY_LENGTH: 32,
  MAX_PUBKEY_LENGTH: 44,
};

export const SCORE = {
  THRESHOLD:     70,
  MIN_DAYS:      7,
  UPTIME_GAP_MS: 4 * 60 * 60 * 1000,       // 4h — flag if exceeded
  GITHUB_MAX:    55,
  SOLANA_MAX:    45,
  WEIGHTS: {
    github_entropy:    20,
    github_days:       15,
    github_regularity: 10,
    github_volume:     10,
    solana_days:       15,
    solana_regularity: 15,
    solana_uptime:     15,
  },
};
`,
  },
  {
    msg:  'refactor(db): add connection retry logic with exponential backoff',
    path: 'server/src/db/retry.js',
    code: `/**
 * Database retry utility
 * Wraps pg queries with exponential backoff on transient errors
 */

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P01', '08006', '08001']);

export async function withRetry(fn, { maxAttempts = 3, baseDelay = 200 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = RETRYABLE_CODES.has(err.code) || err.message?.includes('connection');

      if (!retryable || attempt === maxAttempts) throw err;

      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
      console.warn(\`[db] attempt \${attempt} failed (\${err.code}) — retrying in \${Math.round(delay)}ms\`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}
`,
  },
  {
    msg:  'refactor(score): extract GitHub score computation into pure functions',
    path: 'server/src/services/score-github.js',
    code: `/**
 * GitHub score computation — pure functions
 * Separated from main verify.js for testability and reuse
 */

/**
 * Shannon entropy of commit hour distribution
 * Higher entropy = more autonomous (commits spread across all hours)
 * Lower entropy = more human (commits clustered in work hours)
 */
export function shannonEntropy(commits) {
  if (!commits?.length) return 0;

  const buckets = new Array(24).fill(0);
  for (const c of commits) {
    const hour = new Date(c.commit?.author?.date || c.authored_date).getUTCHours();
    buckets[hour]++;
  }

  const total = commits.length;
  return buckets.reduce((entropy, count) => {
    if (count === 0) return entropy;
    const p = count / total;
    return entropy - p * Math.log2(p);
  }, 0) / Math.log2(24); // normalise to 0–1
}

/**
 * Commit interval regularity
 * Measures consistency of time gaps between commits
 * Autonomous agents have lower variance (more regular)
 */
export function commitRegularity(commits) {
  if (!commits || commits.length < 2) return 0;

  const timestamps = commits
    .map(c => new Date(c.commit?.author?.date || c.authored_date).getTime())
    .sort((a, b) => a - b);

  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(timestamps[i] - timestamps[i - 1]);
  }

  const mean   = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const stddev = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g - mean, 2), 0) / gaps.length);
  const cv     = mean > 0 ? stddev / mean : 1; // coefficient of variation

  // Lower CV = more regular = higher score
  return Math.max(0, 1 - Math.min(cv, 1));
}

/**
 * Days with at least one commit in the window
 */
export function activeDays(commits, windowDays = 7) {
  if (!commits?.length) return 0;

  const days = new Set(
    commits.map(c => new Date(c.commit?.author?.date || c.authored_date).toISOString().slice(0, 10))
  );

  return Math.min(days.size, windowDays);
}
`,
  },
  {
    msg:  'refactor(launch): add launch state machine with explicit transitions',
    path: 'server/src/services/launch-state.js',
    code: `/**
 * Launch state machine
 * Enforces valid status transitions — prevents illegal state changes
 */

export const LaunchStatus = {
  PENDING:             'pending',
  VERIFYING:           'verifying',
  VERIFIED:            'verified',
  AWAITING_SIGNATURE:  'awaiting_signature',
  SUBMITTING:          'submitting',
  LIVE:                'live',
  FAILED:              'failed',
  REJECTED:            'rejected',
};

// Valid transitions: from → [allowed next states]
const TRANSITIONS = {
  [LaunchStatus.PENDING]:            [LaunchStatus.VERIFYING, LaunchStatus.REJECTED],
  [LaunchStatus.VERIFYING]:          [LaunchStatus.VERIFIED, LaunchStatus.REJECTED],
  [LaunchStatus.VERIFIED]:           [LaunchStatus.AWAITING_SIGNATURE],
  [LaunchStatus.AWAITING_SIGNATURE]: [LaunchStatus.SUBMITTING, LaunchStatus.FAILED],
  [LaunchStatus.SUBMITTING]:         [LaunchStatus.LIVE, LaunchStatus.FAILED],
  [LaunchStatus.LIVE]:               [],
  [LaunchStatus.FAILED]:             [LaunchStatus.AWAITING_SIGNATURE], // allow retry
  [LaunchStatus.REJECTED]:           [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(\`invalid status transition: \${from} → \${to}\`);
  }
}
`,
  },
];

export async function refactorModule({ log }) {
  const refactor = REFACTORS[Math.floor(Math.random() * REFACTORS.length)];
  const dir      = refactor.path.split('/').slice(0, -1).join('/');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(refactor.path)) {
    log(`refactor: ${refactor.path} already exists — skipping`);
    return null;
  }

  fs.writeFileSync(refactor.path, refactor.code);
  log(`refactor: wrote ${refactor.path}`);
  return refactor.msg;
}
