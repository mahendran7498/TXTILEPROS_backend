const dns = require("dns");
dns.setServers(["8.8.8.8"],["8.8.4.4"]);

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { ensureDefaultUsers } = require('../utils/bootstrap');

const app = express();
const MONGO_URI = process.env.MONGO_URI;
const uploadRoot = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'https://txtilepros-frontend.vercel.app',
];

const envAllowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])];

let initPromise;
let routesRegistered = false;

function connectAndBootstrap() {
  if (!MONGO_URI) {
    throw new Error('Missing MONGO_URI.');
  }
  if (!initPromise) {
    initPromise = mongoose.connect(MONGO_URI).then(async () => {
      await ensureDefaultUsers();
    });
  }
  return initPromise;
}

function registerRoutes() {
  if (routesRegistered) return;
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/reports', require('../routes/reports'));
  app.use('/api/admin', require('../routes/admin'));
  routesRegistered = true;
}

function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

app.use((req, res, next) => {
  applyCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = String(origin).replace(/\/$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
);

app.use('/uploads', express.static(uploadRoot));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'employee-work-reporting',
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ✅ Vercel serverless export — CORS preflight handled FIRST before any async work
module.exports = async (req, res) => {
  const requestPath = String(req.url || '');

  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (requestPath === '/api/health' || requestPath.startsWith('/api/health?')) {
    return res.status(200).json({
      status: 'ok',
      service: 'employee-work-reporting',
      timestamp: new Date().toISOString(),
      databaseConfigured: Boolean(MONGO_URI),
    });
  }

  try {
    await connectAndBootstrap();
    registerRoutes();
    return app(req, res);
  } catch (error) {
    console.error('Server initialization failed:', error.message);
    return res.status(500).json({
      error: error.message || 'Server initialization failed.',
    });
  }
};

// ✅ Local development server — only runs when executed directly (not on Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  connectAndBootstrap()
    .then(() => {
      registerRoutes();
      app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🛢  MongoDB connected`);
      });
    })
    .catch((err) => {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    });
}