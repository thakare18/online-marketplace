const express = require('express');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { agent, isConfigured } = require('./agent/agent');

const app = express();

app.use(express.json());

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

app.use((err, req, res, next) => {
    console.error('[AI-Buddy] Unhandled server error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;