const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const orderController = require('../controller/order.controller');
const validation = require('../middleware/validation.middleware');

const router = express.Router();

// POST /api/orders — Create order from cart
router.post(
    '/',
    authMiddleware(['user']),
    validation.createOrderValidation,
    orderController.createOrder
);

// GET /api/orders/me — MUST be before /:id to avoid conflict
router.get(
    '/me',
    authMiddleware(['user']),
    orderController.getMyOrders
);

// GET /api/orders/:id — Get order by ID
router.get(
    '/:id',
    authMiddleware(['user', 'admin']),
    orderController.getOrderById
);

// POST /api/orders/:id/cancel — Cancel order
router.post(
    '/:id/cancel',
    authMiddleware(['user', 'admin']),
    orderController.cancelOrderById
);

// PATCH /api/orders/:id/address — Update shipping address
router.patch(
    '/:id/address',
    authMiddleware(['user']),
    validation.updateAddressValidation,
    orderController.updateOrderAddress
);

// PATCH /api/orders/:id/status — Admin-only status update
router.patch(
    '/:id/status',
    authMiddleware(['admin']),
    orderController.updateOrderStatus
);

// PATCH /api/orders/:id/payment-status — Payment service callback (sync payment status)
router.patch(
    '/:id/payment-status',
    authMiddleware(['user', 'admin']),
    orderController.updateOrderPaymentStatus
);


module.exports = router;