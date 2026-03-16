// Log the moment Vercel invokes this function (before Express runs).
// If you never see "[vercel] handler invoked" for POST /api/upload/sketch, the 404 is from Vercel routing, not our app.
import app from '../dist-server/index.js';

export default function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
  let url = req.url || '';
  const method = req.method || '';
  // Vercel may pass path without /api prefix; Express mounts routes at /api/* so we need /api in the path.
  if (url && !url.startsWith('/api')) {
    url = '/api' + (url.startsWith('/') ? url : '/' + url);
    (req as import('http').IncomingMessage & { url: string }).url = url;
  }
  console.log('[vercel] handler invoked', method, url, '| VERCEL=', !!process.env.VERCEL);
  app(req, res);
}
