const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock card model (in-memory store)
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
    CardMock.__seed = (user, data) => {
        carts.set(String(user), data);
    };
    return CardMock;
});

// Mock Product service so tests don't depend on a running Product service
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
const app = require('../src/app');

function generateObjectId() {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const getEndpoint = '/api/cards';
const postEndpoint = '/api/cards/items';

describe('GET /api/cart', () => {
    const userId = generateObjectId();
    const productIdA = generateObjectId();
    const productIdB = generateObjectId();

    beforeEach(() => {
        CardModel.__reset();
    });

    test('returns cart with items and basic totals', async () => {
        const token = signToken({ id: userId, role: 'user' });
        // Seed via existing POST endpoint (ensures consistency with add logic)
        await request(app)
            .post(postEndpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productIdA, qty: 2 });
        await request(app)
            .post(postEndpoint)
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productIdB, qty: 3 });

        const res = await request(app)
            .get(getEndpoint)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.cart.items)).toBe(true);
        expect(res.body.cart.items).toHaveLength(2);
        expect(res.body.totals).toMatchObject({ itemCount: 2, totalQuantity: 5 });
    });

    test('returns empty cart structure when none exists', async () => {
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .get(getEndpoint)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.cart.items).toHaveLength(0);
        expect(res.body.totals).toMatchObject({ itemCount: 0, totalQuantity: 0 });
    });

    test('401 when no token', async () => {
        const res = await request(app).get(getEndpoint);
        expect(res.status).toBe(401);
    });

    test('403 when role not allowed', async () => {
        const token = signToken({ id: userId, role: 'admin' });
        const res = await request(app)
            .get(getEndpoint)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });

    test('401 when token invalid', async () => {
        const res = await request(app)
            .get(getEndpoint)
            .set('Authorization', 'Bearer invalid.token.here');
        expect(res.status).toBe(401);
    });
});