require('./setup.js/env');
require('./setup.js/mongodb');
jest.setTimeout(30000);
jest.mock('axios');

// Mock RabbitMQ broker — non-fatal if unavailable
jest.mock('../src/brocker/brocker', () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publishToQueue: jest.fn().mockResolvedValue(undefined),
    subscribeToQueue: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../src/app');
const { getAuthCookie } = require('./setup.js/auth');
const axios = require('axios');


describe('POST /api/orders — Create order from current cart', () => {
    const sampleAddress = {
        street: '123 Main St',
        city: 'Metropolis',
        state: 'CA',
        pincode: '90210',
        country: 'USA',
    };
    const sampleProductId = '6a1593b4bbfe68f0eba8f71b';

    beforeEach(() => {
        axios.get.mockReset();
        axios.patch.mockReset();
        axios.delete.mockReset();

        // Mock: GET cart
        axios.get.mockImplementation((url) => {
            if (url.includes('/api/cards')) {
                return Promise.resolve({
                    data: {
                        cart: {
                            items: [
                                { productId: sampleProductId, quantity: 2 }
                            ]
                        }
                    }
                });
            }

            // Mock: GET product
            if (url.includes(`/api/products/${sampleProductId}`)) {
                return Promise.resolve({
                    data: {
                        product: {
                            _id: sampleProductId,
                            title: 'Test Product',
                            price: { amount: 1000, currency: 'INR' },
                            stock: 10
                        }
                    }
                });
            }

            return Promise.reject(new Error(`Unexpected GET url: ${url}`));
        });

        // Mock: PATCH stock decrement — success
        axios.patch.mockImplementation((url) => {
            if (url.includes('/stock')) {
                return Promise.resolve({ data: { product: { stock: 8 } } });
            }
            return Promise.reject(new Error(`Unexpected PATCH url: ${url}`));
        });

        // Mock: DELETE cart (clear after order)
        axios.delete.mockResolvedValue({ data: { message: 'Cart cleared' } });
    });

    it('creates order from current cart, computes totals, sets status=PENDING, reserves inventory', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Cookie', getAuthCookie())
            .send({ shippingAddress: sampleAddress })
            .expect('Content-Type', /json/)
            .expect(201);

        expect(res.body).toBeDefined();
        expect(res.body.order).toBeDefined();
        const { order } = res.body;
        expect(order._id).toBeDefined();
        expect(order.user).toBeDefined();
        expect(order.status).toBe('PENDING');

        expect(Array.isArray(order.items)).toBe(true);
        expect(order.items.length).toBeGreaterThan(0);
        for (const it of order.items) {
            expect(it.product).toBeDefined();
            expect(it.quantity).toBeGreaterThan(0);
            expect(it.price).toBeDefined();
            expect(typeof it.price.amount).toBe('number');
            expect(['USD', 'INR']).toContain(it.price.currency);
        }

        expect(order.totalPrice).toBeDefined();
        expect(typeof order.totalPrice.amount).toBe('number');
        // 2 qty * 1000 price = 2000
        expect(order.totalPrice.amount).toBe(2000);
        expect(['USD', 'INR']).toContain(order.totalPrice.currency);

        expect(order.shippingAddress).toMatchObject({
            street: sampleAddress.street,
            city: sampleAddress.city,
            state: sampleAddress.state,
            zip: sampleAddress.pincode,
            country: sampleAddress.country,
        });

        // Stock decrement should have been called
        expect(axios.patch).toHaveBeenCalledWith(
            expect.stringContaining(`/api/products/${sampleProductId}/stock`),
            expect.objectContaining({ action: 'decrement', quantity: 2 }),
            expect.any(Object)
        );

        // Cart should have been cleared
        expect(axios.delete).toHaveBeenCalledWith(
            expect.stringContaining('/api/cards'),
            expect.any(Object)
        );
    });

    it('returns 422 when cart is empty', async () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('/api/cards')) {
                return Promise.resolve({ data: { cart: { items: [] } } });
            }
            return Promise.reject(new Error(`Unexpected GET url: ${url}`));
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Cookie', getAuthCookie())
            .send({ shippingAddress: sampleAddress })
            .expect('Content-Type', /json/)
            .expect(422);

        expect(res.body.message).toMatch(/empty/i);
    });

    it('returns 400 when shipping address is missing/invalid', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Cookie', getAuthCookie())
            .send({})
            .expect('Content-Type', /json/)
            .expect(400);

        expect(res.body.errors || res.body.message).toBeDefined();
    });

    it('returns 409 and rolls back when stock insufficient during reservation', async () => {
        // Two items — first succeeds, second fails with 409
        const productId1 = '507f1f77bcf86cd799439011';
        const productId2 = '507f1f77bcf86cd799439012';

        axios.get.mockImplementation((url) => {
            if (url.includes('/api/cards')) {
                return Promise.resolve({
                    data: {
                        cart: {
                            items: [
                                { productId: productId1, quantity: 1 },
                                { productId: productId2, quantity: 5 },
                            ]
                        }
                    }
                });
            }
            if (url.includes(productId1)) {
                return Promise.resolve({ data: { product: { _id: productId1, title: 'P1', price: { amount: 100, currency: 'INR' }, stock: 10 } } });
            }
            if (url.includes(productId2)) {
                return Promise.resolve({ data: { product: { _id: productId2, title: 'P2', price: { amount: 200, currency: 'INR' }, stock: 10 } } });
            }
            return Promise.reject(new Error(`Unexpected url: ${url}`));
        });

        let patchCount = 0;
        axios.patch.mockImplementation((url, body) => {
            if (url.includes('/stock')) {
                patchCount++;
                if (patchCount === 1) {
                    // First product succeeds
                    return Promise.resolve({ data: { product: { stock: 9 } } });
                }
                // Second product fails with 409
                const err = new Error('Request failed with status code 409');
                err.response = { status: 409, data: { message: 'Insufficient stock', available: 2 } };
                return Promise.reject(err);
            }
            return Promise.reject(new Error(`Unexpected PATCH: ${url}`));
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Cookie', getAuthCookie())
            .send({ shippingAddress: sampleAddress })
            .expect(409);

        expect(res.body.message).toMatch(/insufficient stock/i);
        // Rollback: increment should have been called for the first product
        const incrementCalls = axios.patch.mock.calls.filter(
            ([, body]) => body?.action === 'increment'
        );
        expect(incrementCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 401 when not authenticated', async () => {
        const res = await request(app)
            .post('/api/orders')
            .send({ shippingAddress: sampleAddress })
            .expect(401);
        expect(res.body.message).toMatch(/unauthorized/i);
    });
});