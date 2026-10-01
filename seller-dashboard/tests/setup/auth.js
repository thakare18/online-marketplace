const jwt = require('jsonwebtoken');

function getAuthCookie({ userId = '60bf6df8726177827fc33f77', role = 'seller', extra = {} } = {}) {
    const secret = process.env.JWT_SECRET || 'test-jwt-secret-seller-dashboard';
    const payload = { id: userId, _id: userId, role, ...extra };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    const cookieName = process.env.JWT_COOKIE_NAME || 'token';
    return [`${cookieName}=${token}`];
}

function signToken({ userId = '60bf6df8726177827fc33f77', role = 'seller' } = {}) {
    const secret = process.env.JWT_SECRET || 'test-jwt-secret-seller-dashboard';
    return jwt.sign({ id: userId, _id: userId, role }, secret, { expiresIn: '1h' });
}

module.exports = { getAuthCookie, signToken };
