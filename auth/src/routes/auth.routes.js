const express = require('express');
const validator = require('../middleware/validator.middleware');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/auth.middleware');


const router = express.Router();

// ─── Public Auth Routes ────────────────────────────────────────────────────────

router.post(
    '/register',
    validator.registerUserValidation,
    authController.registerUser
);

router.post(
    '/login',
    validator.loginUserValidation,
    authController.loginUser
);

// POST /api/auth/refresh - exchange refresh token for new access token
router.post(
    '/refresh',
    validator.refreshTokenValidation,
    authController.refreshAccessToken
);

// ─── Protected Auth Routes ────────────────────────────────────────────────────

// GET /api/auth/me
router.get('/me', authMiddleware, authController.getCurrentUser);

// POST /api/auth/logout (changed from GET to POST for idempotency)
router.post('/logout', authMiddleware, authController.logoutUser);

// Backward-compatible GET logout (deprecated but kept)
router.get('/logout', authMiddleware, authController.logoutUser);

// ─── Address Routes ───────────────────────────────────────────────────────────

router.get(
    '/users/me/addresses',
    authMiddleware,
    authController.getUserAddresses
);

router.post(
    '/users/me/addresses',
    authMiddleware,
    validator.addUserAddressValidation,
    validator.responseValidationErrors,
    authController.addUserAddress
);

router.delete(
    '/users/me/addresses/:addressId',
    authMiddleware,
    authController.deleteUserAddress
);

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// Example admin-only endpoint: list users (placeholder for future admin panel)
router.get(
    '/admin/users',
    authMiddleware,
    authorizeRoles('admin'),
    async (req, res) => {
        return res.status(200).json({ message: 'Admin: user list endpoint' });
    }
);


module.exports = router;
