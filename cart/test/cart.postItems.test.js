const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock the card model before app/controller are loaded
jest.mock('../src/models/card.model.js', () => {
    // helper inside factory to avoid out-of-scope reference restriction
    function mockGenerateObjectId() {
        return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    const carts = new Map();
    class CardMock {
        constructor({ user, items }) {
            this._id = mockGenerateObjectId();
            this.user = user;
            this.items = items || [];
        }
        static async findOne(query) {
            return carts.get(query.user) || null;
        }
        static async create(data) {
            const card = new CardMock(data);
            carts.set(card.user, card);
            return card;
        }
        async save() {
            carts.set(this.user, this);
            return this;
        }
    }
    CardMock.__reset = () => carts.clear();
    return CardMock;
});

const CardModel = require('../src/models/card.model.js');
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
        expect(res.body.cart.items[ 0 ]).toMatchObject({ productId, quantity: 2 });
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
        expect(res.body.cart.items[ 0 ]).toMatchObject({ productId, quantity: 5 });
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
});