/**
 * Task: writeTests
 *
 * Generates test files for protocol modules.
 * Tests auth flow, score calculations, launch pipeline, API endpoints.
 */

import fs from 'fs';

const TESTS = [
  {
    msg:  'test(auth): unit tests for ed25519 challenge verification',
    path: 'server/tests/auth.test.js',
    code: `/**
 * Auth service tests
 * ed25519 challenge generation and signature verification
 */

import { strict as assert } from 'assert';
import { generateChallenge, verifySignature } from '../src/services/auth.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Generate a test keypair
const keypair   = nacl.sign.keyPair();
const publicKey = bs58.encode(keypair.publicKey);

describe('generateChallenge', () => {
  it('should return a NOUS-AUTH prefixed challenge string', () => {
    const challenge = generateChallenge(publicKey);
    assert.ok(challenge.startsWith('NOUS-AUTH:'), \`expected NOUS-AUTH prefix, got: \${challenge}\`);
  });

  it('should include timestamp and nonce', () => {
    const challenge = generateChallenge(publicKey);
    const parts     = challenge.split(':');
    assert.equal(parts.length, 4, 'expected 4 colon-separated parts');
    assert.ok(parseInt(parts[1]) > 0, 'expected valid timestamp');
    assert.ok(parts[2].length >= 8, 'expected nonce of at least 8 chars');
  });
});

describe('verifySignature', () => {
  it('should return true for valid ed25519 signature', async () => {
    const challenge   = generateChallenge(publicKey);
    const msgBytes    = new TextEncoder().encode(challenge);
    const sigBytes    = nacl.sign.detached(msgBytes, keypair.secretKey);
    const signature   = bs58.encode(sigBytes);

    const valid = await verifySignature(publicKey, challenge, signature);
    assert.equal(valid, true);
  });

  it('should return false for tampered message', async () => {
    const challenge   = generateChallenge(publicKey);
    const tampered    = challenge + '-tampered';
    const msgBytes    = new TextEncoder().encode(challenge);
    const sigBytes    = nacl.sign.detached(msgBytes, keypair.secretKey);
    const signature   = bs58.encode(sigBytes);

    const valid = await verifySignature(publicKey, tampered, signature);
    assert.equal(valid, false);
  });

  it('should return false for wrong public key', async () => {
    const other       = nacl.sign.keyPair();
    const challenge   = generateChallenge(publicKey);
    const msgBytes    = new TextEncoder().encode(challenge);
    const sigBytes    = nacl.sign.detached(msgBytes, keypair.secretKey);
    const signature   = bs58.encode(sigBytes);
    const wrongKey    = bs58.encode(other.publicKey);

    const valid = await verifySignature(wrongKey, challenge, signature);
    assert.equal(valid, false);
  });
});
`,
  },
  {
    msg:  'test(score): unit tests for Shannon entropy calculation',
    path: 'server/tests/score-github.test.js',
    code: `/**
 * GitHub score computation tests
 * Shannon entropy, commit regularity, active days
 */

import { strict as assert } from 'assert';
import { shannonEntropy, commitRegularity, activeDays } from '../src/services/score-github.js';

function makeCommit(dateStr) {
  return { commit: { author: { date: dateStr } } };
}

describe('shannonEntropy', () => {
  it('should return 0 for empty commits', () => {
    assert.equal(shannonEntropy([]), 0);
  });

  it('should return 1 for perfectly uniform distribution (autonomous)', () => {
    // One commit per hour over 24 hours
    const commits = Array.from({ length: 24 }, (_, h) =>
      makeCommit(\`2026-02-24T\${String(h).padStart(2,'0')}:00:00Z\`)
    );
    const entropy = shannonEntropy(commits);
    assert.ok(entropy > 0.95, \`expected entropy near 1, got \${entropy}\`);
  });

  it('should return low value for clustered commits (human pattern)', () => {
    // All commits in 9-17 work hours
    const commits = Array.from({ length: 20 }, (_, i) =>
      makeCommit(\`2026-02-24T\${9 + (i % 8)}:00:00Z\`)
    );
    const entropy = shannonEntropy(commits);
    assert.ok(entropy < 0.5, \`expected low entropy, got \${entropy}\`);
  });
});

describe('activeDays', () => {
  it('should count unique days correctly', () => {
    const commits = [
      makeCommit('2026-02-24T02:00:00Z'),
      makeCommit('2026-02-24T14:00:00Z'), // same day
      makeCommit('2026-02-25T03:00:00Z'),
      makeCommit('2026-02-26T22:00:00Z'),
    ];
    assert.equal(activeDays(commits, 7), 3);
  });

  it('should cap at windowDays', () => {
    const commits = Array.from({ length: 30 }, (_, i) =>
      makeCommit(\`2026-02-\${String(i + 1).padStart(2,'0')}T00:00:00Z\`)
    );
    assert.equal(activeDays(commits, 7), 7);
  });
});
`,
  },
  {
    msg:  'test(launch): state machine transition validation',
    path: 'server/tests/launch-state.test.js',
    code: `/**
 * Launch state machine tests
 * Valid and invalid status transitions
 */

import { strict as assert } from 'assert';
import { canTransition, assertTransition, LaunchStatus } from '../src/services/launch-state.js';

describe('canTransition', () => {
  it('should allow pending → verifying', () => {
    assert.equal(canTransition(LaunchStatus.PENDING, LaunchStatus.VERIFYING), true);
  });

  it('should allow verified → awaiting_signature', () => {
    assert.equal(canTransition(LaunchStatus.VERIFIED, LaunchStatus.AWAITING_SIGNATURE), true);
  });

  it('should allow awaiting_signature → submitting', () => {
    assert.equal(canTransition(LaunchStatus.AWAITING_SIGNATURE, LaunchStatus.SUBMITTING), true);
  });

  it('should allow submitting → live', () => {
    assert.equal(canTransition(LaunchStatus.SUBMITTING, LaunchStatus.LIVE), true);
  });

  it('should reject live → pending (no going back)', () => {
    assert.equal(canTransition(LaunchStatus.LIVE, LaunchStatus.PENDING), false);
  });

  it('should reject pending → live (skip steps)', () => {
    assert.equal(canTransition(LaunchStatus.PENDING, LaunchStatus.LIVE), false);
  });

  it('should allow failed → awaiting_signature (retry)', () => {
    assert.equal(canTransition(LaunchStatus.FAILED, LaunchStatus.AWAITING_SIGNATURE), true);
  });
});

describe('assertTransition', () => {
  it('should throw on invalid transition', () => {
    assert.throws(
      () => assertTransition(LaunchStatus.LIVE, LaunchStatus.PENDING),
      /invalid status transition/
    );
  });

  it('should not throw on valid transition', () => {
    assert.doesNotThrow(
      () => assertTransition(LaunchStatus.PENDING, LaunchStatus.VERIFYING)
    );
  });
});
`,
  },
];

export async function writeTests({ log }) {
  const test = TESTS[Math.floor(Math.random() * TESTS.length)];
  const dir  = test.path.split('/').slice(0, -1).join('/');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(test.path)) {
    log(`tests: ${test.path} already exists — skipping`);
    return null;
  }

  fs.writeFileSync(test.path, test.code);
  log(`tests: wrote ${test.path}`);
  return test.msg;
}
