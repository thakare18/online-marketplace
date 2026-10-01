require('./setup/env');
const request = require('supertest');
const axios = require('axios');
const http = require('http');
const ioClient = require('socket.io-client');
const { generateToken } = require('./setup/auth');
const app = require('../src/app');
const initSocketServer = require('../src/sockets/socket.server');
const { agent, setModel, resetModel } = require('../src/agent/agent');
const tools = require('../src/agent/tools');
const { AIMessage, ToolMessage } = require('@langchain/core/messages');

jest.mock('axios');

describe('AI Buddy Service Tests', () => {
    let server;
    let io;
    let serverPort;

    beforeAll((done) => {
        server = http.createServer(app);
        io = initSocketServer(server);
        server.listen(0, () => {
            serverPort = server.address().port;
            done();
        });
    });

    afterAll((done) => {
        io.close();
        server.close(done);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetModel();
    });

    // ─── 1. HTTP Endpoints & Health Check ─────────────────────────────────────
    describe('HTTP Endpoints & Health Checks', () => {
        it('GET / should return running message', async () => {
            const res = await request(app).get('/');
            expect(res.status).toBe(200);
            expect(res.text).toBe('Ai service is running');
        });

        it('GET /health should return service health information', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('healthy');
            expect(res.body.service).toBe('ai-buddy');
            expect(res.body.provider).toBe('google-gemini');
            expect(typeof res.body.uptime).toBe('number');
            expect(typeof res.body.aiConfigured).toBe('boolean');
        });

        it('GET /unknown-route should return 404', async () => {
            const res = await request(app).get('/some-nonexistent-route');
            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Route not found');
        });
    });

    // ─── 2. Product Query Tools ───────────────────────────────────────────────
    describe('Product Tools (searchProducts & getProductDetails)', () => {
        it('searchProducts: should search products and format results correctly', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            _id: '66a111111111111111111111',
                            title: 'Running Shoes',
                            price: { amount: 1999, currency: 'INR' },
                            stock: 10,
                            category: 'Footwear',
                            description: 'Comfortable sports shoes'
                        }
                    ]
                }
            });

            const resultStr = await tools.searchProducts.invoke({ query: 'shoes' });
            const result = JSON.parse(resultStr);

            expect(axios.get).toHaveBeenCalledWith(
                'http://localhost:3001/api/products',
                expect.objectContaining({
                    params: { q: 'shoes' }
                })
            );
            expect(result.count).toBe(1);
            expect(result.products[0].title).toBe('Running Shoes');
            expect(result.products[0].price).toBe('1999 INR');
        });

        it('searchProducts: should handle empty search results gracefully', async () => {
            axios.get.mockResolvedValueOnce({
                data: { data: [] }
            });

            const resultStr = await tools.searchProducts.invoke({ query: 'nonexistent-item' });
            const result = JSON.parse(resultStr);

            expect(result.products).toEqual([]);
            expect(result.message).toContain('No products found matching');
        });

        it('searchProducts: should handle downstream service failure gracefully', async () => {
            const networkError = new Error('connect ECONNREFUSED 127.0.0.1:3001');
            networkError.code = 'ECONNREFUSED';
            axios.get.mockRejectedValueOnce(networkError);

            const resultStr = await tools.searchProducts.invoke({ query: 'laptop' });
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Product Service is currently unavailable');
        });

        it('getProductDetails: should fetch details for valid product ID', async () => {
            const validId = '66a111111111111111111111';
            axios.get.mockResolvedValueOnce({
                data: {
                    product: {
                        _id: validId,
                        title: 'Wireless Headphones',
                        price: { amount: 2499, currency: 'INR' },
                        stock: 15,
                        category: 'Electronics',
                        description: 'Noise cancelling headphones'
                    }
                }
            });

            const resultStr = await tools.getProductDetails.invoke({ productId: validId });
            const result = JSON.parse(resultStr);

            expect(axios.get).toHaveBeenCalledWith(
                `http://localhost:3001/api/products/${validId}`,
                expect.any(Object)
            );
            expect(result.title).toBe('Wireless Headphones');
            expect(result.stock).toBe(15);
        });

        it('getProductDetails: should validate product ID format and reject invalid IDs', async () => {
            const resultStr = await tools.getProductDetails.invoke({ productId: 'invalid-id-123' });
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Invalid product ID format');
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('getProductDetails: should handle 404 Not Found cleanly', async () => {
            const validId = '66a111111111111111111111';
            const notFoundError = new Error('Not found');
            notFoundError.response = { status: 404, data: { message: 'Product not found' } };
            axios.get.mockRejectedValueOnce(notFoundError);

            const resultStr = await tools.getProductDetails.invoke({ productId: validId });
            const result = JSON.parse(resultStr);

            expect(result.error).toBe('Product not found');
        });
    });

    // ─── 3. Cart Tools & Authentication Isolation ─────────────────────────────
    describe('Cart Tools (getCart & addProductToCart)', () => {
        const token = generateToken({ id: '66a999999999999999999999' });

        it('getCart: should require authentication token', async () => {
            const resultStr = await tools.getCart.invoke({}, { metadata: {} });
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Authentication required');
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('getCart: should fetch authenticated user cart with Bearer token', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    cart: {
                        items: [
                            {
                                product: { _id: '66a111111111111111111111', title: 'Smart Watch' },
                                quantity: 2,
                                price: { amount: 3000, currency: 'INR' }
                            }
                        ],
                        totalPrice: 6000
                    }
                }
            });

            const resultStr = await tools.getCart.invoke({}, { metadata: { token } });
            const result = JSON.parse(resultStr);

            expect(axios.get).toHaveBeenCalledWith(
                'http://localhost:3002/api/cards',
                expect.objectContaining({
                    headers: { Authorization: `Bearer ${token}` }
                })
            );
            expect(result.itemCount).toBe(1);
            expect(result.totalPrice).toBe(6000);
        });

        it('addProductToCart: should call /api/cards/items with correct payload and auth', async () => {
            const productId = '66a111111111111111111111';
            axios.post.mockResolvedValueOnce({
                data: {
                    message: 'Item added to cart',
                    cart: { items: [{ product: productId, quantity: 2 }], totalPrice: 2000 }
                }
            });

            const resultStr = await tools.addProductToCart.invoke(
                { productId, qty: 2 },
                { metadata: { token } }
            );
            const result = JSON.parse(resultStr);

            expect(axios.post).toHaveBeenCalledWith(
                'http://localhost:3002/api/cards/items',
                { productId, qty: 2 },
                expect.objectContaining({
                    headers: { Authorization: `Bearer ${token}` }
                })
            );
            expect(result.success).toBe(true);
            expect(result.message).toContain('Successfully added product');
        });

        it('addProductToCart: should reject without authentication', async () => {
            const resultStr = await tools.addProductToCart.invoke(
                { productId: '66a111111111111111111111', qty: 1 },
                { metadata: {} }
            );
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Authentication required');
            expect(axios.post).not.toHaveBeenCalled();
        });

        it('addProductToCart: should validate invalid product ID', async () => {
            const resultStr = await tools.addProductToCart.invoke(
                { productId: 'bad-product-id', qty: 1 },
                { metadata: { token } }
            );
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Invalid product ID format');
            expect(axios.post).not.toHaveBeenCalled();
        });

        it('addProductToCart: should handle Cart Service out of stock error (400/409)', async () => {
            const error = new Error('Out of stock');
            error.response = { status: 400, data: { message: 'Insufficient stock available' } };
            axios.post.mockRejectedValueOnce(error);

            const resultStr = await tools.addProductToCart.invoke(
                { productId: '66a111111111111111111111', qty: 50 },
                { metadata: { token } }
            );
            const result = JSON.parse(resultStr);

            expect(result.error).toBe('Insufficient stock available');
        });
    });

    // ─── 4. Order Tools & Data Isolation ──────────────────────────────────────
    describe('Order Tools (getUserOrders & getOrderDetails)', () => {
        const token = generateToken({ id: '66a999999999999999999999' });

        it('getUserOrders: should require authentication token', async () => {
            const resultStr = await tools.getUserOrders.invoke({}, { metadata: {} });
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Authentication required');
            expect(axios.get).not.toHaveBeenCalled();
        });

        it('getUserOrders: should fetch authenticated user orders', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    orders: [
                        {
                            _id: '66b111111111111111111111',
                            status: 'CONFIRMED',
                            paymentStatus: 'COMPLETED',
                            totalPrice: 4500,
                            items: [{ product: '66a111111111111111111111', quantity: 1 }],
                            createdAt: '2026-10-01T10:00:00.000Z'
                        }
                    ]
                }
            });

            const resultStr = await tools.getUserOrders.invoke({}, { metadata: { token } });
            const result = JSON.parse(resultStr);

            expect(axios.get).toHaveBeenCalledWith(
                'http://localhost:3003/api/orders/me',
                expect.objectContaining({
                    headers: { Authorization: `Bearer ${token}` }
                })
            );
            expect(result.count).toBe(1);
            expect(result.orders[0].status).toBe('CONFIRMED');
        });

        it('getOrderDetails: should fetch order details for owner', async () => {
            const orderId = '66b111111111111111111111';
            axios.get.mockResolvedValueOnce({
                data: {
                    order: {
                        _id: orderId,
                        status: 'SHIPPED',
                        paymentStatus: 'COMPLETED',
                        totalPrice: 4500,
                        items: [{ product: '66a111111111111111111111', quantity: 1, price: 4500 }],
                        address: { street: '123 Market St', city: 'Metropolis' }
                    }
                }
            });

            const resultStr = await tools.getOrderDetails.invoke({ orderId }, { metadata: { token } });
            const result = JSON.parse(resultStr);

            expect(axios.get).toHaveBeenCalledWith(
                `http://localhost:3003/api/orders/${orderId}`,
                expect.objectContaining({
                    headers: { Authorization: `Bearer ${token}` }
                })
            );
            expect(result.status).toBe('SHIPPED');
            expect(result.totalPrice).toBe(4500);
        });

        it('getOrderDetails: should handle 403 Forbidden when user attempts access to another user order', async () => {
            const orderId = '66b222222222222222222222';
            const forbiddenErr = new Error('Forbidden');
            forbiddenErr.response = { status: 403, data: { message: 'Forbidden: You do not have access to this order' } };
            axios.get.mockRejectedValueOnce(forbiddenErr);

            const resultStr = await tools.getOrderDetails.invoke({ orderId }, { metadata: { token } });
            const result = JSON.parse(resultStr);

            expect(result.error).toContain('Access denied');
        });
    });

    // ─── 5. LangGraph Agent Tool Routing & Fallbacks ─────────────────────────
    describe('LangGraph Agent Routing & Fallback Behavior', () => {
        it('should invoke tools and return structured response through agent graph', async () => {
            // Mock a model that issues a tool call, then returns final text
            let callCount = 0;
            const mockModel = {
                bindTools: jest.fn().mockReturnThis(),
                invoke: jest.fn().mockImplementation(async (messages) => {
                    callCount++;
                    if (callCount === 1) {
                        return new AIMessage({
                            content: '',
                            tool_calls: [
                                {
                                    name: 'searchProducts',
                                    args: { query: 'laptop' },
                                    id: 'call_search_1'
                                }
                            ]
                        });
                    }
                    const toolMsg = messages.find(m => m instanceof ToolMessage);
                    return new AIMessage({
                        content: `Here are the matching products: ${toolMsg?.content}`
                    });
                })
            };

            axios.get.mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            _id: '66a111111111111111111111',
                            title: 'Gaming Laptop',
                            price: { amount: 75000, currency: 'INR' },
                            stock: 5,
                            category: 'Computers'
                        }
                    ]
                }
            });

            setModel(mockModel);

            const response = await agent.invoke(
                { messages: [{ role: 'user', content: 'Find me a gaming laptop' }] },
                { metadata: { token: 'mock-token' } }
            );

            expect(mockModel.invoke).toHaveBeenCalledTimes(2);
            const finalMessage = response.messages[response.messages.length - 1];
            expect(finalMessage.content).toContain('Gaming Laptop');
        });

        it('should handle unsupported tool name cleanly without crashing graph', async () => {
            let callCount = 0;
            const mockModel = {
                bindTools: jest.fn().mockReturnThis(),
                invoke: jest.fn().mockImplementation(async (messages) => {
                    callCount++;
                    if (callCount === 1) {
                        return new AIMessage({
                            content: '',
                            tool_calls: [
                                {
                                    name: 'unsupportedMysteryTool',
                                    args: {},
                                    id: 'call_unknown_1'
                                }
                            ]
                        });
                    }
                    const toolMsg = messages.find(m => m instanceof ToolMessage);
                    return new AIMessage({
                        content: `Notice: ${toolMsg?.content}`
                    });
                })
            };

            setModel(mockModel);

            const response = await agent.invoke(
                { messages: [{ role: 'user', content: 'Do magic' }] },
                { metadata: {} }
            );

            const finalMessage = response.messages[response.messages.length - 1];
            expect(finalMessage.content).toContain("Tool 'unsupportedMysteryTool' is not supported");
        });
    });

    // ─── 6. AI Provider Unavailability & Error Handling ──────────────────────
    describe('AI Provider Unavailability & Safety', () => {
        it('should reject with AI_PROVIDER_UNAVAILABLE when no provider key is configured and no mock model is set', async () => {
            const originalGoogle = process.env.GOOGLE_API_KEY;
            const originalGemini = process.env.GEMINI_API_KEY;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GEMINI_API_KEY;

            try {
                await expect(
                    agent.invoke({ messages: [{ role: 'user', content: 'Hello' }] })
                ).rejects.toMatchObject({
                    code: 'AI_PROVIDER_UNAVAILABLE'
                });
            } finally {
                if (originalGoogle) process.env.GOOGLE_API_KEY = originalGoogle;
                if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
            }
        });

        it('POST /api/chat should return 503 when AI provider is unconfigured', async () => {
            const originalGoogle = process.env.GOOGLE_API_KEY;
            const originalGemini = process.env.GEMINI_API_KEY;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GEMINI_API_KEY;

            try {
                const res = await request(app)
                    .post('/api/chat')
                    .send({ message: 'Hello' });

                expect(res.status).toBe(503);
                expect(res.body.message).toContain('AI Assistant is currently unavailable');
            } finally {
                if (originalGoogle) process.env.GOOGLE_API_KEY = originalGoogle;
                if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
            }
        });

        it('POST /api/chat should validate empty message body', async () => {
            const res = await request(app)
                .post('/api/chat')
                .send({ message: '   ' });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Validation failed');
        });

        it('POST /api/chat should return 401 when invalid JWT token is supplied', async () => {
            const res = await request(app)
                .post('/api/chat')
                .set('Authorization', 'Bearer invalid.token.xyz')
                .send({ message: 'Hello' });

            expect(res.status).toBe(401);
            expect(res.body.message).toContain('Invalid or expired');
        });
    });

    // ─── 7. WebSocket Authentication, Rate Limiting & Safety ─────────────────
    describe('Socket.IO Connection, Authentication & Rate Limiting', () => {
        it('should reject connection when no authentication token is provided', (done) => {
            const client = ioClient(`http://localhost:${serverPort}`, {
                transports: ['websocket'],
                reconnection: false
            });

            client.on('connect_error', (err) => {
                expect(err.message).toContain('Authentication token not provided');
                client.close();
                done();
            });

            client.on('connect', () => {
                client.close();
                done(new Error('Connection should not have succeeded without token'));
            });
        });

        it('should reject connection when invalid token is provided', (done) => {
            const client = ioClient(`http://localhost:${serverPort}`, {
                transports: ['websocket'],
                reconnection: false,
                auth: { token: 'bogus.jwt.token' }
            });

            client.on('connect_error', (err) => {
                expect(err.message).toContain('Invalid or expired authentication token');
                client.close();
                done();
            });

            client.on('connect', () => {
                client.close();
                done(new Error('Connection should not have succeeded with bogus token'));
            });
        });

        it('should accept connection with valid token and process chat message', (done) => {
            const validToken = generateToken();

            const mockModel = {
                bindTools: jest.fn().mockReturnThis(),
                invoke: jest.fn().mockResolvedValue(new AIMessage('Hello! How can I assist your shopping today?'))
            };
            setModel(mockModel);

            const client = ioClient(`http://localhost:${serverPort}`, {
                transports: ['websocket'],
                reconnection: false,
                auth: { token: validToken }
            });

            client.on('connect', () => {
                client.emit('message', 'Hi there!');
            });

            client.on('message', (reply) => {
                expect(reply).toBe('Hello! How can I assist your shopping today?');
                client.close();
                done();
            });

            client.on('error', (err) => {
                client.close();
                done(new Error(`Unexpected socket error: ${JSON.stringify(err)}`));
            });
        });

        it('should emit error when empty message is sent over socket', (done) => {
            const validToken = generateToken();

            const client = ioClient(`http://localhost:${serverPort}`, {
                transports: ['websocket'],
                reconnection: false,
                auth: { token: validToken }
            });

            client.on('connect', () => {
                client.emit('message', '   ');
            });

            client.on('error', (err) => {
                expect(err.message).toContain('Message content cannot be empty');
                client.close();
                done();
            });
        });
    });
});
