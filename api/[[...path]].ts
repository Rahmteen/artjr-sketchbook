// Log the moment Vercel invokes this function (before Express runs).
// If you never see "[vercel] handler invoked" for POST /api/upload/sketch, the 404 is from Vercel routing, not our app.
import app from '../dist-server/index.js';

export default function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
  const url = req.url || '';
  const method = req.method || '';
  console.log('[vercel] handler invoked', method, url, '| VERCEL=', !!process.env.VERCEL);
  app(req, res);
}
