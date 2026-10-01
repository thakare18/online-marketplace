require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const initSocketServer = require('./src/sockets/socket.server');

const httpServer = http.createServer(app);
const io = initSocketServer(httpServer);

const PORT = process.env.PORT || 3005;

let server;

if (process.env.NODE_ENV !== 'test') {
    server = httpServer.listen(PORT, () => {
        console.log(`AI Buddy Server is running on port ${PORT}`);
    });
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = async () => {
    console.log('[AI-Buddy] Shutting down gracefully...');
    if (io) {
        try { io.close(); } catch (_) {}
    }
    if (server) {
        server.close(() => {
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
    console.error('[AI-Buddy] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[AI-Buddy] Uncaught Exception:', err.message);
});

module.exports = { app, httpServer, io };