const { body, validationResult } = require('express-validator');


function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation error', errors: errors.array() });
    }
    next();
}

const createProductValidators = [
    body('title')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('title is required'),
    body('description')
        .optional()
        .isString()
        .withMessage('description must be a string')
        .trim()
        .isLength({ max: 500 })
        .withMessage('description max length is 500 characters'),
    body('priceAmount')
        .notEmpty()
        .withMessage('priceAmount is required')
        .bail()
        .isFloat({ gt: 0 })
        .withMessage('priceAmount must be a number > 0'),
    body('priceCurrency')
        .optional()
        .isIn(['USD', 'INR'])
        .withMessage('priceCurrency must be USD or INR'),
    body('category')
        .optional()
        .isString()
        .withMessage('category must be a string')
        .trim(),
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('stock must be a non-negative integer'),
    handleValidationErrors
];

const updateStockValidators = [
    body('action')
        .isIn(['set', 'increment', 'decrement'])
        .withMessage('action must be one of: set, increment, decrement'),
    body('quantity')
        .notEmpty()
        .withMessage('quantity is required')
        .bail()
        .isFloat({ min: 0 })
        .withMessage('quantity must be a non-negative number'),
    handleValidationErrors
];



module.exports = { createProductValidators, updateStockValidators, handleValidationErrors };