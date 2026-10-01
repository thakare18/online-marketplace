const express = require('express');
const { connect } = require('./broker/broker');
const setListeners = require('./broker/listners');

const app = express();
app.use(express.json());

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
    res.status(200).json({
        status: 'healthy',
        service: 'notification',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// ─── 404 & Global Error Handling ─────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Notification] Unhandled error:', err.message);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
    });
});

module.exports = app;