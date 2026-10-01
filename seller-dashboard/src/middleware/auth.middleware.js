const jwt = require('jsonwebtoken');

function createAuthMiddleware(roles = ['seller']) {
    return function authMiddleware(req, res, next) {
        const token =
            req.cookies?.token ||
            req.cookies?.accessToken ||
            req.headers?.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                message: 'Unauthorized: No token provided',
            });
        }

        try {
            const secret = process.env.JWT_SECRET || 'testsecret';
            const decoded = jwt.verify(token, secret);

            // Allow if user role matches one of allowed roles, or if user is admin
            if (!roles.includes(decoded.role) && decoded.role !== 'admin') {
                return res.status(403).json({
                    message: 'Forbidden: Insufficient permissions',
                });
            }

            const userId = decoded.id || decoded._id || decoded.userId;
            req.user = {
                ...decoded,
                _id: userId,
                id: userId,
            };
            req.token = token;

            next();
        } catch (err) {
            return res.status(401).json({
                message: 'Unauthorized: Invalid token',
            });
        }
    };
}

module.exports = createAuthMiddleware;