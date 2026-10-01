const userModel = require('../models/user.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redis = require('../db/redis');
const { publishToQueue } = require('../brocker/brocker');

// ─── Helper: Cookie Options ──────────────────────────────────────────────────

function getAccessTokenCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: '/',
    };
}

function getRefreshTokenCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth/refresh',
    };
}

// ─── Helper: Token Generators ────────────────────────────────────────────────

function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { id: user._id, type: 'refresh', jti: crypto.randomUUID() },
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
    );
}

/**
 * Hash a refresh token for secure storage.
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Helper: Set Auth Cookies ─────────────────────────────────────────────────

function setAuthCookies(res, accessToken, refreshToken) {
    // Access token: set in both 'token' (legacy) and 'accessToken' cookies
    res.cookie('token', accessToken, getAccessTokenCookieOptions());
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());
}

// ─── Controllers ─────────────────────────────────────────────────────────────

async function registerUser(req, res) {
    try {
        const { username, email, password, fullName: { firstName, lastName }, role } = req.body;
        const normalizedUsername = String(username).trim();
        const normalizedEmail = String(email).trim().toLowerCase();

        const isUserAlreadyExists = await userModel.findOne({
            $or: [
                { username: normalizedUsername },
                { email: normalizedEmail }
            ]
        });

        if (isUserAlreadyExists) {
            return res.status(409).json({ message: 'Username or email already exists' });
        }

        const hash = await bcrypt.hash(password, 10);

        const user = await userModel.create({
            username: normalizedUsername,
            email: normalizedEmail,
            password: hash,
            fullName: { firstName, lastName },
            role: role === 'seller' ? 'seller' : 'user' // strictly prevent admin creation via public registration
        });

        // Publish events - don't fail registration if RabbitMQ is down
        try {
            await Promise.all([
                publishToQueue('AUTH_NOTIFICATION.USER_CREATED', {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                }),
                publishToQueue('AUTH_SELLER_DASHBOARD.USER_CREATED', {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                })
            ]);
        } catch (mqErr) {
            console.warn('RabbitMQ publish failed (non-fatal):', mqErr.message);
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        const tokenHash = hashToken(refreshToken);

        // Store hashed refresh token
        user.refreshTokenHash = tokenHash;
        await user.save();

        setAuthCookies(res, accessToken, refreshToken);

        return res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                addresses: user.addresses
            }
        });
    } catch (err) {
        console.error('Error in registerUser:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function loginUser(req, res) {
    try {
        const { username, email, password } = req.body;
        const normalizedUsername = username ? String(username).trim() : undefined;
        const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;

        const lookup = [];
        if (normalizedEmail) lookup.push({ email: normalizedEmail });
        if (normalizedUsername) lookup.push({ username: normalizedUsername });

        const user = await userModel.findOne({ $or: lookup });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // OAuth users have no password
        if (!user.password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        const tokenHash = hashToken(refreshToken);

        user.refreshTokenHash = tokenHash;
        await user.save();

        setAuthCookies(res, accessToken, refreshToken);

        return res.status(200).json({
            message: 'Logged in successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                addresses: user.addresses
            }
        });
    } catch (err) {
        console.error('Error in loginUser:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function refreshAccessToken(req, res) {
    try {
        // Accept refresh token from cookie or body (for mobile/API clients)
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token required' });
        }

        // Verify the token signature and expiry
        let decoded;
        try {
            decoded = jwt.verify(
                refreshToken,
                process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
            );
        } catch {
            return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid token type' });
        }

        // Find user and verify stored hash (rotation / revocation)
        const user = await userModel.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        const incomingHash = hashToken(refreshToken);
        if (user.refreshTokenHash !== incomingHash) {
            // Possible token reuse - revoke all tokens for this user
            user.refreshTokenHash = null;
            await user.save();
            return res.status(401).json({ message: 'Refresh token already used or revoked' });
        }

        // Issue new tokens (rotation)
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        const newHash = hashToken(newRefreshToken);

        user.refreshTokenHash = newHash;
        await user.save();

        setAuthCookies(res, newAccessToken, newRefreshToken);

        return res.status(200).json({
            message: 'Token refreshed successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Error in refreshAccessToken:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function getCurrentUser(req, res) {
    return res.status(200).json({
        message: 'Get current user successfully',
        user: req.user
    });
}

async function logoutUser(req, res) {
    try {
        const accessToken = req.cookies?.token || req.cookies?.accessToken;
        const refreshToken = req.cookies?.refreshToken;

        // Blacklist the access token in Redis (graceful if Redis down)
        if (accessToken) {
            try {
                // Calculate remaining TTL from JWT expiry
                let ttl = 15 * 60; // default 15 min
                try {
                    const decoded = jwt.decode(accessToken);
                    if (decoded?.exp) {
                        ttl = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
                    }
                } catch { /* ignore */ }
                await redis.set(`blacklist:${accessToken}`, 'true', 'EX', ttl);
            } catch (redisErr) {
                console.warn('Redis blacklist write failed (non-fatal):', redisErr.message);
            }
        }

        // Revoke stored refresh token hash from DB
        if (req.user?.id) {
            try {
                await userModel.findByIdAndUpdate(req.user.id, { refreshTokenHash: null });
            } catch (dbErr) {
                console.warn('Could not revoke refresh token in DB:', dbErr.message);
            }
        }

        res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
        res.clearCookie('accessToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
        res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/api/auth/refresh' });

        return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Error in logoutUser:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function getUserAddresses(req, res) {
    try {
        const id = req.user.id;
        const user = await userModel.findById(id).select('addresses');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            message: 'User addresses fetched successfully',
            addresses: user.addresses
        });
    } catch (err) {
        console.error('Error in getUserAddresses:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function addUserAddress(req, res) {
    try {
        const id = req.user.id;
        const { street, city, state, country, isDefault } = req.body;
        const zip = req.body.zip ?? req.body.pincode;

        const user = await userModel.findOneAndUpdate(
            { _id: id },
            {
                $push: {
                    addresses: { street, city, state, zip, country, isDefault }
                }
            },
            { returnDocument: 'after' }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(201).json({
            message: 'Address added successfully',
            address: user.addresses[user.addresses.length - 1]
        });
    } catch (err) {
        console.error('Error in addUserAddress:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function deleteUserAddress(req, res) {
    try {
        const id = req.user.id;
        const { addressId } = req.params;

        if (!require('mongoose').Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({ message: 'Invalid address id' });
        }

        const isAddressExists = await userModel.findOne({ _id: id, 'addresses._id': addressId });
        if (!isAddressExists) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const user = await userModel.findOneAndUpdate(
            { _id: id },
            { $pull: { addresses: { _id: addressId } } },
            { returnDocument: 'after' }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const addressExists = user.addresses.some(addr => addr._id.toString() === addressId);
        if (addressExists) {
            return res.status(500).json({ message: 'Failed to delete address' });
        }

        return res.status(200).json({
            message: 'Address deleted successfully',
            addresses: user.addresses
        });
    } catch (err) {
        console.error('Error in deleteUserAddress:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// Requires environment variables:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_CALLBACK_URL  (e.g. http://localhost:3000/api/auth/google/callback)
//
// Install: npm install passport passport-google-oauth20
// Add to app.js: app.use(require('passport').initialize())
// Then register these routes:
//   router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
//   router.get('/google/callback', passport.authenticate(...), googleAuthCallback)

async function googleAuthCallback(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Google authentication failed' });
        }

        const accessToken = generateAccessToken(req.user);
        const refreshToken = generateRefreshToken(req.user);
        const tokenHash = hashToken(refreshToken);

        req.user.refreshTokenHash = tokenHash;
        await req.user.save();

        setAuthCookies(res, accessToken, refreshToken);

        // Redirect to frontend after OAuth success
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/auth/callback?success=true`);
    } catch (err) {
        console.error('Error in googleAuthCallback:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = {
    registerUser,
    loginUser,
    refreshAccessToken,
    getCurrentUser,
    logoutUser,
    getUserAddresses,
    addUserAddress,
    deleteUserAddress,
    googleAuthCallback
};