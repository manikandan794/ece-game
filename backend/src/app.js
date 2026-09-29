const path = require('path');
const fs = require('fs');

const envCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env')
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();

const frontendUrls = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim().replace(/\/$/, '')).filter(Boolean)
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, same-origin)
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/$/, '');

    // Allow all if FRONTEND_URL is '*' or unset, or in development/test
    if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL === '*' || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (frontendUrls.includes(normalized)) {
      return callback(null, true);
    }

    // Allow local development origins
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Mount API
app.use('/api', apiRoutes);

// Serve frontend build in production if dist exists
const distPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA client routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If frontend dist is not built yet (during dev/testing), provide a helpful response
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>GLITCH HUNT Server</title></head>
        <body style="background:#0a0e17;color:#00ffff;font-family:sans-serif;padding:2rem;text-align:center;">
          <h1>⚡ GLITCH HUNT Backend Server Running ⚡</h1>
          <p>RRASE College of Engineering - Department of ECE</p>
          <p>API Endpoint: <a href="/api/settings" style="color:#ff0055;">/api/settings</a></p>
          <p>Please run the frontend Vite server on port 5173 or run <code>npm run build</code> in the frontend folder.</p>
        </body>
        </html>
      `);
    }
  });
});

// Safe error handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected internal server error occurred. Please consult the system administrator.'
  });
});

module.exports = app;
