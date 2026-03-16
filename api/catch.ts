/**
 * Single-segment API entry so Vercel always invokes this function.
 * Rewrites send /api/sketches/xxx etc. to /api/catch?path=sketches/xxx;
 * we restore req.url to /api/sketches/xxx and pass to Express.
 */
import app from '../dist-server/index.js';

export default function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
  const rawUrl = req.url || '';
  const [pathPart, queryPart] = rawUrl.split('?');
  const pathParam = queryPart ? new URLSearchParams(queryPart).get('path') : null;
  let url = rawUrl;
  if (pathParam != null) {
    const rest = queryPart ? queryPart.replace(/path=[^&]+&?/, '').replace(/&$/, '') : '';
    url = '/api/' + decodeURIComponent(pathParam) + (rest ? '?' + rest : '');
    (req as import('http').IncomingMessage & { url: string }).url = url;
  }
  const method = req.method || '';
  console.log('[vercel] handler invoked', method, url, '| VERCEL=', !!process.env.VERCEL);
  app(req, res);
}
