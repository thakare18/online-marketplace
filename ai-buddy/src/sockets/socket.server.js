const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { agent } = require('../agent/agent');

// Per-socket rate limiting tracking
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 30; // Max 30 messages/min

function checkRateLimit(socketId) {
    const now = Date.now();
    let record = rateLimitMap.get(socketId);
    if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
        rateLimitMap.set(socketId, record);
        return true;
    }

    if (record.count >= MAX_MESSAGES_PER_WINDOW) {
        return false;
    }

    record.count++;
    return true;
}

function initSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // ─── Authentication Middleware ───────────────────────────────────────────
    io.use((socket, next) => {
        try {
            const rawCookie = socket.handshake.headers?.cookie || '';
            const parsedCookies = cookie.parse(rawCookie);
            const authHeader = socket.handshake.headers?.authorization;
            const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

            const token = parsedCookies.token || socket.handshake.auth?.token || bearerToken;

            if (!token) {
                return next(new Error('Authentication token not provided'));
            }

            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                return next(new Error('JWT secret is not configured on the server'));
            }

            const decoded = jwt.verify(token, jwtSecret);
            socket.user = decoded;
            socket.token = token;
            next();
        } catch (error) {
            return next(new Error('Invalid or expired authentication token'));
        }
    });

    // ─── Connection & Event Handling ─────────────────────────────────────────
    io.on('connection', (socket) => {
        socket.on('disconnect', () => {
            rateLimitMap.delete(socket.id);
        });

        socket.on('message', async (data) => {
            // Validate incoming message
            const rawContent = typeof data === 'string' ? data : (data && typeof data.content === 'string' ? data.content : null);

            if (!rawContent || !rawContent.trim()) {
                return socket.emit('error', { message: 'Message content cannot be empty.' });
            }

            const userMessage = rawContent.trim();

            // Rate limiting check
            if (!checkRateLimit(socket.id)) {
                return socket.emit('error', {
                    message: 'Rate limit exceeded. Please wait a moment before sending more messages.'
                });
            }

            try {
                const agentResponse = await agent.invoke(
                    {
                        messages: [
                            {
                                role: "user",
                                content: userMessage
                            }
                        ]
                    },
                    {
                        metadata: {
                            token: socket.token,
                            user: socket.user
                        }
                    }
                );

                const messages = agentResponse?.messages || [];
                const lastMessage = messages[messages.length - 1];
                const reply = lastMessage?.content || "I was unable to process your request. Please try again.";

                socket.emit('message', reply);
            } catch (err) {
                console.error('[AI-Buddy] Error processing message:', err.message);

                if (err.code === 'AI_PROVIDER_UNAVAILABLE') {
                    socket.emit('error', {
                        message: 'AI Assistant is currently unavailable (AI provider not configured).'
                    });
                } else {
                    socket.emit('error', {
                        message: 'An error occurred while processing your request. Please try again later.'
                    });
                }
            }
        });
    });

    return io;
}

module.exports = initSocketServer;
module.exports.checkRateLimit = checkRateLimit;
module.exports.rateLimitMap = rateLimitMap;