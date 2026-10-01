const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/models/card.model.js', () => {
    function genId() {
        return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    const carts = new Map();
    class CardMock {
        constructor({ user, items }) {
            this._id = genId();
            this.user = user;
            this.items = items || [];
            this.updatedAt = new Date().toISOString();
        }
        static async findOne(query) { return carts.get(String(query.user)) || null; }
        static async create(data) {
            const c = new CardMock(data);
            carts.set(String(c.user), c);
            return c;
        }
        async save() { carts.set(String(this.user), this); return this; }
    }
    CardMock.__reset = () => carts.clear();
    return CardMock;
});

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

function genId() {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const POST = '/api/cards/items';
const CART = '/api/cards';

describe('DELETE /api/cards/items/:productId — Remove item', () => {
    const userId = genId();
    const productId = genId();
    const otherProductId = genId();

    beforeEach(() => CardModel.__reset());

    test('removes existing item from cart', async () => {
        const token = signToken({ id: userId, role: 'user' });
        await request(app).post(POST).set('Authorization', `Bearer ${token}`).send({ productId, qty: 2 });
        await request(app).post(POST).set('Authorization', `Bearer ${token}`).send({ productId: otherProductId, qty: 1 });

        const res = await request(app)
            .delete(`${CART}/items/${productId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Item removed from cart');
        // Only otherProductId should remain
        const remaining = res.body.cart.items.map(i => String(i.productId));
        expect(remaining).not.toContain(productId);
        expect(remaining).toContain(otherProductId);
    });

    test('idempotent — 200 even if item does not exist', async () => {
        const token = signToken({ id: userId, role: 'user' });
        // No item added — deleting still returns 200
        const res = await request(app)
            .delete(`${CART}/items/${productId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
    });

    test('400 for invalid productId', async () => {
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .delete(`${CART}/items/not-an-objectid`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });

    test('401 when no token', async () => {
        const res = await request(app).delete(`${CART}/items/${productId}`);
        expect(res.status).toBe(401);
    });

    test('403 when role not user', async () => {
        const token = signToken({ id: userId, role: 'seller' });
        const res = await request(app)
            .delete(`${CART}/items/${productId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/cards — Clear cart', () => {
    const userId = genId();
    const productId = genId();

    beforeEach(() => CardModel.__reset());

    test('clears all items from cart', async () => {
        const token = signToken({ id: userId, role: 'user' });
        await request(app).post(POST).set('Authorization', `Bearer ${token}`).send({ productId, qty: 3 });

        const res = await request(app)
            .delete(CART)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Cart cleared');
        expect(res.body.cart.items).toHaveLength(0);
    });

    test('200 when cart is already empty', async () => {
        const token = signToken({ id: userId, role: 'user' });
        const res = await request(app)
            .delete(CART)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
    });

    test('401 when no token', async () => {
        const res = await request(app).delete(CART);
        expect(res.status).toBe(401);
    });

    test('only affects own cart', async () => {
        const userAId = genId();
        const userBId = genId();
        const tokenA = signToken({ id: userAId, role: 'user' });
        const tokenB = signToken({ id: userBId, role: 'user' });

        await request(app).post(POST).set('Authorization', `Bearer ${tokenA}`).send({ productId, qty: 2 });
        await request(app).post(POST).set('Authorization', `Bearer ${tokenB}`).send({ productId, qty: 1 });

        // Clear user A's cart
        await request(app).delete(CART).set('Authorization', `Bearer ${tokenA}`);

        // User B's cart should be unaffected
        const res = await request(app).get(CART).set('Authorization', `Bearer ${tokenB}`);
        expect(res.status).toBe(200);
        expect(res.body.cart.items).toHaveLength(1);
    });
});

describe('GET /api/cards — Cart totals computed server-side', () => {
    const userId = genId();
    const productIdA = genId();
    const productIdB = genId();
    const { getProduct } = require('../src/services/product.service.js');

    beforeEach(() => {
        CardModel.__reset();
        getProduct.mockResolvedValue({
            _id: 'mock',
            title: 'Product',
            price: { amount: 200, currency: 'INR' },
            stock: 100,
        });
    });

    test('subtotal and totals are calculated server-side', async () => {
        const token = signToken({ id: userId, role: 'user' });
        await request(app).post(POST).set('Authorization', `Bearer ${token}`).send({ productId: productIdA, qty: 3 });
        await request(app).post(POST).set('Authorization', `Bearer ${token}`).send({ productId: productIdB, qty: 2 });

        const res = await request(app).get(CART).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        // 3*200 + 2*200 = 1000
        expect(res.body.totals.subtotal).toBe(1000);
        expect(res.body.totals.totalQuantity).toBe(5);
        expect(res.body.totals.itemCount).toBe(2);
    });
});
