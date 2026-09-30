const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock imagekit service to avoid ESM uuid import during tests
jest.mock('../services/imagekit.service', () => ({
    uploadImage: jest.fn(async () => ({
        url: 'https://ik.mock/x',
        thumbnail: 'https://ik.mock/t',
        id: 'file_x',
    })),
}));

// Mock broker to avoid RabbitMQ connection
jest.mock('../src/broker/broker', () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publishToQueue: jest.fn().mockResolvedValue(undefined),
    subscribeToQueue: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../src/app');
const Product = require('../src/models/product.model');

describe('Product Service - Comprehensive Tests', () => {
    let mongo;
    let sellerId1;
    let sellerId2;

    const signToken = (id, role = 'seller') =>
        jwt.sign({ id, role }, process.env.JWT_SECRET || 'testsecret');

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        const uri = mongo.getUri();
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
        await mongoose.connect(uri);
        await Product.syncIndexes();

        sellerId1 = new mongoose.Types.ObjectId();
        sellerId2 = new mongoose.Types.ObjectId();
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongo.stop();
    });

    afterEach(async () => {
        const collections = await mongoose.connection.db.collections();
        for (const c of collections) await c.deleteMany({});
    });

    const createProduct = (overrides = {}) => {
        return Product.create({
            title: overrides.title ?? 'Test Product',
            description: overrides.description ?? 'Test Description',
            price: overrides.price ?? { amount: 100, currency: 'USD' },
            seller: overrides.seller ?? sellerId1,
            stock: overrides.stock ?? 10,
            images: overrides.images ?? [],
            category: overrides.category ?? null,
        });
    };

    // ─── Stock Tests ──────────────────────────────────────────────────────────

    describe('Stock Management (PATCH /api/products/:id/stock)', () => {
        it('seller can set stock', async () => {
            const prod = await createProduct({ stock: 5 });
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'set', quantity: 20 });

            expect(res.status).toBe(200);
            expect(res.body.product.stock).toBe(20);
        });

        it('seller can increment stock', async () => {
            const prod = await createProduct({ stock: 5 });
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'increment', quantity: 10 });

            expect(res.status).toBe(200);
            expect(res.body.product.stock).toBe(15);
        });

        it('seller can decrement stock', async () => {
            const prod = await createProduct({ stock: 10 });
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'decrement', quantity: 3 });

            expect(res.status).toBe(200);
            expect(res.body.product.stock).toBe(7);
        });

        it('stock cannot become negative (decrement beyond available)', async () => {
            const prod = await createProduct({ stock: 5 });
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'decrement', quantity: 10 });

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/insufficient stock/i);
        });

        it('returns 400 for invalid action', async () => {
            const prod = await createProduct();
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'invalid', quantity: 5 });

            expect(res.status).toBe(400);
        });

        it('returns 400 for negative quantity', async () => {
            const prod = await createProduct();
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'set', quantity: -5 });

            expect(res.status).toBe(400);
        });

        it('requires authentication for stock update', async () => {
            const prod = await createProduct();
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .send({ action: 'set', quantity: 5 });

            expect(res.status).toBe(401);
        });

        it('users cannot update stock (403)', async () => {
            const prod = await createProduct();
            const token = signToken(sellerId1.toHexString(), 'user');
            const res = await request(app)
                .patch(`/api/products/${prod._id}/stock`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'set', quantity: 5 });

            expect(res.status).toBe(403);
        });
    });

    // ─── Schema Tests ─────────────────────────────────────────────────────────

    describe('Product Schema - thumbnail field', () => {
        it('stores thumbnail (not tumbnail) in images', async () => {
            const prod = await Product.create({
                title: 'Thumbnail Test',
                price: { amount: 50, currency: 'USD' },
                seller: sellerId1,
                images: [{ url: 'https://example.com/img.jpg', thumbnail: 'https://example.com/thumb.jpg', id: 'abc123' }]
            });
            expect(prod.images[0].thumbnail).toBe('https://example.com/thumb.jpg');
            // Old typo field should not exist
            expect(prod.images[0].tumbnail).toBeUndefined();
        });
    });

    // ─── Validation Tests ─────────────────────────────────────────────────────

    describe('Product Validation', () => {
        it('rejects invalid price (negative) via update', async () => {
            const prod = await createProduct();
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ price: { amount: -5 } });

            expect(res.status).toBe(400);
        });

        it('rejects negative stock via update', async () => {
            const prod = await createProduct();
            const token = signToken(sellerId1.toHexString(), 'seller');
            const res = await request(app)
                .patch(`/api/products/${prod._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ stock: -10 });

            expect(res.status).toBe(400);
        });
    });

    // ─── Admin Authorization ──────────────────────────────────────────────────

    describe('Admin Authorization', () => {
        it('admin can update any seller product', async () => {
            const prod = await createProduct({ seller: sellerId1 });
            const adminToken = signToken(new mongoose.Types.ObjectId().toHexString(), 'admin');
            const res = await request(app)
                .patch(`/api/products/${prod._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Admin Updated' });

            expect(res.status).toBe(200);
            expect(res.body.product.title).toBe('Admin Updated');
        });

        it('admin can delete any product', async () => {
            const prod = await createProduct({ seller: sellerId1 });
            const adminToken = signToken(new mongoose.Types.ObjectId().toHexString(), 'admin');
            const res = await request(app)
                .delete(`/api/products/${prod._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    // ─── Category Filtering ───────────────────────────────────────────────────

    describe('Category Support', () => {
        it('filters products by category', async () => {
            await Promise.all([
                createProduct({ title: 'Electronics Item', category: 'electronics' }),
                createProduct({ title: 'Clothing Item', category: 'clothing' }),
                createProduct({ title: 'Another Electronic', category: 'electronics' }),
            ]);

            const res = await request(app).get('/api/products').query({ category: 'electronics' });
            expect(res.status).toBe(200);
            expect(res.body.data.length).toBe(2);
        });
    });
});
