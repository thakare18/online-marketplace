require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const { connect } = require('./src/broker/broker');

const PORT = process.env.PORT || 3001;
let server;

async function startServer() {
    try {
        await connectDB();
        await connect();

        server = app.listen(PORT, () => {
            console.log(`Product service is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Product server startup failed:', error.message);
        process.exit(1);
    }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = async () => {
    console.log('[Product] Shutting down gracefully...');
    if (server) {
        server.close(async () => {
            try {
                if (mongoose.connection && mongoose.connection.readyState !== 0) {
                    await mongoose.connection.close(false);
                }
            } catch (_) {}
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
    setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
    console.error('[Product] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Product] Uncaught Exception:', err.message);
});

startServer();

module.exports = { app, startServer };