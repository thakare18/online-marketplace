const { subscribeToQueue } = require('./broker');
const userModel = require('../models/user.model');
const productModel = require('../models/product.model');
const orderModel = require('../models/order.model');
const paymentModel = require('../models/payment.model');

module.exports = async function listenForEvents() {
    // ─── User Events ──────────────────────────────────────────────────────────
    await subscribeToQueue('AUTH_SELLER_DASHBOARD.USER_CREATED', async (user) => {
        try {
            if (!user || !user.email) return;
            await userModel.findOneAndUpdate(
                { email: user.email },
                { $set: user },
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing user:', err.message);
        }
    });

    // ─── Product Events ───────────────────────────────────────────────────────
    async function handleProductCreated(product) {
        try {
            if (!product) return;
            const id = product._id || product.id;
            if (!id) return;
            await productModel.findOneAndUpdate(
                { _id: id },
                { $set: { ...product, _id: id } },
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing product created:', err.message);
        }
    }

    await subscribeToQueue('PRODUCT_SELLER_DASHBOARD.PRODUCT_CREATED', handleProductCreated);
    await subscribeToQueue('product.created', handleProductCreated);

    await subscribeToQueue('product.updated', async (product) => {
        try {
            if (!product) return;
            const id = product._id || product.id;
            if (!id) return;
            await productModel.findByIdAndUpdate(id, { $set: product }, { returnDocument: 'after' });
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing product updated:', err.message);
        }
    });

    await subscribeToQueue('product.deleted', async (data) => {
        try {
            const id = data?.productId || data?._id || data?.id;
            if (!id) return;
            await productModel.findByIdAndDelete(id);
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing product deleted:', err.message);
        }
    });

    await subscribeToQueue('inventory.updated', async (data) => {
        try {
            const productId = data?.productId || data?._id || data?.id;
            if (!productId || data?.newStock === undefined) return;
            await productModel.findByIdAndUpdate(
                productId,
                { $set: { stock: data.newStock } },
                { returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing inventory:', err.message);
        }
    });

    // ─── Order Events ─────────────────────────────────────────────────────────
    async function handleOrderCreated(order) {
        try {
            if (!order) return;
            const id = order._id || order.id || order.orderId;
            if (!id) return;

            const orderDoc = {
                ...order,
                _id: id,
                user: order.user || order.userId,
            };

            await orderModel.findOneAndUpdate(
                { _id: id },
                { $set: orderDoc },
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing order created:', err.message);
        }
    }

    await subscribeToQueue('ORDER_SELLER_DASHBOARD.ORDER_CREATED', handleOrderCreated);
    await subscribeToQueue('order.created', handleOrderCreated);

    await subscribeToQueue('order.status_updated', async (data) => {
        try {
            const orderId = data?.orderId || data?._id || data?.id;
            if (!orderId || !data?.newStatus) return;
            await orderModel.findByIdAndUpdate(
                orderId,
                { $set: { status: data.newStatus } },
                { returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing order status update:', err.message);
        }
    });

    await subscribeToQueue('order.cancelled', async (data) => {
        try {
            const orderId = data?.orderId || data?._id || data?.id;
            if (!orderId) return;
            await orderModel.findByIdAndUpdate(
                orderId,
                { $set: { status: 'CANCELLED' } },
                { returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing order cancelled:', err.message);
        }
    });

    // ─── Payment Events ───────────────────────────────────────────────────────
    await subscribeToQueue('PAYMENT_SELLER_DASHBOARD.PAYMENT_CREATED', async (payment) => {
        try {
            if (!payment) return;
            const orderId = payment.order || payment.orderId;
            if (!orderId) return;

            await paymentModel.findOneAndUpdate(
                { order: orderId },
                { $set: { ...payment, order: orderId } },
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing payment created:', err.message);
        }
    });

    async function handlePaymentCompleted(payment) {
        try {
            if (!payment) return;
            const orderId = payment.order || payment.orderId;
            if (!orderId) return;

            await paymentModel.findOneAndUpdate(
                { order: orderId },
                { $set: { status: 'COMPLETED', ...payment, order: orderId } },
                { upsert: true, returnDocument: 'after' }
            );

            // Also update order payment status in read-model
            await orderModel.findByIdAndUpdate(
                orderId,
                { $set: { paymentStatus: 'PAID', status: 'CONFIRMED' } },
                { returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing payment completed:', err.message);
        }
    }

    await subscribeToQueue('PAYMENT_SELLER_DASHBOARD.PAYMENT_UPDATED', handlePaymentCompleted);
    await subscribeToQueue('payment.completed', handlePaymentCompleted);

    await subscribeToQueue('payment.failed', async (payment) => {
        try {
            if (!payment) return;
            const orderId = payment.order || payment.orderId;
            if (!orderId) return;

            await paymentModel.findOneAndUpdate(
                { order: orderId },
                { $set: { status: 'FAILED' } },
                { upsert: true, returnDocument: 'after' }
            );

            await orderModel.findByIdAndUpdate(
                orderId,
                { $set: { paymentStatus: 'FAILED' } },
                { returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing payment failed:', err.message);
        }
    });

    await subscribeToQueue('payment.refunded', async (payment) => {
        try {
            if (!payment) return;
            const orderId = payment.order || payment.orderId;
            if (!orderId) return;

            await paymentModel.findOneAndUpdate(
                { order: orderId },
                { $set: { status: 'REFUNDED', refundId: payment.refundId } },
                { upsert: true, returnDocument: 'after' }
            );

            await orderModel.findByIdAndUpdate(
                orderId,
                { $set: { paymentStatus: 'REFUNDED' } },
                { returnDocument: 'after' }
            );
        } catch (err) {
            console.error('[Seller-Dashboard] Error syncing payment refunded:', err.message);
        }
    });

    console.log('[Seller-Dashboard] All event listeners initialized');
};