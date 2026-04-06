const { body, validationResult } = require('express-validator');

const responseValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array().map((error) => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();

}

const registerUserValidation = [
    body('username')
    .exists({ checkFalsy: true })
    .withMessage('Username is required')
    .bail()
    .isString()
    .withMessage('Username must be a string')
    .trim()
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters long'),
    body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required')
    .bail()
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Invalid email address'),
    body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .bail()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
    body('fullName.firstName')
    .exists({ checkFalsy: true })
    .withMessage('First name is required')
    .bail()
    .isString()
    .withMessage('First name must be a string')
    .trim(),
    body('fullName.lastName')
    .exists({ checkFalsy: true })
    .withMessage('Last name is required')
    .bail()
    .isString()
    .withMessage('Last name must be a string')
    .trim()
]


const loginUserValidation = [
    body('email')
    .optional()
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Invalid email address'),
    body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .bail()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
    body('username')
    .optional()
    .trim()
    .isString()
    .withMessage('Username must be a string'),
    (req, res, next) => {
        if (!req.body.email && !req.body.username) {
            return res.status(400).json({
                message: 'Either email or username is required for login'
            });
        }
        responseValidationErrors(req, res, next);
    }
]

module.exports = {
    registerUserValidation,
    loginUserValidation,
    responseValidationErrors
};