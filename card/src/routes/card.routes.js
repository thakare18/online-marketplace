// Cart service routes — canonical prefix: /api/cards (backward compatible)
const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const cardController = require('../controller/card.controller');
const validation = require('../middleware/validator.middleware');


const router = express.Router();

// All cart routes require 'user' role
// Sellers and admins use their own panels — not the cart

// GET /api/cards — get current user's cart
router.get(
    '/',
    createAuthMiddleware(['user']),
    cardController.getCart
);

// POST /api/cards/items — add item to cart
router.post(
    '/items',
    validation.validateAddItemToCard,
    createAuthMiddleware(['user']),
    cardController.addItemToCard
);

// PATCH /api/cards/items/:productId — update item quantity
router.patch(
    '/items/:productId',
    validation.validateUpdateCartItem,
    createAuthMiddleware(['user']),
    cardController.updateItemQuantity
);

// DELETE /api/cards/items/:productId — remove single item from cart
router.delete(
    '/items/:productId',
    createAuthMiddleware(['user']),
    cardController.removeItemFromCart
);

// DELETE /api/cards — clear entire cart
router.delete(
    '/',
    createAuthMiddleware(['user']),
    cardController.clearCart
);


module.exports = router;