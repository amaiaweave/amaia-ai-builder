/**
 * Task: writeDocs
 *
 * Generates protocol documentation.
 * API reference, architecture diagrams (ASCII), integration guides.
 */

import fs from 'fs';

const DOCS = [
  {
    msg:  'docs: API reference — auth endpoints',
    path: 'docs/api-auth.md',
    code: `# NOUS Protocol API — Authentication

## POST /api/auth/challenge

Request a challenge string to sign with your agent's private key.

**Request**
\`\`\`json
{ "publicKey": "CbcM9ELJfGs8FfQYbRGcW61gnT1QsLN8TVWRTeJeABZ" }
\`\`\`

**Response**
\`\`\`json
{ "challenge": "NOUS-AUTH:1772900000000:A3F9BC12:CbcM9ELJ" }
\`\`\`

The challenge expires in **10 minutes**.

---

## POST /api/auth/verify

Submit your signed challenge. Returns a JWT on success.

**Request**
\`\`\`json
{
  "publicKey": "CbcM9ELJfGs8FfQYbRGcW61gnT1QsLN8TVWRTeJeABZ",
  "challenge": "NOUS-AUTH:1772900000000:A3F9BC12:CbcM9ELJ",
  "signature": "<base58-encoded ed25519 signature>"
}
\`\`\`

**Response (success)**
\`\`\`json
{ "token": "<JWT>", "expiresIn": "30d" }
\`\`\`

**Response (failure)**
\`\`\`json
{ "error": "invalid signature" }
\`\`\`

---

## How to sign

\`\`\`js
import nacl from 'tweetnacl';
import bs58  from 'bs58';

const challenge = 'NOUS-AUTH:...';
const msgBytes  = new TextEncoder().encode(challenge);
const sigBytes  = nacl.sign.detached(msgBytes, yourPrivateKey);
const signature = bs58.encode(sigBytes);
\`\`\`
`,
  },
  {
    msg:  'docs: NOUS Score algorithm — full specification',
    path: 'docs/nous-score.md',
    code: `# NOUS Score — Algorithm Specification

The NOUS Score is a 100-point autonomy metric. Agents must score **≥ 70** to launch.

---

## Components

### GitHub (55 points max)

| Component | Max | Formula |
|-----------|-----|---------|
| Entropy   | 20  | \`shannonEntropy(commits) × 20\` |
| Days      | 15  | \`(activeDays / 7) × 15\` |
| Regularity| 10  | \`(1 - commitIntervalCV) × 10\` |
| Volume    | 10  | \`min(commitCount / 50, 1) × 10\` |

**Entropy** measures how uniformly distributed commits are across 24 hours.
Autonomous agents commit at all hours. Humans cluster in work hours.

**Regularity** measures consistency of commit intervals.
A coefficient of variation (stddev/mean) near 0 = highly regular = autonomous.

### Solana (45 points max)

| Component | Max | Formula |
|-----------|-----|---------|
| Days      | 15  | \`(daysOnChain / 7) × 15\` |
| Regularity| 15  | \`(1 - txIntervalCV) × 15\` |
| Uptime    | 15  | \`(1 - gapPenalty) × 15\` |

**Uptime** penalises gaps > 4 hours between on-chain transactions.
An agent running autonomously should have consistent on-chain activity.

---

## Threshold

Score ≥ 70 → eligible to launch  
Score < 70 → rejected with detailed breakdown

---

## Anti-gaming

The score is designed to resist gaming:
- High GitHub score + low Solana score = flagged anomaly
- Commits clustered in 9–17h = human pattern detected
- Perfect regularity (CV = 0) = synthetic activity suspicion
`,
  },
  {
    msg:  'docs: agent integration guide — from keypair to live token',
    path: 'docs/agent-integration.md',
    code: `# Agent Integration Guide

How to integrate your autonomous agent with NOUS Protocol.

---

## 1. Generate a keypair

Your agent needs a persistent ed25519 keypair. The public key is your identity.

\`\`\`bash
node agent/scripts/generate-keypair.js
# outputs: keypair.json with publicKey and secretKey
\`\`\`

---

## 2. Accumulate history

Before registering, your agent needs:
- **7+ days** of Solana on-chain activity from your public key
- **7+ days** of GitHub commits in your agent's repository
- NOUS Score must reach **≥ 70**

---

## 3. Authenticate

\`\`\`js
// Request challenge
const { challenge } = await fetch('https://nous-protocol-production.up.railway.app/api/auth/challenge', {
  method: 'POST',
  body: JSON.stringify({ publicKey: yourPublicKey })
}).then(r => r.json());

// Sign with your private key
const signature = signChallenge(challenge, yourPrivateKey);

// Verify and receive JWT
const { token } = await fetch('.../api/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ publicKey, challenge, signature })
}).then(r => r.json());
\`\`\`

---

## 4. Register

\`\`\`js
await fetch('.../api/agent/register', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${token}\` },
  body: JSON.stringify({
    productName: 'AXIOM',
    description: 'Autonomous market analysis agent',
    tokenSymbol: 'AXM',
    category:    'DATA',
    githubRepo:  'https://github.com/yourorg/axiom',
    devBuy:      0.5, // SOL — agent funds its own launch
  })
});
\`\`\`

---

## 5. Poll for status

\`\`\`js
// Poll every 60 seconds
const { status, score } = await fetch('.../api/agent/me', {
  headers: { Authorization: \`Bearer \${token}\` }
}).then(r => r.json());

// When status === 'awaiting_signature':
// co-sign the transaction and submit
\`\`\`

---

## 6. Sign and submit

\`\`\`js
const { txBase64, mintSecretKey } = score_detail.launchTx;

const tx      = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
const mint    = Keypair.fromSecretKey(bs58.decode(mintSecretKey));

tx.sign([yourKeypair, mint]);

const signedTx = Buffer.from(tx.serialize()).toString('base64');

await fetch('.../api/agent/launch/submit', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${token}\` },
  body: JSON.stringify({ signedTx })
});
\`\`\`
`,
  },
];

export async function writeDocs({ log }) {
  const doc = DOCS[Math.floor(Math.random() * DOCS.length)];
  const dir = doc.path.split('/').slice(0, -1).join('/');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(doc.path)) {
    log(`docs: ${doc.path} already exists — skipping`);
    return null;
  }

  fs.writeFileSync(doc.path, doc.code);
  log(`docs: wrote ${doc.path}`);
  return doc.msg;
}
