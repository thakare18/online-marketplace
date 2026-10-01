require('./setup/env');
require('./setup/mongodb');

const request = require('supertest');
const crypto = require('crypto');
const mongoose = require('mongoose');
const app = require('../src/app');
const paymentModel = require('../src/models/payment.model');
const { getAuthCookie } = require('./setup/auth');
const { setRazorpayClient } = require('../src/controllers/payment.controller');

// Mock dependencies
jest.mock('axios');
const axios = require('axios');

jest.mock('../src/broker/broker', () => ({
    connect: jest.fn().mockResolvedValue(true),
    publishToQueue: jest.fn().mockResolvedValue(true),
    subscribeToQueue: jest.fn().mockResolvedValue(true),
}));
const { publishToQueue } = require('../src/broker/broker');

describe('End-to-End Payment Flow & Failure Paths', () => {
    const userId = '69bf6df8726177827fc33f62';
    const authCookie = getAuthCookie({ userId, role: 'user' });
    const secret = process.env.RAZORPAY_KEY_SECRET || 'test_razorpay_secret';

    let mockRazorpay;

    beforeEach(() => {
        jest.clearAllMocks();

        mockRazorpay = {
            orders: {
                create: jest.fn().mockImplementation(async ({ amount, currency, receipt }) => ({
                    id: `order_rzp_${Date.now()}`,
                    entity: 'order',
                    amount,
                    currency,
                    receipt,
                    status: 'created',
                })),
            },
            payments: {
                refund: jest.fn().mockImplementation(async (paymentId, payload) => ({
                    id: `rfnd_rzp_${Date.now()}`,
                    entity: 'refund',
                    payment_id: paymentId,
                    amount: payload.amount,
                    status: 'processed',
                })),
            },
        };

        setRazorpayClient(mockRazorpay);
    });

    afterAll(() => {
        setRazorpayClient(null);
    });

    function computeSignature(razorpayOrderId, paymentId) {
        return crypto
            .createHmac('sha256', secret)
            .update(`${razorpayOrderId}|${paymentId}`)
            .digest('hex');
    }

    it('E2E SUCCESS FLOW: Order -> Create Payment -> Verify Signature -> Payment COMPLETED -> Order Sync -> Event Published', async () => {
        const orderId = new mongoose.Types.ObjectId().toString();

        // Simulated Order in Order Service
        const orderState = {
            _id: orderId,
            user: userId,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            totalPrice: {
                amount: 1499.50, // 1,499.50 INR
                currency: 'INR',
            },
        };

        // 1. Mock Order Service GET /api/orders/:id
        axios.get.mockImplementation(async (url) => {
            if (url.includes(`/api/orders/${orderId}`)) {
                return { data: { order: orderState } };
            }
            throw new Error(`Unexpected GET ${url}`);
        });

        // 2. Mock Order Service PATCH /api/orders/:id/payment-status
        axios.patch.mockImplementation(async (url, body) => {
            if (url.includes(`/api/orders/${orderId}/payment-status`)) {
                orderState.paymentStatus = body.paymentStatus;
                if (body.paymentStatus === 'PAID') {
                    orderState.status = 'CONFIRMED';
                }
                return { data: { order: orderState } };
            }
            throw new Error(`Unexpected PATCH ${url}`);
        });

        // ─── STEP 1: CREATE PAYMENT ──────────────────────────────────────────
        const createRes = await request(app)
            .post(`/api/payments/create/${orderId}`)
            .set('Cookie', authCookie)
            .expect(201);

        expect(createRes.body.message).toBe('Payment initiated successfully');
        const { razorpayOrderId, payment: createdPayment } = createRes.body;
        expect(razorpayOrderId).toMatch(/^order_rzp_/);
        expect(createdPayment.status).toBe('CREATED');
        // 1499.50 * 100 = 149950 paise
        expect(createdPayment.price.amount).toBe(149950);

        // Verify Razorpay order creation called with paise
        expect(mockRazorpay.orders.create).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 149950,
                currency: 'INR',
                receipt: String(orderId),
            })
        );

        // Verify payment.initiated event published with standardized payload
        expect(publishToQueue).toHaveBeenCalledWith(
            'PAYMENT_NOTIFICATION.PAYMENT_INITIATED',
            expect.objectContaining({
                event: 'payment.initiated',
                version: 1,
                timestamp: expect.any(String),
                data: expect.objectContaining({
                    orderId,
                    amount: 1499.50,
                    currency: 'INR',
                }),
            })
        );

        // ─── STEP 2: VERIFY PAYMENT SIGNATURE ────────────────────────────────
        const razorpayPaymentId = 'pay_test_transaction_98765';
        const signature = computeSignature(razorpayOrderId, razorpayPaymentId);

        const verifyRes = await request(app)
            .post('/api/payments/verify')
            .set('Cookie', authCookie)
            .send({
                razorpayOrderId,
                paymentId: razorpayPaymentId,
                signature,
            })
            .expect(200);

        expect(verifyRes.body.message).toBe('Payment verified successfully');
        expect(verifyRes.body.payment.status).toBe('COMPLETED');
        expect(verifyRes.body.payment.paymentId).toBe(razorpayPaymentId);
        expect(verifyRes.body.payment.signature).toBe(signature);

        // ─── STEP 3: VERIFY ORDER PAYMENT STATUS SYNC ────────────────────────
        expect(axios.patch).toHaveBeenCalledWith(
            expect.stringContaining(`/api/orders/${orderId}/payment-status`),
            { paymentStatus: 'PAID' },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: expect.stringMatching(/^Bearer /),
                }),
            })
        );
        expect(orderState.paymentStatus).toBe('PAID');
        expect(orderState.status).toBe('CONFIRMED');

        // ─── STEP 4: VERIFY STANDARDIZED payment.completed EVENT ────────────
        expect(publishToQueue).toHaveBeenCalledWith(
            'PAYMENT_NOTIFICATION.PAYMENT_COMPLETED',
            expect.objectContaining({
                event: 'payment.completed',
                version: 1,
                timestamp: expect.any(String),
                data: expect.objectContaining({
                    orderId,
                    transactionId: razorpayPaymentId,
                    amount: 1499.50,
                    currency: 'INR',
                }),
            })
        );

        // ─── STEP 5: VERIFY IDEMPOTENCY ON REPEATED VERIFICATION ────────────
        const repeatRes = await request(app)
            .post('/api/payments/verify')
            .set('Cookie', authCookie)
            .send({
                razorpayOrderId,
                paymentId: razorpayPaymentId,
                signature,
            })
            .expect(200);

        expect(repeatRes.body.message).toBe('Payment already verified');
        expect(repeatRes.body.payment.status).toBe('COMPLETED');

        // Database record must still be COMPLETED and single record
        const count = await paymentModel.countDocuments({ razorpayOrderId });
        expect(count).toBe(1);
    });

    it('E2E FAILURE FLOW: Invalid Signature -> Payment FAILED -> payment.failed Event -> Order Remains UNPAID', async () => {
        const orderId = new mongoose.Types.ObjectId().toString();

        const orderState = {
            _id: orderId,
            user: userId,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            totalPrice: { amount: 800, currency: 'INR' },
        };

        axios.get.mockResolvedValueOnce({ data: { order: orderState } });

        // 1. Initiate Payment
        const createRes = await request(app)
            .post(`/api/payments/create/${orderId}`)
            .set('Cookie', authCookie)
            .expect(201);

        const { razorpayOrderId } = createRes.body;

        // 2. Tampered / invalid signature
        const invalidSignature = 'deadbeef'.repeat(8);

        const verifyRes = await request(app)
            .post('/api/payments/verify')
            .set('Cookie', authCookie)
            .send({
                razorpayOrderId,
                paymentId: 'pay_tampered_123',
                signature: invalidSignature,
            })
            .expect(400);

        expect(verifyRes.body.message).toBe('Invalid payment signature');

        // 3. Payment marked FAILED in DB
        const failedPayment = await paymentModel.findOne({ razorpayOrderId });
        expect(failedPayment.status).toBe('FAILED');
        expect(failedPayment.failureReason).toBe('Invalid payment signature');

        // 4. Order service sync was NOT called with PAID
        expect(axios.patch).not.toHaveBeenCalledWith(
            expect.any(String),
            { paymentStatus: 'PAID' },
            expect.any(Object)
        );
        expect(orderState.paymentStatus).toBe('UNPAID');

        // 5. payment.failed event published
        expect(publishToQueue).toHaveBeenCalledWith(
            'PAYMENT_NOTIFICATION.PAYMENT_FAILED',
            expect.objectContaining({
                event: 'payment.failed',
                version: 1,
                data: expect.objectContaining({
                    orderId,
                    reason: 'Invalid signature',
                }),
            })
        );
    });

    it('E2E FAILURE FLOW: Prevent duplicate payment for already PAID order', async () => {
        const orderId = new mongoose.Types.ObjectId().toString();

        axios.get.mockResolvedValueOnce({
            data: {
                order: {
                    _id: orderId,
                    user: userId,
                    status: 'CONFIRMED',
                    paymentStatus: 'PAID',
                    totalPrice: { amount: 1000, currency: 'INR' },
                },
            },
        });

        const res = await request(app)
            .post(`/api/payments/create/${orderId}`)
            .set('Cookie', authCookie)
            .expect(409);

        expect(res.body.message).toBe('Order is already paid');
        expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
    });
});
