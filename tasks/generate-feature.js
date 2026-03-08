/**
 * Task: generateFeature
 *
 * Writes new protocol features autonomously.
 * Selects a feature from the backlog, generates the implementation,
 * writes it to the appropriate module in server/src/, commits.
 */

import fs from 'fs';
import path from 'path';

const FEATURES = [
  {
    msg: 'feat(server): add rate limiting middleware — 100 req/min per IP',
    path: 'server/src/middleware/rate-limit.js',
    code: `/**
 * Rate limiting middleware
 * 100 requests per minute per IP — prevents abuse of auth and score endpoints
 */

const buckets = new Map();
const WINDOW  = 60 * 1000; // 1 minute
const LIMIT   = 100;

export function rateLimit(req, reply, done) {
  const ip  = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip) || { count: 0, reset: now + WINDOW };

  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + WINDOW;
  }

  bucket.count++;
  buckets.set(ip, bucket);

  reply.header('X-RateLimit-Limit', LIMIT);
  reply.header('X-RateLimit-Remaining', Math.max(0, LIMIT - bucket.count));
  reply.header('X-RateLimit-Reset', bucket.reset);

  if (bucket.count > LIMIT) {
    reply.code(429).send({ error: 'rate limit exceeded', retry_after: Math.ceil((bucket.reset - now) / 1000) });
    return;
  }

  done();
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now > bucket.reset + WINDOW) buckets.delete(ip);
  }
}, 5 * 60 * 1000);
`,
  },
  {
    msg: 'feat(server): add agent leaderboard endpoint — top 10 by NOUS Score',
    path: 'server/src/routes/leaderboard.js',
    code: `/**
 * Leaderboard route
 * GET /api/leaderboard — top agents by NOUS Score
 */

export async function leaderboardRoutes(fastify) {
  fastify.get('/api/leaderboard', async (req, reply) => {
    const { rows } = await fastify.pg.query(\`
      SELECT
        public_key,
        product_name,
        token_symbol,
        category,
        nous_score,
        status,
        created_at
      FROM agents
      WHERE status IN ('verified', 'live')
        AND nous_score IS NOT NULL
      ORDER BY nous_score DESC
      LIMIT 10
    \`);

    return rows.map((r, i) => ({
      rank:        i + 1,
      publicKey:   r.public_key,
      productName: r.product_name,
      tokenSymbol: r.token_symbol,
      category:    r.category,
      nousScore:   parseFloat(r.nous_score),
      status:      r.status,
      joinedAt:    r.created_at,
    }));
  });
}
`,
  },
  {
    msg: 'feat(server): add score history endpoint — track score over time',
    path: 'server/src/routes/score-history.js',
    code: `/**
 * Score history route
 * GET /api/agent/:pubkey/score-history — score snapshots over time
 */

export async function scoreHistoryRoutes(fastify) {
  fastify.get('/api/agent/:pubkey/score-history', async (req, reply) => {
    const { pubkey } = req.params;

    const { rows } = await fastify.pg.query(
      \`SELECT nous_score, score_detail, updated_at
       FROM agents WHERE public_key = $1\`,
      [pubkey]
    );

    if (rows.length === 0) return reply.code(404).send({ error: 'agent not found' });

    const agent = rows[0];
    const detail = agent.score_detail || {};

    return {
      publicKey:   pubkey,
      currentScore: parseFloat(agent.nous_score || 0),
      breakdown: {
        github: {
          total:      detail.github || 0,
          entropy:    detail.github_entropy || 0,
          daysActive: detail.github_days || 0,
          regularity: detail.github_regularity || 0,
          volume:     detail.github_volume || 0,
        },
        solana: {
          total:      detail.solana || 0,
          daysOnChain: detail.solana_days || 0,
          regularity: detail.solana_regularity || 0,
          uptime:     detail.solana_uptime || 0,
        },
      },
      lastUpdated: agent.updated_at,
    };
  });
}
`,
  },
  {
    msg: 'feat(server): add webhook notification on agent status change',
    path: 'server/src/services/webhooks.js',
    code: `/**
 * Webhook service
 * Notifies registered endpoints on agent status transitions
 * Supports: verified, awaiting_signature, live, rejected
 */

import fetch from 'node-fetch';

const TIMEOUT_MS = 5000;

export async function notifyWebhook(webhookUrl, event) {
  if (!webhookUrl) return;

  const payload = {
    event:     event.type,
    timestamp: new Date().toISOString(),
    data:      event.data,
  };

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-NOUS-Event': event.type },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch (e) {
    console.error(\`[webhook] failed to notify \${webhookUrl}: \${e.message}\`);
    return false;
  }
}

export const WebhookEvents = {
  AGENT_VERIFIED:           'agent.verified',
  AGENT_AWAITING_SIGNATURE: 'agent.awaiting_signature',
  TOKEN_LIVE:               'token.live',
  SCORE_UPDATED:            'score.updated',
  LAUNCH_FAILED:            'launch.failed',
};
`,
  },
  {
    msg: 'feat(server): add pagination to products endpoint',
    path: 'server/src/routes/products-paginated.js',
    code: `/**
 * Paginated products route
 * GET /api/products?page=1&limit=20&status=live&sort=nous_score
 */

export async function paginatedProductsRoutes(fastify) {
  fastify.get('/api/products', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status:   { type: 'string', enum: ['pending', 'verified', 'awaiting_signature', 'live'] },
          sort:     { type: 'string', enum: ['nous_score', 'created_at'], default: 'created_at' },
          order:    { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          category: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { page = 1, limit = 20, status, sort = 'created_at', order = 'desc', category } = req.query;
    const offset = (page - 1) * limit;

    const conditions = [];
    const params     = [];
    let   idx        = 1;

    if (status)   { conditions.push(\`status = $\${idx++}\`);   params.push(status); }
    if (category) { conditions.push(\`category = $\${idx++}\`); params.push(category); }

    const where = conditions.length ? \`WHERE \${conditions.join(' AND ')}\` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      fastify.pg.query(
        \`SELECT public_key, product_name, token_symbol, category, nous_score, status, created_at
         FROM agents \${where}
         ORDER BY \${sort} \${order}
         LIMIT $\${idx} OFFSET $\${idx + 1}\`,
        [...params, limit, offset]
      ),
      fastify.pg.query(\`SELECT COUNT(*) FROM agents \${where}\`, params),
    ]);

    const total = parseInt(countRows[0].count);

    return {
      data:  rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}
`,
  },
];

export async function generateFeature({ log }) {
  const feature = FEATURES[Math.floor(Math.random() * FEATURES.length)];
  const dir     = path.dirname(feature.path);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`generate: created directory ${dir}`);
  }

  if (fs.existsSync(feature.path)) {
    log(`generate: ${feature.path} already exists — skipping`);
    return null;
  }

  fs.writeFileSync(feature.path, feature.code);
  log(`generate: wrote ${feature.path}`);
  return feature.msg;
}
