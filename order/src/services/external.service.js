const axios = require('axios');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001';
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3002';

// ─── Product Service ──────────────────────────────────────────────────────────

/**
 * Fetch a single product from Product service.
 */
async function getProduct(productId, authToken) {
    try {
        const res = await axios.get(
            `${PRODUCT_SERVICE_URL}/api/products/${productId}`,
            {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                timeout: 5000,
            }
        );
        return res.data.product;
    } catch (err) {
        if (err.response?.status === 404) {
            const e = new Error(`Product ${productId} not found`);
            e.status = 404;
            throw e;
        }
        const e = new Error('Product service unavailable');
        e.status = 503;
        throw e;
    }
}

/**
 * Atomically decrement product stock via Product service.
 * Throws with status=409 if insufficient stock, status=503 if unavailable.
 */
async function decrementProductStock(productId, quantity, authToken) {
    try {
        const res = await axios.patch(
            `${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`,
            { action: 'decrement', quantity },
            {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                timeout: 5000,
            }
        );
        return res.data;
    } catch (err) {
        if (err.response?.status === 409) {
            const e = new Error(err.response.data?.message || 'Insufficient stock');
            e.status = 409;
            e.productId = productId;
            e.available = err.response.data?.available;
            throw e;
        }
        if (err.response?.status === 404) {
            const e = new Error(`Product ${productId} not found`);
            e.status = 404;
            throw e;
        }
        const e = new Error('Product service unavailable');
        e.status = 503;
        throw e;
    }
}

/**
 * Restore (increment) product stock — used in rollback after failed order.
 */
async function incrementProductStock(productId, quantity, authToken) {
    try {
        await axios.patch(
            `${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`,
            { action: 'increment', quantity },
            {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                timeout: 5000,
            }
        );
    } catch (err) {
        // Rollback failure is logged but not thrown — we still need to return the order error
        console.error(`[ROLLBACK WARN] Failed to restore stock for product ${productId}:`, err.message);
    }
}

// ─── Cart Service ─────────────────────────────────────────────────────────────

/**
 * Fetch the user's cart from Cart service.
 */
async function getUserCart(authToken) {
    try {
        const res = await axios.get(
            `${CART_SERVICE_URL}/api/cards`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    Cookie: `token=${authToken}`,
                },
                timeout: 5000,
            }
        );
        return res.data.cart;
    } catch (err) {
        if (err.response?.status === 401) {
            const e = new Error('Cart service: unauthorized');
            e.status = 401;
            throw e;
        }
        const e = new Error('Cart service unavailable');
        e.status = 503;
        throw e;
    }
}

/**
 * Clear the user's cart after successful order creation.
 */
async function clearUserCart(authToken) {
    try {
        await axios.delete(
            `${CART_SERVICE_URL}/api/cards`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    Cookie: `token=${authToken}`,
                },
                timeout: 5000,
            }
        );
    } catch (err) {
        // Cart clearing failure is non-fatal for order — log and continue
        console.error('[ORDER] Failed to clear cart after order creation:', err.message);
    }
}

module.exports = {
    getProduct,
    decrementProductStock,
    incrementProductStock,
    getUserCart,
    clearUserCart,
};
