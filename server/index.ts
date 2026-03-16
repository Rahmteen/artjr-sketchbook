import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join } from 'path';
import sketchesRouter from './routes/sketches.js';
import uploadRouter from './routes/upload.js';
import notesRouter from './routes/notes.js';
import referencesRouter from './routes/references.js';
import shareRouter from './routes/share.js';
import referenceAudioRouter from './routes/referenceAudio.js';
import activitiesRouter from './routes/activities.js';
import collectionsRouter from './routes/collections.js';
import tagsRouter from './routes/tags.js';
import melodiesRouter from './routes/melodies.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Log every request (method + path) to debug routing and 404s on Vercel
app.use((req, _res, next) => {
  const path = req.path || req.url?.split('?')[0] || '';
  const isUpload = path.startsWith('/api/upload') || (req.url && req.url.startsWith('/api/upload'));
  if (isUpload || process.env.VERCEL) {
    console.log('[api]', req.method, 'path=', path, 'url=', req.url, '| VERCEL=', Boolean(process.env.VERCEL));
  }
  next();
});

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/sketches', sketchesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/notes', notesRouter);
app.use('/api/references', referencesRouter);
app.use('/api/share', shareRouter);
app.use('/api/reference-audio', referenceAudioRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/melodies', melodiesRouter);

// Log and respond when no route matches (helps debug 404s)
app.use('/api', (_req, res) => {
  console.log('[api] 404 no matching route | path=', _req.path, 'url=', _req.url);
  res.status(404).json({ error: 'Not found', path: _req.path || _req.url });
});

// Serve static client only when running as a standalone server (not on Vercel)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'development') {
  const distPath = join(process.cwd(), 'dist');
  const { existsSync } = await import('fs');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }
}

// On Vercel the app is exported and run as a serverless function; no listen()
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`ART JR Sketchbook API running at http://localhost:${PORT}`);
  });
}

export default app;
