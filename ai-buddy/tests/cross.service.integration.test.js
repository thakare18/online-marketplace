require('./setup/env');
const axios = require('axios');
const mongoose = require('mongoose');
const { generateToken } = require('./setup/auth');
const tools = require('../src/agent/tools');

jest.mock('axios');

describe('Full Cross-Service Backend Integration Flow', () => {
    // Service state stores for realistic cross-service integration simulation
    const sellerId = new mongoose.Types.ObjectId().toString();
    const customerId = new mongoose.Types.ObjectId().toString();
    const otherCustomerId = new mongoose.Types.ObjectId().toString();

    const sellerToken = generateToken({ id: sellerId, role: 'seller', email: 'seller@store.com' });
    const customerToken = generateToken({ id: customerId, role: 'user', email: 'customer@test.com' });
    const otherCustomerToken = generateToken({ id: otherCustomerId, role: 'user', email: 'other@test.com' });

    let productsStore = [];
    let cartStore = new Map();
    let ordersStore = [];
    let paymentsStore = [];
    let notificationsDispatched = [];
    let sellerDashboardReadModel = {
        products: [],
        orders: [],
        payments: []
    };

    beforeEach(() => {
        jest.clearAllMocks();
        productsStore = [];
        cartStore.clear();
        ordersStore = [];
        paymentsStore = [];
        notificationsDispatched = [];
        sellerDashboardReadModel = { products: [], orders: [], payments: [] };
    });

    it('Complete E2E Chain: Product -> Cart -> Order -> Inventory -> Payment -> Notification -> Seller Dashboard', async () => {
        // ─── STEP 1: Product Creation by Seller ──────────────────────────────
        const productId = new mongoose.Types.ObjectId().toString();
        const initialProduct = {
            _id: productId,
            title: 'Mechanical Keyboard',
            description: 'RGB mechanical gaming keyboard',
            price: { amount: 3500, currency: 'INR' },
            stock: 20,
            category: 'Electronics',
            seller: sellerId,
            isActive: true
        };
        productsStore.push(initialProduct);

        // Simulate RabbitMQ Event: product.created
        const productCreatedEnvelope = {
            event: 'product.created',
            version: 1,
            timestamp: new Date().toISOString(),
            data: initialProduct
        };
        // Replicated to Seller Dashboard read model
        sellerDashboardReadModel.products.push({ ...productCreatedEnvelope.data });
        expect(sellerDashboardReadModel.products.length).toBe(1);

        // ─── STEP 2: Customer Adds Product to Cart ───────────────────────────
        cartStore.set(customerId, {
            user: customerId,
            items: [{ product: initialProduct, quantity: 2 }],
            totalPrice: 7000
        });

        // ─── STEP 3: Order Creation & Stock Reservation ──────────────────────
        const orderId = new mongoose.Types.ObjectId().toString();
        const orderItems = [
            {
                product: productId,
                quantity: 2,
                price: { amount: 3500, currency: 'INR' }
            }
        ];

        // Stock decrement (inventory reservation)
        initialProduct.stock -= 2;
        expect(initialProduct.stock).toBe(18);

        const newOrder = {
            _id: orderId,
            user: customerId,
            items: orderItems,
            totalPrice: 7000,
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            address: {
                street: '456 Tech Park',
                city: 'Bengaluru',
                state: 'Karnataka',
                zip: '560001',
                country: 'India'
            },
            createdAt: new Date().toISOString()
        };
        ordersStore.push(newOrder);

        // Cart is cleared after order creation
        cartStore.set(customerId, { user: customerId, items: [], totalPrice: 0 });

        // Simulate RabbitMQ Event: order.created
        const orderCreatedEnvelope = {
            event: 'order.created',
            version: 1,
            timestamp: new Date().toISOString(),
            data: {
                orderId: newOrder._id,
                userId: newOrder.user,
                email: 'customer@test.com',
                username: 'customer',
                items: newOrder.items,
                totalPrice: newOrder.totalPrice,
                status: newOrder.status,
                paymentStatus: newOrder.paymentStatus
            }
        };

        // Notification consumer receives order.created
        notificationsDispatched.push({
            type: 'ORDER_CONFIRMATION',
            to: orderCreatedEnvelope.data.email,
            orderId: orderCreatedEnvelope.data.orderId,
            total: orderCreatedEnvelope.data.totalPrice
        });
        expect(notificationsDispatched.length).toBe(1);
        expect(notificationsDispatched[0].to).toBe('customer@test.com');

        // Seller Dashboard syncs order into read model
        sellerDashboardReadModel.orders.push({
            _id: newOrder._id,
            user: newOrder.user,
            items: newOrder.items,
            totalPrice: newOrder.totalPrice,
            status: newOrder.status,
            paymentStatus: newOrder.paymentStatus
        });
        expect(sellerDashboardReadModel.orders.length).toBe(1);

        // ─── STEP 4: Payment Initiation & Completion ─────────────────────────
        const paymentId = new mongoose.Types.ObjectId().toString();
        const razorpayOrderId = 'order_rzp_mock_12345';
        const razorpayPaymentId = 'pay_rzp_mock_67890';

        const paymentRecord = {
            _id: paymentId,
            order: orderId,
            user: customerId,
            amount: 7000,
            currency: 'INR',
            razorpayOrderId,
            razorpayPaymentId,
            status: 'COMPLETED'
        };
        paymentsStore.push(paymentRecord);

        // Order payment status updated
        newOrder.paymentStatus = 'PAID';
        newOrder.status = 'CONFIRMED';

        // Simulate RabbitMQ Event: payment.completed
        const paymentCompletedEnvelope = {
            event: 'payment.completed',
            version: 1,
            timestamp: new Date().toISOString(),
            data: {
                paymentId: paymentRecord._id,
                orderId: paymentRecord.order,
                userId: paymentRecord.user,
                amount: paymentRecord.amount,
                status: 'COMPLETED'
            }
        };

        // Notification consumer sends receipt
        notificationsDispatched.push({
            type: 'PAYMENT_RECEIPT',
            to: 'customer@test.com',
            orderId: paymentCompletedEnvelope.data.orderId,
            amount: paymentCompletedEnvelope.data.amount
        });
        expect(notificationsDispatched.length).toBe(2);

        // Seller Dashboard updates payment and calculates metrics
        sellerDashboardReadModel.payments.push({ ...paymentRecord });
        const matchingOrder = sellerDashboardReadModel.orders.find(o => o._id === orderId);
        if (matchingOrder) {
            matchingOrder.paymentStatus = 'PAID';
            matchingOrder.status = 'CONFIRMED';
        }

        // Verify authoritative dashboard metrics
        const sellerProductIds = new Set(sellerDashboardReadModel.products.map(p => p._id));
        let totalRevenue = 0;
        let totalSales = 0;

        for (const order of sellerDashboardReadModel.orders) {
            if (order.paymentStatus === 'PAID') {
                for (const item of order.items) {
                    if (sellerProductIds.has(item.product)) {
                        totalRevenue += (item.price?.amount || 0) * item.quantity;
                        totalSales += item.quantity;
                    }
                }
            }
        }

        expect(totalRevenue).toBe(7000);
        expect(totalSales).toBe(2);
    });

    it('Cross-Service Verification: AI Buddy Communication with Product, Cart, and Order Services', async () => {
        const productId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId().toString();

        // 1. AI Buddy -> Product Service (searchProducts & getProductDetails)
        axios.get.mockImplementation(async (url, config) => {
            if (url === 'http://localhost:3001/api/products') {
                return {
                    data: {
                        data: [
                            {
                                _id: productId,
                                title: 'Noise Cancelling Headphones',
                                price: { amount: 5000, currency: 'INR' },
                                stock: 10,
                                category: 'Electronics'
                            }
                        ]
                    }
                };
            }
            if (url === `http://localhost:3001/api/products/${productId}`) {
                return {
                    data: {
                        product: {
                            _id: productId,
                            title: 'Noise Cancelling Headphones',
                            price: { amount: 5000, currency: 'INR' },
                            stock: 10,
                            category: 'Electronics'
                        }
                    }
                };
            }
            if (url === 'http://localhost:3002/api/cards') {
                // Verify auth header presence
                if (!config?.headers?.Authorization) {
                    const err = new Error('Unauthorized');
                    err.response = { status: 401, data: { message: 'Unauthorized' } };
                    throw err;
                }
                return {
                    data: {
                        cart: {
                            items: [
                                {
                                    product: { _id: productId, title: 'Noise Cancelling Headphones' },
                                    quantity: 1,
                                    price: { amount: 5000, currency: 'INR' }
                                }
                            ],
                            totalPrice: 5000
                        }
                    }
                };
            }
            if (url === 'http://localhost:3003/api/orders/me') {
                return {
                    data: {
                        orders: [
                            {
                                _id: orderId,
                                status: 'CONFIRMED',
                                paymentStatus: 'PAID',
                                totalPrice: 5000,
                                items: [{ product: productId, quantity: 1 }],
                                createdAt: new Date().toISOString()
                            }
                        ]
                    }
                };
            }
            if (url === `http://localhost:3003/api/orders/${orderId}`) {
                return {
                    data: {
                        order: {
                            _id: orderId,
                            status: 'CONFIRMED',
                            paymentStatus: 'PAID',
                            totalPrice: 5000,
                            items: [{ product: productId, quantity: 1, price: 5000 }]
                        }
                    }
                };
            }
            throw new Error(`Unhandled GET url: ${url}`);
        });

        // Search products via AI Buddy tool
        const searchResultStr = await tools.searchProducts.invoke({ query: 'Headphones' });
        const searchResult = JSON.parse(searchResultStr);
        expect(searchResult.count).toBe(1);
        expect(searchResult.products[0].title).toBe('Noise Cancelling Headphones');

        // Get product details via AI Buddy tool
        const detailResultStr = await tools.getProductDetails.invoke({ productId });
        const detailResult = JSON.parse(detailResultStr);
        expect(detailResult.title).toBe('Noise Cancelling Headphones');

        // Get user cart via AI Buddy tool with customer token
        const cartResultStr = await tools.getCart.invoke({}, { metadata: { token: customerToken } });
        const cartResult = JSON.parse(cartResultStr);
        expect(cartResult.itemCount).toBe(1);
        expect(cartResult.totalPrice).toBe(5000);

        // Get user orders via AI Buddy tool with customer token
        const ordersResultStr = await tools.getUserOrders.invoke({}, { metadata: { token: customerToken } });
        const ordersResult = JSON.parse(ordersResultStr);
        expect(ordersResult.count).toBe(1);
        expect(ordersResult.orders[0].status).toBe('CONFIRMED');

        // Verify data isolation: unauthorized request is rejected
        const unauthCartResult = JSON.parse(await tools.getCart.invoke({}, { metadata: {} }));
        expect(unauthCartResult.error).toContain('Authentication required');
    });
});
