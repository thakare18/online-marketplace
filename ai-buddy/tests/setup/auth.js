const jwt = require('jsonwebtoken');

function generateToken(payload = {}) {
    const defaultPayload = {
        id: '66a1234567890123456789ab',
        email: 'user@example.com',
        role: 'user'
    };
    return jwt.sign({ ...defaultPayload, ...payload }, process.env.JWT_SECRET || 'test_jwt_secret_ai_buddy_key_123456', { expiresIn: '1h' });
}

module.exports = { generateToken };
