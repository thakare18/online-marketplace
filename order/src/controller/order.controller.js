const mongoose = require('mongoose');
const orderModel = require('../models/order.model');
const { publishToQueue } = require('../brocker/brocker');
const {
    getProduct,
    decrementProductStock,
    incrementProductStock,
    getUserCart,
    clearUserCart,
} = require('../services/external.service');


// ─── Helper: Standardized Event ───────────────────────────────────────────────

async function publishOrderEvent(eventName, data) {
    const payload = {
        event: eventName,
        version: 1,
        timestamp: new Date().toISOString(),
        data,
    };
    try {
        await publishToQueue(eventName, payload);
    } catch (err) {
        console.warn(`[ORDER] Failed to publish event ${eventName}:`, err.message);
    }
}

// ─── Helper: Token Extraction ─────────────────────────────────────────────────

function extractToken(req) {
    return req.cookies?.token
        || req.cookies?.accessToken
        || req.headers?.authorization?.split(' ')[1];
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/orders
 * Creates an order from the user's cart.
 * - Fetches cart from Cart service
 * - Fetches each product from Product service (validates price + stock)
 * - Atomically decrements stock for each item
 * - Rolls back on partial failure
 * - Clears cart after success
 */
async function createOrder(req, res) {
    const user = req.user;
    const token = extractToken(req);

    try {
        // 1. Fetch cart
        let cart;
        try {
            cart = await getUserCart(token);
        } catch (err) {
            return res.status(err.status || 503).json({ message: err.message });
        }

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(422).json({ message: 'Cannot create order: cart is empty' });
        }

        // 2. Fetch products and validate stock + price
        let products;
        try {
            products = await Promise.all(
                cart.items.map(item => getProduct(item.productId, token))
            );
        } catch (err) {
            return res.status(err.status || 503).json({ message: err.message });
        }

        // 3. Build order items using authoritative product prices (never trust cart price for order)
        let totalAmount = 0;
        const orderItems = [];

        for (let i = 0; i < cart.items.length; i++) {
            const item = cart.items[i];
            const product = products[i];

            if (!product) {
                return res.status(404).json({ message: `Product not found: ${item.productId}` });
            }

            // Use authoritative unit price from Product service
            const unitPrice = product.price?.amount ?? 0;
            const currency = product.price?.currency ?? 'INR';
            const lineTotal = unitPrice * item.quantity;

            // Server-side stock check before attempting atomic decrement
            if (typeof product.stock === 'number' && item.quantity > product.stock) {
                return res.status(409).json({
                    message: `Insufficient stock for product: ${product.title || product._id}`,
                    productId: item.productId,
                    available: product.stock,
                    requested: item.quantity,
                });
            }

            totalAmount += lineTotal;
            orderItems.push({
                product: item.productId,
                title: product.title ?? product.name ?? null,
                quantity: item.quantity,
                price: { amount: unitPrice, currency },
            });
        }

        // 4. Atomically decrement stock for each item — with rollback on failure
        const reserved = []; // track successfully reserved items for rollback

        for (let i = 0; i < orderItems.length; i++) {
            const item = orderItems[i];
            try {
                await decrementProductStock(String(item.product), item.quantity, token);
                reserved.push({ productId: String(item.product), quantity: item.quantity });
            } catch (err) {
                // Rollback already-reserved items
                console.warn(`[ORDER] Stock reservation failed for ${item.product}. Rolling back ${reserved.length} items.`);
                await Promise.all(
                    reserved.map(r => incrementProductStock(r.productId, r.quantity, token))
                );

                if (err.status === 409) {
                    return res.status(409).json({
                        message: err.message || 'Insufficient stock',
                        productId: String(item.product),
                        available: err.available,
                    });
                }
                return res.status(err.status || 503).json({
                    message: err.message || 'Failed to reserve inventory',
                });
            }
        }

        // 5. Determine currency (use currency of first item; all should be same)
        const currency = orderItems[0]?.price?.currency ?? 'INR';

        // 6. Create order record
        const order = await orderModel.create({
            user: user.id,
            items: orderItems,
            status: 'PENDING',
            totalPrice: {
                amount: parseFloat(totalAmount.toFixed(2)),
                currency,
            },
            shippingAddress: {
                street: req.body.shippingAddress.street,
                city: req.body.shippingAddress.city,
                state: req.body.shippingAddress.state,
                zip: req.body.shippingAddress.pincode,
                country: req.body.shippingAddress.country,
            },
            paymentStatus: 'UNPAID',
        });

        // 7. Publish order created event
        await publishOrderEvent('order.created', {
            orderId: order._id,
            userId: order.user,
            items: orderItems.map(i => ({ productId: i.product, quantity: i.quantity })),
            totalPrice: order.totalPrice,
        });

        // Legacy queue name for backward compat
        await publishOrderEvent('ORDER_SELLER_DASHBOARD.ORDER_CREATED', {
            orderId: order._id,
            userId: order.user,
            totalPrice: order.totalPrice,
        });

        // 8. Clear cart after successful order (non-fatal if fails)
        await clearUserCart(token);

        return res.status(201).json({ order });
    } catch (err) {
        console.error('[ORDER] createOrder error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


/**
 * GET /api/orders/me
 * Returns the authenticated user's orders with pagination.
 */
async function getMyOrders(req, res) {
    const user = req.user;

    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            orderModel
                .find({ user: user.id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            orderModel.countDocuments({ user: user.id }),
        ]);

        return res.status(200).json({
            orders,
            meta: { total, page, limit, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('[ORDER] getMyOrders error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


/**
 * GET /api/orders/:id
 * Returns a single order by ID.
 * FIXED: was missing response after auth check.
 */
async function getOrderById(req, res) {
    const user = req.user;
    const orderId = req.params.id;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const order = await orderModel.findById(orderId).exec();

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Users can only see their own orders; admins can see any
        if (user.role !== 'admin' && order.user.toString() !== user.id) {
            return res.status(403).json({ message: 'Forbidden: You do not have access to this order' });
        }

        return res.status(200).json({ order });
    } catch (err) {
        console.error('[ORDER] getOrderById error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


/**
 * POST /api/orders/:id/cancel
 * Cancel an order — only allowed from PENDING or CONFIRMED.
 * Restores inventory when cancelling.
 */
async function cancelOrderById(req, res) {
    const user = req.user;
    const orderId = req.params.id;
    const token = extractToken(req);

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const order = await orderModel.findById(orderId).exec();

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Ownership check — only owner can cancel (admins bypass)
        if (user.role !== 'admin' && order.user.toString() !== user.id) {
            return res.status(403).json({ message: 'Forbidden: You do not have access to this order' });
        }

        // Validate status transition
        if (!orderModel.isValidTransition(order.status, 'CANCELLED')) {
            return res.status(409).json({
                message: `Order cannot be cancelled at this stage (current status: ${order.status})`,
            });
        }

        order.status = 'CANCELLED';
        await order.save();

        // Restore inventory for cancelled items (non-fatal)
        await Promise.all(
            order.items.map(item =>
                incrementProductStock(String(item.product), item.quantity, token)
            )
        );

        await publishOrderEvent('order.cancelled', {
            orderId: order._id,
            userId: order.user,
            items: order.items.map(i => ({ productId: i.product, quantity: i.quantity })),
        });

        return res.status(200).json({ order });
    } catch (err) {
        console.error('[ORDER] cancelOrderById error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


/**
 * PATCH /api/orders/:id/address
 * Update shipping address — only allowed for PENDING orders.
 */
async function updateOrderAddress(req, res) {
    const user = req.user;
    const orderId = req.params.id;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const order = await orderModel.findById(orderId).exec();

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (user.role !== 'admin' && order.user.toString() !== user.id) {
            return res.status(403).json({ message: 'Forbidden: You do not have access to this order' });
        }

        if (order.status !== 'PENDING') {
            return res.status(409).json({
                message: `Order address cannot be updated at this stage (current status: ${order.status})`,
            });
        }

        order.shippingAddress = {
            street: req.body.shippingAddress.street,
            city: req.body.shippingAddress.city,
            state: req.body.shippingAddress.state,
            zip: req.body.shippingAddress.pincode,
            country: req.body.shippingAddress.country,
        };

        await order.save();

        return res.status(200).json({ order });
    } catch (err) {
        console.error('[ORDER] updateOrderAddress error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


/**
 * PATCH /api/orders/:id/status
 * Update order status (admin only) — enforces valid lifecycle transitions.
 */
async function updateOrderStatus(req, res) {
    const user = req.user;
    const orderId = req.params.id;
    const { status } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const validStatuses = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status: ${status}` });
        }

        const order = await orderModel.findById(orderId).exec();
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Validate lifecycle transition
        if (!orderModel.isValidTransition(order.status, status)) {
            return res.status(409).json({
                message: `Invalid status transition: ${order.status} → ${status}`,
            });
        }

        order.status = status;
        await order.save();

        await publishOrderEvent('order.status_updated', {
            orderId: order._id,
            userId: order.user,
            previousStatus: order.status,
            newStatus: status,
        });

        return res.status(200).json({ order });
    } catch (err) {
        console.error('[ORDER] updateOrderStatus error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


/**
 * PATCH /api/orders/:id/payment-status
 * Called by Payment service after successful Razorpay verification.
 * Accepts user or admin tokens (service-to-service call).
 */
async function updateOrderPaymentStatus(req, res) {
    const orderId = req.params.id;
    const { paymentStatus } = req.body;

    const validStatuses = ['UNPAID', 'PAID', 'REFUNDED', 'FAILED'];
    if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ message: `Invalid paymentStatus. Must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const order = await orderModel.findById(orderId).exec();
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        order.paymentStatus = paymentStatus;
        if (paymentStatus === 'PAID' && order.status === 'PENDING') {
            order.status = 'CONFIRMED';
        }
        await order.save();

        return res.status(200).json({ order });
    } catch (err) {
        console.error('[ORDER] updateOrderPaymentStatus error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}


module.exports = {
    createOrder,
    getMyOrders,
    getOrderById,
    cancelOrderById,
    updateOrderAddress,
    updateOrderStatus,
    updateOrderPaymentStatus,
};