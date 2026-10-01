require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const listener = require('./src/broker/listener');
const { connect } = require('./src/broker/broker');

connectDB();

connect().then(() => {
    listener(); // start listening for events after connecting to rabbitmq
}).catch((err) => {
    console.warn('[Seller-Dashboard] RabbitMQ connection warning:', err.message);
});

const PORT = process.env.PORT || 3007;

const server = app.listen(PORT, () => {
    console.log(`Seller dashboard server is running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = async () => {
    console.log('[Seller-Dashboard] Shutting down gracefully...');
    server.close(async () => {
        try {
            if (mongoose.connection && mongoose.connection.readyState !== 0) {
                await mongoose.connection.close(false);
            }
        } catch (_) {}
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
    console.error('[Seller-Dashboard] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Seller-Dashboard] Uncaught Exception:', err.message);
});

module.exports = { app, server };