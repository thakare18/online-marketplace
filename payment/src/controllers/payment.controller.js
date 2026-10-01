const crypto = require('crypto');
const mongoose = require('mongoose');
const paymentModel = require('../models/payment.model');
const axios = require('axios');
const { publishToQueue } = require('../broker/broker'); // FIX: was `require('../broker/broker')` (imported whole module)

require('dotenv').config();
const Razorpay = require('razorpay');

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

// Razorpay client factory — supports test mocking and dynamic env vars
let _customRazorpay = null;
function getRazorpayClient() {
    if (_customRazorpay) return _customRazorpay;
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        return new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return null;
}
function setRazorpayClient(client) {
    _customRazorpay = client;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractToken(req) {
    return req.cookies?.token || req.cookies?.accessToken || req.headers?.authorization?.split(' ')[1];
}

/**
 * Publish a standardized event payload.
 * {event, version, timestamp, data}
 * Non-fatal — never throw; only log.
 */
async function publishEvent(queueName, eventName, data) {
    const payload = {
        event: eventName,
        version: 1,
        timestamp: new Date().toISOString(),
        data,
    };
    try {
        await publishToQueue(queueName, payload);
    } catch (err) {
        console.warn(`[Payment] Failed to publish ${eventName}:`, err.message);
    }
}

/**
 * Update Order paymentStatus via Order service API.
 * Non-fatal — logs warning if Order service is unavailable.
 */
async function updateOrderPaymentStatus(orderId, paymentStatus, token) {
    try {
        await axios.patch(
            `${ORDER_SERVICE_URL}/api/orders/${orderId}/payment-status`,
            { paymentStatus },
            {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000,
            }
        );
    } catch (err) {
        console.warn(`[Payment] Failed to update order ${orderId} payment status:`, err.message);
    }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/payments/create/:orderId
 * Creates a Razorpay order for the given application order.
 * - Fetches order from Order service (authoritative total)
 * - Prevents duplicate payment for already-paid orders
 * - Converts INR to paise for Razorpay
 * - Stores payment record with CREATED status
 */
async function createPayment(req, res) {
    const token = extractToken(req);

    try {
        const { orderId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        // 1. Fetch order from Order service — get authoritative total
        let order;
        try {
            const orderResponse = await axios.get(
                `${ORDER_SERVICE_URL}/api/orders/${orderId}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 5000,
                }
            );
            // FIX: was orderResponse.formData.order.totalPrice (wrong property)
            order = orderResponse.data.order;
        } catch (err) {
            if (err.response?.status === 404) {
                return res.status(404).json({ message: 'Order not found' });
            }
            if (err.response?.status === 403) {
                return res.status(403).json({ message: 'Forbidden: Not your order' });
            }
            return res.status(503).json({ message: 'Order service unavailable' });
        }

        // 2. Prevent payment for non-PENDING orders
        if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
            return res.status(409).json({
                message: `Cannot create payment: order status is ${order.status}`,
            });
        }

        // 3. Prevent duplicate payment if order is already paid
        if (order.paymentStatus === 'PAID') {
            return res.status(409).json({ message: 'Order is already paid' });
        }

        // 4. Check for existing CREATED payment record (idempotency)
        const existingPayment = await paymentModel.findOne({
            order: orderId,
            status: 'CREATED',
        });
        if (existingPayment) {
            // Return existing payment — safe re-use
            return res.status(200).json({
                message: 'Payment already initiated',
                payment: existingPayment,
                razorpayOrderId: existingPayment.razorpayOrderId,
            });
        }

        // 5. Validate Razorpay is configured
        const razorpay = getRazorpayClient();
        if (!razorpay) {
            return res.status(503).json({ message: 'Payment gateway not configured' });
        }

        const totalPrice = order.totalPrice;
        if (!totalPrice?.amount || !totalPrice?.currency) {
            return res.status(422).json({ message: 'Invalid order total' });
        }

        // 6. Convert to smallest currency unit (paise for INR, cents for USD)
        // FIX: was passing price object directly without conversion
        const amountInPaise = Math.round(totalPrice.amount * 100);

        // 7. Create Razorpay order
        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create({
                amount: amountInPaise,       // must be integer paise
                currency: totalPrice.currency,
                receipt: String(orderId),    // application order ID as receipt
                notes: {
                    orderId: String(orderId),
                    userId: String(req.user.id),
                },
            });
        } catch (err) {
            console.error('[Payment] Razorpay order creation failed:', err.message);
            return res.status(502).json({ message: 'Payment gateway error', error: err.message });
        }

        // 8. Store payment record
        // FIX: was `new paymentModel.create(...)` — paymentModel.create() is a static method
        const payment = await paymentModel.create({
            order: orderId,
            razorpayOrderId: razorpayOrder.id,
            user: req.user.id,
            status: 'CREATED',
            price: {
                amount: amountInPaise,         // stored in paise
                currency: totalPrice.currency,
            },
        });

        // 9. Publish payment.initiated event
        await publishEvent('PAYMENT_NOTIFICATION.PAYMENT_INITIATED', 'payment.initiated', {
            email: req.user.email,
            username: req.user.username || req.user.fullName?.firstName || 'Customer',
            orderId: String(orderId),
            amount: totalPrice.amount,         // rupees for display
            currency: totalPrice.currency,
            paymentId: String(payment._id),
        });

        // Legacy queue name for backward compat
        await publishEvent('PAYMENT_SELLER_DASHBOARD.PAYMENT_CREATED', 'payment.initiated', {
            paymentId: String(payment._id),
            orderId: String(orderId),
            userId: String(req.user.id),
            amount: totalPrice.amount,
            currency: totalPrice.currency,
        });

        return res.status(201).json({
            message: 'Payment initiated successfully',
            payment,
            razorpayOrderId: razorpayOrder.id,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID, // safe to expose key_id (public)
        });

    } catch (err) {
        console.error('[Payment] createPayment error:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * POST /api/payments/verify
 * Verifies Razorpay HMAC-SHA256 signature.
 * - Never trusts client payment status
 * - Updates payment record to COMPLETED/FAILED
 * - Updates order paymentStatus via Order service
 * - Publishes payment.completed event
 */
async function verifyPayment(req, res) {
    const { razorpayOrderId, paymentId, signature } = req.body || {};
    const token = extractToken(req);

    if (!razorpayOrderId || !paymentId || !signature) {
        return res.status(400).json({ message: 'razorpayOrderId, paymentId, and signature are required' });
    }

    try {
        // 1. Find payment record in CREATED state (prevent duplicate verification)
        const payment = await paymentModel.findOne({
            razorpayOrderId,
            status: 'CREATED',
        });

        if (!payment) {
            // Check if already completed (idempotent) or in another terminal state
            const existingPayment = await paymentModel.findOne({ razorpayOrderId });
            if (existingPayment) {
                if (existingPayment.status === 'COMPLETED') {
                    return res.status(200).json({ message: 'Payment already verified', payment: existingPayment });
                }
                if (existingPayment.status === 'FAILED') {
                    return res.status(409).json({ message: 'Payment previously failed', payment: existingPayment });
                }
                if (existingPayment.status === 'REFUNDED') {
                    return res.status(409).json({ message: 'Payment already refunded', payment: existingPayment });
                }
            }
            return res.status(404).json({ message: 'Payment not found or already processed' });
        }

        // 2. Verify HMAC-SHA256 signature
        // FIX: was using deep node_modules path import; use crypto directly (same algorithm)
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            return res.status(503).json({ message: 'Payment gateway not configured' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${razorpayOrderId}|${paymentId}`)
            .digest('hex');

        const isValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(signature, 'hex')
        );

        if (!isValid) {
            // Mark payment as FAILED (invalid signature)
            payment.status = 'FAILED';
            payment.failureReason = 'Invalid payment signature';
            await payment.save();

            await publishEvent('PAYMENT_NOTIFICATION.PAYMENT_FAILED', 'payment.failed', {
                email: req.user.email,
                username: req.user.username || req.user.fullName?.firstName || 'Customer',
                orderId: String(payment.order),
                paymentId: String(payment._id),
                reason: 'Invalid signature',
            });

            return res.status(400).json({ message: 'Invalid payment signature' });
        }

        // 3. Signature valid — mark COMPLETED
        payment.paymentId = paymentId;
        payment.signature = signature;
        payment.status = 'COMPLETED';
        await payment.save();

        // 4. Update Order paymentStatus via Order service API
        await updateOrderPaymentStatus(String(payment.order), 'PAID', token);

        // 5. Publish payment.completed event
        await publishEvent('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED', 'payment.completed', {
            email: req.user.email,
            username: req.user.username || req.user.fullName?.firstName || 'Customer',
            orderId: String(payment.order),
            paymentId: String(payment._id),
            transactionId: paymentId,           // Razorpay paymentId as transaction ref
            amount: payment.price.amount / 100, // convert paise → rupees for display
            currency: payment.price.currency,
        });

        // Legacy queue name for backward compat
        await publishEvent('PAYMENT_SELLER_DASHBOARD.PAYMENT_UPDATED', 'payment.completed', {
            paymentId: String(payment._id),
            orderId: String(payment.order),
            status: 'COMPLETED',
        });

        return res.status(200).json({ message: 'Payment verified successfully', payment });

    } catch (err) {
        // FIX: catch block was referencing `payment` which may be undefined here
        console.error('[Payment] verifyPayment error:', err.message);

        // Attempt to publish failure event only if we can safely access context
        await publishEvent('PAYMENT_NOTIFICATION.PAYMENT_FAILED', 'payment.failed', {
            email: req.user?.email,
            username: req.user?.username || req.user?.fullName?.firstName || 'Customer',
            orderId: razorpayOrderId,
            reason: 'Internal error during verification',
        }).catch(() => {}); // double guard — don't throw from catch

        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * GET /api/payments/:paymentId
 * Get a specific payment record (owner or admin only).
 */
async function getPayment(req, res) {
    try {
        const { paymentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(paymentId)) {
            return res.status(400).json({ message: 'Invalid payment ID' });
        }

        const payment = await paymentModel.findById(paymentId).exec();
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        // Only owner or admin can view
        if (req.user.role !== 'admin' && payment.user.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        return res.status(200).json({ payment });
    } catch (err) {
        console.error('[Payment] getPayment error:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * GET /api/payments/order/:orderId
 * Get payment for a specific order.
 */
async function getPaymentByOrder(req, res) {
    try {
        const { orderId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const payment = await paymentModel.findOne({ order: orderId }).sort({ createdAt: -1 }).exec();
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found for this order' });
        }

        if (req.user.role !== 'admin' && payment.user.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        return res.status(200).json({ payment });
    } catch (err) {
        console.error('[Payment] getPaymentByOrder error:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * POST /api/payments/refund/:paymentId
 * Issues a refund for a COMPLETED payment.
 * Validates state transition COMPLETED -> REFUNDED.
 * Calls Razorpay refunds API if configured.
 * Updates payment status and publishes payment.refunded.
 */
async function refundPayment(req, res) {
    const { paymentId } = req.params;
    const { amount, reason } = req.body || {};
    const token = extractToken(req);

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return res.status(400).json({ message: 'Invalid payment ID' });
    }

    try {
        const payment = await paymentModel.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        // Ownership check (owner or admin)
        if (req.user.role !== 'admin' && payment.user.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Validate state transition
        if (!paymentModel.isValidTransition(payment.status, 'REFUNDED')) {
            return res.status(409).json({
                message: `Cannot refund payment with status ${payment.status}`,
            });
        }

        let refundResult = { id: `rfnd_${Date.now()}` };
        const razorpay = getRazorpayClient();
        if (razorpay && payment.paymentId) {
            try {
                const refundPayload = {};
                if (amount) {
                    refundPayload.amount = Math.round(amount * 100);
                }
                refundResult = await razorpay.payments.refund(payment.paymentId, refundPayload);
            } catch (rzpErr) {
                console.error('[Payment] Razorpay refund error:', rzpErr.message);
                return res.status(502).json({
                    message: 'Razorpay refund failed',
                    error: rzpErr.message,
                });
            }
        }

        payment.status = 'REFUNDED';
        payment.refundId = refundResult?.id || null;
        await payment.save();

        // Sync order paymentStatus to REFUNDED (non-fatal)
        await updateOrderPaymentStatus(String(payment.order), 'REFUNDED', token);

        // Publish payment.refunded event
        await publishEvent('PAYMENT_NOTIFICATION.PAYMENT_REFUNDED', 'payment.refunded', {
            email: req.user.email,
            username: req.user.username || req.user.fullName?.firstName || 'Customer',
            orderId: String(payment.order),
            paymentId: String(payment._id),
            refundId: payment.refundId,
            amount: payment.price.amount / 100,
            currency: payment.price.currency,
            reason: reason || 'Customer requested refund',
        });

        return res.status(200).json({
            message: 'Payment refunded successfully',
            payment,
        });
    } catch (err) {
        console.error('[Payment] refundPayment error:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


module.exports = {
    createPayment,
    verifyPayment,
    refundPayment,
    getPayment,
    getPaymentByOrder,
    setRazorpayClient,
};