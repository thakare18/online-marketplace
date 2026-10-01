const express = require('express');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { agent, isConfigured } = require('./agent/agent');

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

// Simple in-memory rate limiter for REST chat endpoint
const restRateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 30;

function checkRestRateLimit(ip) {
    const now = Date.now();
    let record = restRateLimits.get(ip);
    if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
        restRateLimits.set(ip, record);
        return true;
    }
    if (record.count >= MAX_REQUESTS) {
        return false;
    }
    record.count++;
    return true;
}

// ─── Health & Status Endpoints ───────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).send('Ai service is running');
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'ai-buddy',
        provider: 'google-gemini',
        aiConfigured: isConfigured(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ─── REST Chat Endpoint ──────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
    try {
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        if (process.env.NODE_ENV !== 'test' && !checkRestRateLimit(clientIp)) {
            return res.status(429).json({ message: 'Rate limit exceeded. Please wait a moment.' });
        }

        const { message } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'Validation failed: message must be a non-empty string' });
        }

        // Optional or required auth depending on token presence
        const rawCookie = req.headers.cookie || '';
        const parsedCookies = cookie.parse(rawCookie);
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const token = parsedCookies.token || bearerToken;

        let user = null;
        if (token && process.env.JWT_SECRET) {
            try {
                user = jwt.verify(token, process.env.JWT_SECRET);
            } catch (_) {
                // If invalid token passed, return 401
                return res.status(401).json({ message: 'Invalid or expired authentication token' });
            }
        }

        const agentResponse = await agent.invoke(
            {
                messages: [
                    {
                        role: "user",
                        content: message.trim()
                    }
                ]
            },
            {
                metadata: {
                    token: token || null,
                    user: user || null
                }
            }
        );

        const messages = agentResponse?.messages || [];
        const lastMessage = messages[messages.length - 1];
        const reply = lastMessage?.content || "";

        return res.status(200).json({
            reply,
            messages: messages.map(m => ({
                role: m._getType ? m._getType() : m.constructor.name,
                content: m.content
            }))
        });
    } catch (err) {
        if (err.code === 'AI_PROVIDER_UNAVAILABLE') {
            return res.status(503).json({
                message: 'AI Assistant is currently unavailable (provider unconfigured).'
            });
        }

        console.error('[AI-Buddy] REST chat error:', err.message);
        return res.status(500).json({
            message: 'Internal server error while processing AI request.'
        });
    }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[AI-Buddy] Unhandled server error:', err.message);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
        message: 'Internal server error',
        ...(isDev && { error: err.message })
    });
});

module.exports = app;