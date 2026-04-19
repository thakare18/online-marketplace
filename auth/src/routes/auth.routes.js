const express = require('express');
const validator = require('../middleware/validator.middleware');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');


const router = express.Router();

router.post('/register', validator.registerUserValidation, validator.responseValidationErrors, authController.registerUser);
router.post('/login', validator.loginUserValidation, authController.loginUser);

// GET /api/auth/me
router.get('/me', authMiddleware, authController.getCurrentUser);

module.exports = router;
