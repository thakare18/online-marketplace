const jwt = require('jsonwebtoken');
const redis = require('../db/redis');


async function authMiddleware(req, res, next) {
    const token = req.cookies?.token || req.cookies?.accessToken || req.headers?.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    try {
        // Check token blacklist in Redis (gracefully skip if Redis unavailable)
        try {
            const isBlacklisted = await redis.get(`blacklist:${token}`);
            if (isBlacklisted) {
                return res.status(401).json({ message: 'Unauthorized: Token revoked' });
            }
        } catch (redisErr) {
            // Redis unavailable - continue without blacklist check (log only)
            console.warn('Redis unavailable for blacklist check:', redisErr.message);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
    }
}

/**
 * Role-based authorization middleware factory.
 * Usage: authorizeRoles('admin', 'seller')
 */
function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
}

module.exports = authMiddleware;
module.exports.authorizeRoles = authorizeRoles;