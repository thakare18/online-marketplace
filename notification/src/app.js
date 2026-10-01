const express = require('express');
const { connect } = require('./broker/broker');
const setListeners = require('./broker/listners');
const { providerRegistry } = require('./providers/provider.registry');

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3007'];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json({ limit: '10kb' }));

// Auto-connect and register listeners in normal runtime
if (process.env.NODE_ENV !== 'test') {
    connect()
        .then(() => {
            setListeners();
        })
        .catch((err) => {
            console.warn('[Notification] RabbitMQ connection warning at startup:', err.message);
        });
}

// ─── Health & Status Routes ──────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Notification service is up and running' });
});

app.get('/health', (req, res) => {
    const emailProvider = providerRegistry?.get('email');
    res.status(200).json({
        status: 'healthy',
        service: 'notification',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        readiness: {
            emailProvider: emailProvider?.isConfigured() ? 'configured' : 'unconfigured'
        }
    });
});

// ─── 404 & Global Error Handling ─────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Notification] Unhandled error:', err.message);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        ...(isDev && { stack: err.stack })
    });
});

module.exports = app;