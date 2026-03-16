/**
 * Explicit handler for POST /api/upload/sketch so Vercel routes to it.
 * Forwards to the Express app (same as the catch-all).
 */
import app from '../../dist-server/index.js';

export default function handler(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse
): void {
  console.log('[vercel] api/upload/sketch.ts invoked', req.method, req.url);
  app(req, res);
}
