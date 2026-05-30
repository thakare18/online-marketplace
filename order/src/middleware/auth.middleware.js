const jwt = require('jsonwebtoken');

function authMiddleware(roles = [ "user" ]) {
    return function checkAuth(req, res, next) {
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({ message: 'Unauthorized: No token Provided' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (roles.length > 0 && !roles.includes(decoded.role)) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            req.user = decoded; // Attach user info to the request
            return next();
        } catch (err) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
    };
}

module.exports = authMiddleware;
