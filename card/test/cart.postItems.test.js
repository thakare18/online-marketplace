const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock the card model before app/controller are loaded
jest.mock('../src/models/card.model.js', () => {
    function mockGenerateObjectId() {
        return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    const carts = new Map();
    class CardMock {
        constructor({ user, items }) {
            this._id = mockGenerateObjectId();
            this.user = user;
            this.items = items || [];
            this.updatedAt = new Date().toISOString();
        }
        static async findOne(query) {
            return carts.get(String(query.user)) || null;
        }
        static async create(data) {
            const card = new CardMock(data);
            carts.set(String(card.user), card);
            return card;
        }
        async save() {
            carts.set(String(this.user), this);
            return this;
        }
    }
    CardMock.__reset = () => carts.clear();
    return CardMock;
});

// Mock Product service — tests should NOT need a running Product service
jest.mock('../src/services/product.service.js', () => ({
    getProduct: jest.fn().mockResolvedValue({
        _id: 'mock-product-id',
        title: 'Mock Product',
        price: { amount: 100, currency: 'INR' },
        stock: 50,
    }),
    updateProductStock: jest.fn().mockResolvedValue({ success: true }),
}));

const CardModel = require('../src/models/card.model.js');
const { getProduct } = require('../src/services/product.service.js');
const app = require('../src/app');

function generateObjectId() {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const endpoint = '/api/cards/items';

describe('POST /api/cards/items', () => {
    const userId = generateObjectId();
    const productId = generateObjectId();

    beforeEach(() => {
        CardModel.__reset();
        getProduct.mockResolvedValue({
            _id: productId,
            title: 'Mock Product',
            price: { amount: 100, currency: 'INR' },
            stock: 50,
        });
    });

    test('creates new cart and adds first item', async () => {
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 2 });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Item added to cart');
        expect(res.body.cart).toBeDefined();
        expect(res.body.cart.items).toHaveLength(1);
        expect(res.body.cart.items[0]).toMatchObject({ productId, quantity: 2 });
    });

    test('increments quantity when item already exists', async () => {
        const token = signToken({ id: userId, role: 'user' });

        // First add
        await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 2 });

        // Second add
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 3 });

        expect(res.status).toBe(200);
        expect(res.body.cart.items).toHaveLength(1);
        expect(res.body.cart.items[0]).toMatchObject({ productId, quantity: 5 });
    });

    test('validation error for invalid productId', async () => {
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: 'invalid-id', qty: 1 });

        expect(res.status).toBe(400);
        expect(res.body.errors).toBeDefined();
        const messages = res.body.errors.map(e => e.msg);
        expect(messages).toContain('Invalid Product ID format');
    });

    test('validation error for non-positive qty', async () => {
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productId, qty: 0 });

        expect(res.status).toBe(400);
        expect(res.body.errors).toBeDefined();
        const messages = res.body.errors.map(e => e.msg);
        expect(messages).toContain('Quantity must be a positive integer');
    });

    test('401 when no token provided', async () => {
        const res = await request(app)
            .post(endpoint)
            .send({ productId, qty: 1 });
        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/Unauthorized/);
    });

    test('403 when role not allowed', async () => {
        const token = signToken({ id: userId, role: 'admin' }); // role admin not in [user]
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 1 });
        expect(res.status).toBe(403);
    });

    test('401 when token invalid', async () => {
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', 'Bearer invalid.token.here')
            .send({ productId, qty: 1 });
        expect(res.status).toBe(401);
    });

    test('409 when quantity exceeds available stock', async () => {
        getProduct.mockResolvedValue({
            _id: productId,
            title: 'Low Stock Product',
            price: { amount: 100, currency: 'INR' },
            stock: 2,
        });
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 5 });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/insufficient stock/i);
        expect(res.body.available).toBe(2);
    });

    test('404 when product not found', async () => {
        const notFoundError = new Error('Product not found');
        notFoundError.status = 404;
        getProduct.mockRejectedValue(notFoundError);

        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 1 });

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/product not found/i);
    });

    test('price is taken from product service, not client', async () => {
        getProduct.mockResolvedValue({
            _id: productId,
            title: 'Priced Product',
            price: { amount: 999, currency: 'INR' },
            stock: 50,
        });
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .post(endpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId, qty: 1, price: { amount: 1 } }); // client-provided price ignored

        expect(res.status).toBe(200);
        // Price must come from Product service (999), not client (1)
        expect(res.body.cart.items[0].price.amount).toBe(999);
    });
});