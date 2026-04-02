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
const PORT = process.env.PORT || 5000;
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

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = String(origin).replace(/\/$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
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

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

if (!MONGO_URI) {
  console.error('Missing MONGO_URI. Create backend/.env from backend/.env.example.');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    await ensureDefaultUsers();
    app.listen(PORT, () => {
      console.log(`Employee reporting API running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    if (String(MONGO_URI).startsWith('mongodb+srv://')) {
      console.error('Atlas SRV connection could not be resolved or reached.');
      console.error('Try one of these next steps:');
      console.error('1. Check internet/DNS access and Atlas IP allowlist.');
      console.error('2. Replace MONGO_URI with a standard mongodb:// connection string.');
      console.error('3. Install a local MongoDB server and use mongodb://127.0.0.1:27017/txtilpros-reports');
    }
    process.exit(1);
  });
