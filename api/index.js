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

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
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
app.options('*', cors());
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

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'employee-work-reporting',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', require('../routes/auth'));
app.use('/api/reports', require('../routes/reports'));
app.use('/api/admin', require('../routes/admin'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = async (req, res) => {
  try {
    await connectAndBootstrap();
    return app(req, res);
  } catch (error) {
    console.error('Server initialization failed:', error.message);
    return res.status(500).json({
      error: error.message || 'Server initialization failed.',
    });
  }
};
