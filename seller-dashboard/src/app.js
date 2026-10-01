const express = require('express');
const cookieParser = require('cookie-parser');
const sellerRoutes = require('./routes/seller.routes');

const app = express();

app.use(cookieParser());
app.use(express.json());

// ─── Health check routes ─────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Seller Dashboard is running' });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'seller-dashboard',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/seller/dashboard', sellerRoutes);

// ─── 404 & Global Error Handling ─────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Seller-Dashboard] Unhandled error:', err.message);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
    });
});

module.exports = app;