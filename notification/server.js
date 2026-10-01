require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3006;

const server = app.listen(PORT, () => {
    console.log(`Notification service is running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = async () => {
    console.log('[Notification] Shutting down gracefully...');
    server.close(() => {
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
    console.error('[Notification] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Notification] Uncaught Exception:', err.message);
});

module.exports = { app, server };