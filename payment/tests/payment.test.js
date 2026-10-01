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

describe('Payment Service', () => {
    const userId = '69bf6df8726177827fc33f62';
    const otherUserId = '69bf6df8726177827fc33f63';
    const authCookie = getAuthCookie({ userId, role: 'user' });
    const otherAuthCookie = getAuthCookie({ userId: otherUserId, role: 'user' });
    const adminCookie = getAuthCookie({ userId: '69bf6df8726177827fc33f99', role: 'admin' });

    let mockRazorpay;

    beforeEach(() => {
        jest.clearAllMocks();

        mockRazorpay = {
            orders: {
                create: jest.fn().mockResolvedValue({
                    id: 'order_rzp_12345',
                    entity: 'order',
                    amount: 50000,
                    currency: 'INR',
                    receipt: 'receipt_1',
                    status: 'created',
                }),
            },
            payments: {
                refund: jest.fn().mockResolvedValue({
                    id: 'rfnd_rzp_99999',
                    entity: 'refund',
                    amount: 50000,
                    currency: 'INR',
                    status: 'processed',
                }),
            },
        };

        setRazorpayClient(mockRazorpay);
    });

    afterAll(() => {
        setRazorpayClient(null);
    });

    describe('POST /api/payments/create/:orderId', () => {
        it('should successfully create a Razorpay payment for a pending order', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();

            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        user: userId,
                        status: 'PENDING',
                        paymentStatus: 'UNPAID',
                        totalPrice: {
                            amount: 500, // 500 INR
                            currency: 'INR',
                        },
                    },
                },
            });

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Payment initiated successfully');
            expect(res.body.razorpayOrderId).toBe('order_rzp_12345');
            expect(res.body.payment).toBeDefined();
            expect(res.body.payment.status).toBe('CREATED');
            // Stored amount in paise: 500 * 100 = 50000
            expect(res.body.payment.price.amount).toBe(50000);

            // Razorpay order called with paise
            expect(mockRazorpay.orders.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: 50000,
                    currency: 'INR',
                    receipt: String(orderId),
                })
            );

            // Verify event published with standardized payload
            expect(publishToQueue).toHaveBeenCalledWith(
                'PAYMENT_NOTIFICATION.PAYMENT_INITIATED',
                expect.objectContaining({
                    event: 'payment.initiated',
                    version: 1,
                    timestamp: expect.any(String),
                    data: expect.objectContaining({
                        orderId,
                        amount: 500,
                        currency: 'INR',
                    }),
                })
            );
        });

        it('should return existing payment if payment is already CREATED (idempotent)', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();

            // First create one
            await paymentModel.create({
                order: orderId,
                razorpayOrderId: 'order_rzp_existing',
                user: userId,
                status: 'CREATED',
                price: { amount: 50000, currency: 'INR' },
            });

            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        user: userId,
                        status: 'PENDING',
                        paymentStatus: 'UNPAID',
                        totalPrice: { amount: 500, currency: 'INR' },
                    },
                },
            });

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Payment already initiated');
            expect(res.body.razorpayOrderId).toBe('order_rzp_existing');
            expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
        });

        it('should return 400 for invalid orderId format', async () => {
            const res = await request(app)
                .post('/api/payments/create/invalid-id')
                .set('Cookie', authCookie);

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Invalid order ID');
        });

        it('should return 404 if order does not exist in order service', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();
            axios.get.mockRejectedValueOnce({
                response: { status: 404 },
            });

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Order not found');
        });

        it('should return 409 if order is already paid', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();
            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        user: userId,
                        status: 'CONFIRMED',
                        paymentStatus: 'PAID',
                        totalPrice: { amount: 500, currency: 'INR' },
                    },
                },
            });

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(409);
            expect(res.body.message).toBe('Order is already paid');
        });

        it('should return 409 if order status is CANCELLED', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();
            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        user: userId,
                        status: 'CANCELLED',
                        paymentStatus: 'UNPAID',
                        totalPrice: { amount: 500, currency: 'INR' },
                    },
                },
            });

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('Cannot create payment: order status is CANCELLED');
        });

        it('should return 422 if order total amount is missing or invalid', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();
            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        user: userId,
                        status: 'PENDING',
                        paymentStatus: 'UNPAID',
                        totalPrice: null,
                    },
                },
            });

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(422);
            expect(res.body.message).toBe('Invalid order total');
        });

        it('should return 502 if Razorpay order creation fails', async () => {
            const orderId = new mongoose.Types.ObjectId().toString();
            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        user: userId,
                        status: 'PENDING',
                        paymentStatus: 'UNPAID',
                        totalPrice: { amount: 500, currency: 'INR' },
                    },
                },
            });

            mockRazorpay.orders.create.mockRejectedValueOnce(new Error('Gateway timeout'));

            const res = await request(app)
                .post(`/api/payments/create/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(502);
            expect(res.body.message).toBe('Payment gateway error');
        });
    });

    describe('POST /api/payments/verify', () => {
        const secret = process.env.RAZORPAY_KEY_SECRET || 'test_razorpay_secret';

        function computeSignature(orderId, paymentId) {
            return crypto
                .createHmac('sha256', secret)
                .update(`${orderId}|${paymentId}`)
                .digest('hex');
        }

        it('should successfully verify payment with valid HMAC signature and update order status', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const rzpOrderId = 'order_rzp_valid';
            const rzpPaymentId = 'pay_rzp_valid_999';

            await paymentModel.create({
                order: orderId,
                razorpayOrderId: rzpOrderId,
                user: userId,
                status: 'CREATED',
                price: { amount: 50000, currency: 'INR' },
            });

            const signature = computeSignature(rzpOrderId, rzpPaymentId);

            axios.patch.mockResolvedValueOnce({ data: { message: 'Updated' } });

            const res = await request(app)
                .post('/api/payments/verify')
                .set('Cookie', authCookie)
                .send({
                    razorpayOrderId: rzpOrderId,
                    paymentId: rzpPaymentId,
                    signature,
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Payment verified successfully');
            expect(res.body.payment.status).toBe('COMPLETED');
            expect(res.body.payment.paymentId).toBe(rzpPaymentId);
            expect(res.body.payment.signature).toBe(signature);

            // Check Order payment status sync call
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining(`/api/orders/${orderId}/payment-status`),
                { paymentStatus: 'PAID' },
                expect.any(Object)
            );

            // Check standardized payment.completed event published
            expect(publishToQueue).toHaveBeenCalledWith(
                'PAYMENT_NOTIFICATION.PAYMENT_COMPLETED',
                expect.objectContaining({
                    event: 'payment.completed',
                    version: 1,
                    timestamp: expect.any(String),
                    data: expect.objectContaining({
                        orderId: String(orderId),
                        transactionId: rzpPaymentId,
                        amount: 500,
                        currency: 'INR',
                    }),
                })
            );
        });

        it('should fail verification and mark payment FAILED when signature is invalid', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const rzpOrderId = 'order_rzp_invalid_sig';
            const rzpPaymentId = 'pay_rzp_invalid_999';

            await paymentModel.create({
                order: orderId,
                razorpayOrderId: rzpOrderId,
                user: userId,
                status: 'CREATED',
                price: { amount: 50000, currency: 'INR' },
            });

            const fakeSignature = 'a'.repeat(64); // 64-hex char invalid signature

            const res = await request(app)
                .post('/api/payments/verify')
                .set('Cookie', authCookie)
                .send({
                    razorpayOrderId: rzpOrderId,
                    paymentId: rzpPaymentId,
                    signature: fakeSignature,
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Invalid payment signature');

            // Verify payment record in DB is FAILED
            const updated = await paymentModel.findOne({ razorpayOrderId: rzpOrderId });
            expect(updated.status).toBe('FAILED');
            expect(updated.failureReason).toBe('Invalid payment signature');

            // Verify payment.failed event published
            expect(publishToQueue).toHaveBeenCalledWith(
                'PAYMENT_NOTIFICATION.PAYMENT_FAILED',
                expect.objectContaining({
                    event: 'payment.failed',
                    version: 1,
                    data: expect.objectContaining({
                        orderId: String(orderId),
                        reason: 'Invalid signature',
                    }),
                })
            );
        });

        it('should handle duplicate verification idempotently for already COMPLETED payment', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const rzpOrderId = 'order_rzp_dup';
            const rzpPaymentId = 'pay_rzp_dup_123';
            const signature = computeSignature(rzpOrderId, rzpPaymentId);

            await paymentModel.create({
                order: orderId,
                razorpayOrderId: rzpOrderId,
                paymentId: rzpPaymentId,
                signature,
                user: userId,
                status: 'COMPLETED',
                price: { amount: 50000, currency: 'INR' },
            });

            const res = await request(app)
                .post('/api/payments/verify')
                .set('Cookie', authCookie)
                .send({
                    razorpayOrderId: rzpOrderId,
                    paymentId: rzpPaymentId,
                    signature,
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Payment already verified');
            expect(res.body.payment.status).toBe('COMPLETED');
        });

        it('should return 409 when verifying already FAILED payment', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const rzpOrderId = 'order_rzp_failed_already';

            await paymentModel.create({
                order: orderId,
                razorpayOrderId: rzpOrderId,
                user: userId,
                status: 'FAILED',
                failureReason: 'Invalid payment signature',
                price: { amount: 50000, currency: 'INR' },
            });

            const res = await request(app)
                .post('/api/payments/verify')
                .set('Cookie', authCookie)
                .send({
                    razorpayOrderId: rzpOrderId,
                    paymentId: 'pay_xyz',
                    signature: 'sig_xyz',
                });

            expect(res.status).toBe(409);
            expect(res.body.message).toBe('Payment previously failed');
        });

        it('should return 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/payments/verify')
                .set('Cookie', authCookie)
                .send({
                    razorpayOrderId: 'order_123',
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('required');
        });

        it('should return 404 for unknown razorpayOrderId', async () => {
            const res = await request(app)
                .post('/api/payments/verify')
                .set('Cookie', authCookie)
                .send({
                    razorpayOrderId: 'order_nonexistent',
                    paymentId: 'pay_nonexistent',
                    signature: 'sig_nonexistent',
                });

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/payments/refund/:paymentId', () => {
        it('should successfully refund a COMPLETED payment and publish payment.refunded', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const payment = await paymentModel.create({
                order: orderId,
                razorpayOrderId: 'order_rzp_refund',
                paymentId: 'pay_rzp_refund_123',
                signature: 'sig_refund',
                user: userId,
                status: 'COMPLETED',
                price: { amount: 50000, currency: 'INR' },
            });

            axios.patch.mockResolvedValueOnce({ data: { message: 'Updated' } });

            const res = await request(app)
                .post(`/api/payments/refund/${payment._id}`)
                .set('Cookie', authCookie)
                .send({ amount: 500, reason: 'Defective product' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Payment refunded successfully');
            expect(res.body.payment.status).toBe('REFUNDED');
            expect(res.body.payment.refundId).toBe('rfnd_rzp_99999');

            // Verify order sync
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining(`/api/orders/${orderId}/payment-status`),
                { paymentStatus: 'REFUNDED' },
                expect.any(Object)
            );

            // Verify standardized payment.refunded event published
            expect(publishToQueue).toHaveBeenCalledWith(
                'PAYMENT_NOTIFICATION.PAYMENT_REFUNDED',
                expect.objectContaining({
                    event: 'payment.refunded',
                    version: 1,
                    data: expect.objectContaining({
                        orderId: String(orderId),
                        paymentId: String(payment._id),
                        refundId: 'rfnd_rzp_99999',
                        amount: 500,
                    }),
                })
            );
        });

        it('should reject refund if payment is in CREATED status (invalid state transition)', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const payment = await paymentModel.create({
                order: orderId,
                razorpayOrderId: 'order_rzp_pending_refund',
                user: userId,
                status: 'CREATED',
                price: { amount: 50000, currency: 'INR' },
            });

            const res = await request(app)
                .post(`/api/payments/refund/${payment._id}`)
                .set('Cookie', authCookie)
                .send({ reason: 'Customer changed mind' });

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('Cannot refund payment with status CREATED');
        });

        it('should return 403 if another user tries to refund a payment', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const payment = await paymentModel.create({
                order: orderId,
                razorpayOrderId: 'order_rzp_other_user',
                paymentId: 'pay_other',
                signature: 'sig_other',
                user: userId,
                status: 'COMPLETED',
                price: { amount: 50000, currency: 'INR' },
            });

            const res = await request(app)
                .post(`/api/payments/refund/${payment._id}`)
                .set('Cookie', otherAuthCookie);

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Forbidden');
        });
    });

    describe('GET /api/payments/:paymentId and /order/:orderId', () => {
        it('should return payment by paymentId for owner or admin', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const payment = await paymentModel.create({
                order: orderId,
                razorpayOrderId: 'order_rzp_lookup',
                user: userId,
                status: 'CREATED',
                price: { amount: 30000, currency: 'INR' },
            });

            const res = await request(app)
                .get(`/api/payments/${payment._id}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.payment._id).toBe(String(payment._id));

            // Admin can also view
            const adminRes = await request(app)
                .get(`/api/payments/${payment._id}`)
                .set('Cookie', adminCookie);

            expect(adminRes.status).toBe(200);

            // Other user cannot view
            const otherRes = await request(app)
                .get(`/api/payments/${payment._id}`)
                .set('Cookie', otherAuthCookie);

            expect(otherRes.status).toBe(403);
        });

        it('should return payment by orderId for owner', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const payment = await paymentModel.create({
                order: orderId,
                razorpayOrderId: 'order_rzp_by_order',
                user: userId,
                status: 'COMPLETED',
                price: { amount: 45000, currency: 'INR' },
            });

            const res = await request(app)
                .get(`/api/payments/order/${orderId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.payment._id).toBe(String(payment._id));
        });
    });
});
