const express = require('express');
const createAuthMiddleware = require('../middlewares/auth.middleware');
const paymentController = require('../controllers/payment.controller');


const router = express.Router();

// POST /api/payments/create/:orderId — Initiate Razorpay payment for an order
router.post(
    '/create/:orderId',
    createAuthMiddleware(['user']),
    paymentController.createPayment
);

// POST /api/payments/verify — Verify Razorpay HMAC-SHA256 signature
router.post(
    '/verify',
    createAuthMiddleware(['user']),
    paymentController.verifyPayment
);

// POST /api/payments/refund/:paymentId — Issue refund for a completed payment
router.post(
    '/refund/:paymentId',
    createAuthMiddleware(['user', 'admin']),
    paymentController.refundPayment
);

// GET /api/payments/order/:orderId — Get payment by application order ID
router.get(
    '/order/:orderId',
    createAuthMiddleware(['user', 'admin']),
    paymentController.getPaymentByOrder
);

// GET /api/payments/:paymentId — Get payment by payment record ID
router.get(
    '/:paymentId',
    createAuthMiddleware(['user', 'admin']),
    paymentController.getPayment
);


module.exports = router;