const express = require('express');
const validator = require('../middleware/validator.middleware');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');


const router = express.Router();

router.post('/register', validator.registerUserValidation, validator.responseValidationErrors, authController.registerUser);
router.post('/login', validator.loginUserValidation, authController.loginUser);

// GET /api/auth/me
router.get('/me', authMiddleware, authController.getCurrentUser);
router.get('/logout', authMiddleware, authController.logoutUser);

router.get('/auth/users/me/addresses', authMiddleware, authController.getUserAddresses);

module.exports = router;
