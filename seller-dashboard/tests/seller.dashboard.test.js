require('./setup/env');
require('./setup/mongodb');

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const userModel = require('../src/models/user.model');
const productModel = require('../src/models/product.model');
const orderModel = require('../src/models/order.model');
const paymentModel = require('../src/models/payment.model');
const { getAuthCookie } = require('./setup/auth');
const listenForEvents = require('../src/broker/listener');

// Mock broker
const mockQueueHandlers = new Map();
jest.mock('../src/broker/broker', () => ({
    connect: jest.fn().mockResolvedValue(true),
    publishToQueue: jest.fn().mockResolvedValue(true),
    subscribeToQueue: jest.fn().mockImplementation((queueName, callback) => {
        mockQueueHandlers.set(queueName, callback);
    }),
}));

// Mock axios for Product Service calls
jest.mock('axios');
const axios = require('axios');

describe('Seller Dashboard Backend', () => {
    const sellerId = '60bf6df8726177827fc33f77';
    const otherSellerId = '60bf6df8726177827fc33f88';
    const buyerId = '60bf6df8726177827fc33f99';

    const sellerCookie = getAuthCookie({ userId: sellerId, role: 'seller' });
    const otherSellerCookie = getAuthCookie({ userId: otherSellerId, role: 'seller' });
    const buyerCookie = getAuthCookie({ userId: buyerId, role: 'user' });
    const adminCookie = getAuthCookie({ userId: '60bf6df8726177827fc33f00', role: 'admin' });

    beforeEach(async () => {
        jest.clearAllMocks();
        mockQueueHandlers.clear();
        await listenForEvents();
    });

    describe('Authentication & Authorization', () => {
        it('should return 401 when no token is provided', async () => {
            const res = await request(app).get('/api/seller/dashboard/metrics');
            expect(res.status).toBe(401);
            expect(res.body.message).toContain('No token provided');
        });

        it('should return 403 when buyer (role: user) attempts access', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/metrics')
                .set('Cookie', buyerCookie);
            expect(res.status).toBe(403);
            expect(res.body.message).toContain('Insufficient permissions');
        });

        it('should return 200 when authenticated seller accesses metrics', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/metrics')
                .set('Cookie', sellerCookie);
            expect(res.status).toBe(200);
            expect(res.body.products).toBeDefined();
            expect(res.body.orders).toBeDefined();
        });
    });

    describe('Product Management', () => {
        let sellerProduct;
        let otherProduct;

        beforeEach(async () => {
            sellerProduct = await productModel.create({
                title: 'Seller Product 1',
                description: 'Good product',
                category: 'Electronics',
                price: { amount: 1200, currency: 'INR' },
                seller: sellerId,
                stock: 15,
                isActive: true,
            });

            otherProduct = await productModel.create({
                title: 'Other Seller Product',
                price: { amount: 2500, currency: 'INR' },
                seller: otherSellerId,
                stock: 20,
                isActive: true,
            });
        });

        it('GET /products should only return products belonging to the calling seller', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/products')
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(1);
            expect(res.body[0]._id).toBe(String(sellerProduct._id));
        });

        it('GET /products/:id should return product for owner', async () => {
            const res = await request(app)
                .get(`/api/seller/dashboard/products/${sellerProduct._id}`)
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Seller Product 1');
        });

        it('GET /products/:id should reject access to another seller product with 403', async () => {
            const res = await request(app)
                .get(`/api/seller/dashboard/products/${otherProduct._id}`)
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('do not own this product');
        });

        it('POST /products should proxy creation to Product service and sync read model', async () => {
            const newProdId = new mongoose.Types.ObjectId().toString();
            axios.post.mockResolvedValueOnce({
                data: {
                    product: {
                        _id: newProdId,
                        title: 'Newly Created Monitor',
                        price: { amount: 8000, currency: 'INR' },
                        seller: sellerId,
                        stock: 5,
                    },
                },
            });

            const res = await request(app)
                .post('/api/seller/dashboard/products')
                .set('Cookie', sellerCookie)
                .send({
                    title: 'Newly Created Monitor',
                    priceAmount: 8000,
                    stock: 5,
                });

            expect(res.status).toBe(201);
            expect(res.body.product.title).toBe('Newly Created Monitor');

            // Verify replicated in local read model
            const inDb = await productModel.findById(newProdId);
            expect(inDb).toBeDefined();
            expect(inDb.title).toBe('Newly Created Monitor');
        });

        it('PATCH /products/:id should update product for owner and block another seller', async () => {
            // Block other seller
            const forbiddenRes = await request(app)
                .patch(`/api/seller/dashboard/products/${sellerProduct._id}`)
                .set('Cookie', otherSellerCookie)
                .send({ title: 'Hacked Title' });

            expect(forbiddenRes.status).toBe(403);

            // Allow owner
            axios.patch.mockResolvedValueOnce({
                data: {
                    product: {
                        _id: String(sellerProduct._id),
                        title: 'Updated Monitor Title',
                        price: { amount: 1500, currency: 'INR' },
                        seller: sellerId,
                        stock: 15,
                    },
                },
            });

            const successRes = await request(app)
                .patch(`/api/seller/dashboard/products/${sellerProduct._id}`)
                .set('Cookie', sellerCookie)
                .send({ title: 'Updated Monitor Title' });

            expect(successRes.status).toBe(200);
            expect(successRes.body.product.title).toBe('Updated Monitor Title');
        });

        it('DELETE /products/:id should delete product for owner and block another seller', async () => {
            const forbiddenRes = await request(app)
                .delete(`/api/seller/dashboard/products/${sellerProduct._id}`)
                .set('Cookie', otherSellerCookie);

            expect(forbiddenRes.status).toBe(403);

            axios.delete.mockResolvedValueOnce({ data: { message: 'Deleted' } });

            const successRes = await request(app)
                .delete(`/api/seller/dashboard/products/${sellerProduct._id}`)
                .set('Cookie', sellerCookie);

            expect(successRes.status).toBe(200);

            const deleted = await productModel.findById(sellerProduct._id);
            expect(deleted).toBeNull();
        });
    });

    describe('Inventory Management', () => {
        beforeEach(async () => {
            await productModel.create([
                {
                    title: 'Normal Stock Item',
                    price: { amount: 100, currency: 'INR' },
                    seller: sellerId,
                    stock: 25,
                },
                {
                    title: 'Low Stock Item',
                    price: { amount: 200, currency: 'INR' },
                    seller: sellerId,
                    stock: 2, // low stock!
                },
                {
                    title: 'Other Seller Item',
                    price: { amount: 300, currency: 'INR' },
                    seller: otherSellerId,
                    stock: 1,
                },
            ]);
        });

        it('GET /inventory should return inventory summary and low-stock items', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/inventory')
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);
            expect(res.body.summary.totalProducts).toBe(2);
            expect(res.body.summary.totalStock).toBe(27);
            expect(res.body.summary.lowStockCount).toBe(1);

            const lowStockItem = res.body.items.find(i => i.isLowStock);
            expect(lowStockItem.title).toBe('Low Stock Item');
        });

        it('GET /inventory?lowStock=true should filter only low stock items', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/inventory?lowStock=true')
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);
            expect(res.body.items.length).toBe(1);
            expect(res.body.items[0].title).toBe('Low Stock Item');
        });

        it('PATCH /inventory/:id should update stock via product service', async () => {
            const prod = await productModel.findOne({ seller: sellerId, stock: 2 });

            axios.patch.mockResolvedValueOnce({
                data: { stock: 50 },
            });

            const res = await request(app)
                .patch(`/api/seller/dashboard/inventory/${prod._id}`)
                .set('Cookie', sellerCookie)
                .send({ stock: 50 });

            expect(res.status).toBe(200);
            expect(res.body.stock).toBe(50);

            const updated = await productModel.findById(prod._id);
            expect(updated.stock).toBe(50);
        });
    });

    describe('Dashboard Metrics & Authoritative Data', () => {
        let p1, p2, otherP, o1;

        beforeEach(async () => {
            p1 = await productModel.create({
                title: 'Mechanical Keyboard',
                price: { amount: 3000, currency: 'INR' },
                seller: sellerId,
                stock: 10,
                isActive: true,
            });

            p2 = await productModel.create({
                title: 'Gaming Mouse',
                price: { amount: 1500, currency: 'INR' },
                seller: sellerId,
                stock: 3, // low stock
                isActive: true,
            });

            otherP = await productModel.create({
                title: 'Laptop Stand',
                price: { amount: 1000, currency: 'INR' },
                seller: otherSellerId,
                stock: 20,
                isActive: true,
            });

            // Order 1: CONFIRMED - Contains 2 of p1 and 1 of otherP (multi-vendor)
            o1 = await orderModel.create({
                user: buyerId,
                status: 'CONFIRMED',
                paymentStatus: 'PAID',
                items: [
                    { product: p1._id, quantity: 2, price: { amount: 3000, currency: 'INR' } },
                    { product: otherP._id, quantity: 1, price: { amount: 1000, currency: 'INR' } },
                ],
                totalPrice: { amount: 7000, currency: 'INR' },
            });

            // Order 2: DELIVERED - Contains 1 of p2
            const o2 = await orderModel.create({
                user: buyerId,
                status: 'DELIVERED',
                paymentStatus: 'PAID',
                items: [
                    { product: p2._id, quantity: 1, price: { amount: 1500, currency: 'INR' } },
                ],
                totalPrice: { amount: 1500, currency: 'INR' },
            });

            // Order 3: CANCELLED - Should not count towards revenue/sales
            await orderModel.create({
                user: buyerId,
                status: 'CANCELLED',
                paymentStatus: 'UNPAID',
                items: [
                    { product: p1._id, quantity: 5, price: { amount: 3000, currency: 'INR' } },
                ],
                totalPrice: { amount: 15000, currency: 'INR' },
            });

            // Order 4: Solely belongs to otherSeller - must not affect current seller
            await orderModel.create({
                user: buyerId,
                status: 'CONFIRMED',
                paymentStatus: 'PAID',
                items: [
                    { product: otherP._id, quantity: 10, price: { amount: 1000, currency: 'INR' } },
                ],
                totalPrice: { amount: 10000, currency: 'INR' },
            });

            // Payment records
            await paymentModel.create([
                {
                    order: o1._id,
                    razorpayOrderId: 'rzp_order_1',
                    status: 'COMPLETED',
                    user: buyerId,
                    price: { amount: 7000, currency: 'INR' },
                },
                {
                    order: o2._id,
                    razorpayOrderId: 'rzp_order_2',
                    status: 'COMPLETED',
                    user: buyerId,
                    price: { amount: 1500, currency: 'INR' },
                },
            ]);
        });

        it('should accurately calculate seller sales and revenue excluding other sellers items', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/metrics')
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);

            // Seller sales: 2 of p1 + 1 of p2 = 3 units
            expect(res.body.sales).toBe(3);

            // Seller revenue: (2 * 3000) + (1 * 1500) = 6000 + 1500 = 7500 INR
            // Note: otherP's 1000 INR was excluded!
            expect(res.body.revenue).toBe(7500);

            // Orders count breakdown
            expect(res.body.orders.total).toBe(3); // o1, o2, o3 (o4 excluded!)
            expect(res.body.orders.confirmed).toBe(1);
            expect(res.body.orders.delivered).toBe(1);
            expect(res.body.orders.cancelled).toBe(1);

            // Product counts
            expect(res.body.products.total).toBe(2);
            expect(res.body.products.lowStockCount).toBe(1);
            expect(res.body.products.totalInventoryUnits).toBe(13); // 10 + 3

            // Top products
            expect(res.body.topProducts[0].title).toBe('Mechanical Keyboard');
            expect(res.body.topProducts[0].sold).toBe(2);
        });

        it('GET /orders should return only seller relevant orders and strip other seller items', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/orders')
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            // o4 must NOT be present
            expect(res.body.length).toBe(3);

            // Check multi-vendor order o1: otherP item must be filtered out!
            const o1Result = res.body.find(o => o._id.toString() === String(o1._id));
            expect(o1Result).toBeDefined();
            expect(o1Result.items.length).toBe(1);
            expect(o1Result.items[0].product.toString()).toBe(String(p1._id));
            expect(o1Result.sellerSubtotal.amount).toBe(6000);
        });

        it('GET /orders?status=DELIVERED should filter by status', async () => {
            const res = await request(app)
                .get('/api/seller/dashboard/orders?status=DELIVERED')
                .set('Cookie', sellerCookie);

            expect(res.status).toBe(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].status).toBe('DELIVERED');
        });
    });

    describe('RabbitMQ Event Synchronization (Read-Model Replicas)', () => {
        it('should sync product created event into read model', async () => {
            const handler = mockQueueHandlers.get('product.created');
            expect(handler).toBeDefined();

            const pId = new mongoose.Types.ObjectId();
            await handler({
                _id: pId,
                title: 'Event Synced Product',
                price: { amount: 999, currency: 'INR' },
                seller: sellerId,
                stock: 40,
            });

            const synced = await productModel.findById(pId);
            expect(synced).toBeDefined();
            expect(synced.title).toBe('Event Synced Product');
            expect(synced.stock).toBe(40);
        });

        it('should sync inventory.updated event', async () => {
            const prod = await productModel.create({
                title: 'Stock Item',
                price: { amount: 50, currency: 'INR' },
                seller: sellerId,
                stock: 10,
            });

            const handler = mockQueueHandlers.get('inventory.updated');
            await handler({
                productId: prod._id,
                newStock: 85,
            });

            const updated = await productModel.findById(prod._id);
            expect(updated.stock).toBe(85);
        });

        it('should sync order.status_updated event', async () => {
            const order = await orderModel.create({
                user: buyerId,
                status: 'PENDING',
                items: [],
                totalPrice: { amount: 500, currency: 'INR' },
            });

            const handler = mockQueueHandlers.get('order.status_updated');
            await handler({
                orderId: order._id,
                newStatus: 'SHIPPED',
            });

            const updated = await orderModel.findById(order._id);
            expect(updated.status).toBe('SHIPPED');
        });

        it('should sync payment.completed event', async () => {
            const order = await orderModel.create({
                user: buyerId,
                status: 'PENDING',
                paymentStatus: 'UNPAID',
                items: [],
                totalPrice: { amount: 1000, currency: 'INR' },
            });

            const handler = mockQueueHandlers.get('payment.completed');
            await handler({
                orderId: order._id,
                transactionId: 'tx_pay_999',
                status: 'COMPLETED',
            });

            const updatedOrder = await orderModel.findById(order._id);
            expect(updatedOrder.paymentStatus).toBe('PAID');
            expect(updatedOrder.status).toBe('CONFIRMED');

            const syncedPayment = await paymentModel.findOne({ order: order._id });
            expect(syncedPayment).toBeDefined();
            expect(syncedPayment.status).toBe('COMPLETED');
        });

        it('should handle malformed event payloads without crashing', async () => {
            const handler = mockQueueHandlers.get('product.created');
            await expect(handler(null)).resolves.not.toThrow();
            await expect(handler(undefined)).resolves.not.toThrow();
            await expect(handler({})).resolves.not.toThrow();
        });
    });
});
