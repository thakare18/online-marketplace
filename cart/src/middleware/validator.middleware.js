const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');


function validateResult(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
}


const validateAddItemToCard = [
    body('productId').isString().withMessage('Product ID must be a string')
    .custom(value => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid Product ID format'),// validate that it's a valid MongoDB ObjectId if not, return error message
    body('qty').isInt({ gt: 0 }).withMessage('Quantity must be a positive integer'),
    validateResult
]

const validateUpdateCartItem = [
    param('productId')
        .isString()
        .withMessage('Product ID must be a string')
        .custom(value => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Invalid Product ID format'),
    body('qty')
        .isInt({ gt: 0 })
        .withMessage('Quantity must be a positive integer'),
    validateResult,
];

module.exports = {
    validateAddItemToCard,
    validateUpdateCartItem
}