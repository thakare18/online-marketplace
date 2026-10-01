const jwt = require('jsonwebtoken');

function authMiddleware(roles = ['user']) {
    return function checkAuth(req, res, next) {
        // Accept token from cookie (primary) or Authorization header (Bearer)
        const token = req.cookies?.token
            || req.cookies?.accessToken
            || req.headers?.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Unauthorized: No token provided' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (roles.length > 0 && !roles.includes(decoded.role)) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            req.user = decoded;
            return next();
        } catch (err) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
    };
}

module.exports = authMiddleware;
