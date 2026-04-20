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

const addUserAddressValidation = [
    body('street')
    .exists({ checkFalsy: true })
    .withMessage('Street is required')
    .bail()
    .isString()
    .withMessage('Street must be a string')
    .trim(),
    body('city')
    .exists({ checkFalsy: true })
    .withMessage('City is required')
    .bail()
    .isString()
    .withMessage('City must be a string')
    .trim(),
    body('state')
    .exists({ checkFalsy: true })
    .withMessage('State is required')
    .bail()
    .isString()
    .withMessage('State must be a string')
    .trim(),
    body('zip')
    .exists({ checkFalsy: true })
    .withMessage('Zip code is required')
    .bail()
    .isString()
    .withMessage('Zip code must be a string')
    .trim(),
    body('country')
    .exists({ checkFalsy: true })
    .withMessage('Country is required')
    .bail()
    .isString()
    .withMessage('Country must be a string')
    .trim(),
    body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean')

];

module.exports = {
    registerUserValidation,
    loginUserValidation,
    addUserAddressValidation,
    responseValidationErrors
};