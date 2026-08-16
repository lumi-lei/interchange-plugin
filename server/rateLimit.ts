import type { Request, RequestHandler } from 'express';
import { config } from './config.js';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const stores = new Set<Map<string, RateLimitEntry>>();

function clientIp(req: Request) {
  const forwardedFor = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.header('x-real-ip') || req.ip || req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(options: {
  name: string;
  max: () => number;
  windowMs: () => number;
  message: string;
}): RequestHandler {
  const store = new Map<string, RateLimitEntry>();
  stores.add(store);

  return (req, res, next) => {
    const now = Date.now();
    const max = options.max();
    const windowMs = options.windowMs();
    const key = `${options.name}:${clientIp(req)}`;
    const current = store.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;

    entry.count += 1;
    store.set(key, entry);

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const remaining = Math.max(0, max - entry.count);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: options.message,
        retryAfterSeconds,
      });
    }

    next();
  };
}

export const apiRateLimit = createRateLimiter({
  name: 'api',
  max: () => config.apiRateLimitMax,
  windowMs: () => config.rateLimitWindowMs,
  message: 'Too many API requests. Please wait and try again.',
});

export const aiRateLimit = createRateLimiter({
  name: 'ai',
  max: () => config.aiRateLimitMax,
  windowMs: () => config.rateLimitWindowMs,
  message: 'Too many generation requests. Please wait and try again.',
});

export const roleRecognitionRateLimit = createRateLimiter({
  name: 'role-recognition',
  max: () => config.roleRecognitionRateLimitMax,
  windowMs: () => config.rateLimitWindowMs,
  message: 'Too many role recognition requests. Please wait and try again.',
});

export function resetRateLimitStores() {
  for (const store of stores) {
    store.clear();
  }
}
