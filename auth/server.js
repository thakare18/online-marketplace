require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const { connect } = require('./src/brocker/brocker');

connectDB();
connect();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`Auth service is running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = async () => {
    console.log('[Auth] Shutting down gracefully...');
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
    console.error('[Auth] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Auth] Uncaught Exception:', err.message);
});

module.exports = { app, server };