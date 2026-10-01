const jwt = require('jsonwebtoken');

function getAuthCookie({ userId = '69bf6df8726177827fc33f62', role = 'user', extra = {} } = {}) {
    const secret = process.env.JWT_SECRET || 'test-jwt-secret-payment-service';
    const payload = { id: userId, role, ...extra };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    const cookieName = process.env.JWT_COOKIE_NAME || 'token';
    return [`${cookieName}=${token}`];
}

function signToken({ userId = '69bf6df8726177827fc33f62', role = 'user' } = {}) {
    const secret = process.env.JWT_SECRET || 'test-jwt-secret-payment-service';
    return jwt.sign({ id: userId, role }, secret, { expiresIn: '1h' });
}

module.exports = { getAuthCookie, signToken };
