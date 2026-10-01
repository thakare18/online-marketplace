const express = require('express');
const cookieParser = require('cookie-parser');
const orderRoutes = require('./routes/order.routes');


const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Health check
app.get('/', (req, res) => {
    res.status(200).json({ service: 'order', status: 'running', timestamp: new Date().toISOString() });
});

app.use('/api/orders', orderRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        ...(isDev && { stack: err.stack }),
    });
});

module.exports = app;