require('./setup.js/env');
require('./setup.js/mongodb');
jest.mock('../src/brocker/brocker', () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publishToQueue: jest.fn().mockResolvedValue(undefined),
    subscribeToQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
}));
const request = require('supertest');
const app = require('../src/app');
const { getAuthCookie } = require('./setup.js/auth');
const orderModel = require('../src/models/order.model');

describe('PATCH /api/orders/:id/payment-status — Payment sync endpoint', () => {
    const orderId = '507f1f77bcf86cd799439012';
    const ownerId = '68bc6369c17579622cbdd9fe';

    beforeEach(async () => {
        await orderModel.deleteMany({});
    });

    it('updates paymentStatus to PAID and transitions status from PENDING to CONFIRMED', async () => {
        const order = new orderModel({
            _id: orderId,
            user: ownerId,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            items: [
                {
                    product: '507f1f77bcf86cd799439021',
                    quantity: 1,
                    price: { amount: 100, currency: 'INR' },
                },
            ],
            totalPrice: { amount: 100, currency: 'INR' },
            shippingAddress: {
                street: '123 Main St',
                city: 'Metropolis',
                state: 'CA',
                zip: '90210',
                country: 'USA',
            },
        });
        await order.save();

        const res = await request(app)
            .patch(`/api/orders/${orderId}/payment-status`)
            .set('Cookie', getAuthCookie({ userId: ownerId }))
            .send({ paymentStatus: 'PAID' })
            .expect(200);

        expect(res.body.order.paymentStatus).toBe('PAID');
        expect(res.body.order.status).toBe('CONFIRMED');

        const dbOrder = await orderModel.findById(orderId);
        expect(dbOrder.paymentStatus).toBe('PAID');
        expect(dbOrder.status).toBe('CONFIRMED');
    });

    it('updates paymentStatus to REFUNDED', async () => {
        const order = new orderModel({
            _id: orderId,
            user: ownerId,
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            items: [
                {
                    product: '507f1f77bcf86cd799439021',
                    quantity: 1,
                    price: { amount: 100, currency: 'INR' },
                },
            ],
            totalPrice: { amount: 100, currency: 'INR' },
            shippingAddress: {
                street: '123 Main St',
                city: 'Metropolis',
                state: 'CA',
                zip: '90210',
                country: 'USA',
            },
        });
        await order.save();

        const res = await request(app)
            .patch(`/api/orders/${orderId}/payment-status`)
            .set('Cookie', getAuthCookie({ userId: ownerId }))
            .send({ paymentStatus: 'REFUNDED' })
            .expect(200);

        expect(res.body.order.paymentStatus).toBe('REFUNDED');
    });

    it('returns 400 for invalid paymentStatus', async () => {
        const res = await request(app)
            .patch(`/api/orders/${orderId}/payment-status`)
            .set('Cookie', getAuthCookie({ userId: ownerId }))
            .send({ paymentStatus: 'INVALID_STATUS' })
            .expect(400);

        expect(res.body.message).toContain('Invalid paymentStatus');
    });

    it('returns 404 for nonexistent order', async () => {
        const nonExistentId = '507f1f77bcf86cd799439099';
        const res = await request(app)
            .patch(`/api/orders/${nonExistentId}/payment-status`)
            .set('Cookie', getAuthCookie({ userId: ownerId }))
            .send({ paymentStatus: 'PAID' })
            .expect(404);

        expect(res.body.message).toBe('Order not found');
    });
});
