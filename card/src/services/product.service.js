const axios = require('axios');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001';

/**
 * Fetch a single product from Product service.
 * Returns { product } or throws with a user-friendly error.
 */
async function getProduct(productId, authToken) {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const res = await axios.get(
            `${PRODUCT_SERVICE_URL}/api/products/${productId}`,
            { headers, timeout: 5000 }
        );
        return res.data.product;
    } catch (err) {
        if (err.response) {
            // Product service responded with an error
            const status = err.response.status;
            if (status === 404) {
                const e = new Error('Product not found');
                e.status = 404;
                throw e;
            }
        }
        // Network error or timeout
        const e = new Error('Product service unavailable');
        e.status = 503;
        throw e;
    }
}

/**
 * Atomically update stock via Product service.
 * action: 'decrement' | 'increment' | 'set'
 * quantity: number
 */
async function updateProductStock(productId, action, quantity, authToken) {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const res = await axios.patch(
            `${PRODUCT_SERVICE_URL}/api/products/${productId}/stock`,
            { action, quantity },
            { headers, timeout: 5000 }
        );
        return res.data;
    } catch (err) {
        if (err.response) {
            const status = err.response.status;
            if (status === 409) {
                const e = new Error(err.response.data?.message || 'Insufficient stock');
                e.status = 409;
                e.available = err.response.data?.available;
                throw e;
            }
            if (status === 404) {
                const e = new Error('Product not found');
                e.status = 404;
                throw e;
            }
        }
        const e = new Error('Product service unavailable');
        e.status = 503;
        throw e;
    }
}

module.exports = { getProduct, updateProductStock };
