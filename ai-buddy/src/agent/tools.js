const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");
const mongoose = require("mongoose");

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://localhost:3001";
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || "http://localhost:3002";
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://localhost:3003";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.SERVICE_TIMEOUT_MS, 10) || 5000;

/**
 * Safely extracts auth token from context or input
 */
function extractToken(ctx, input) {
    return ctx?.metadata?.token || ctx?.configurable?.token || ctx?.token || input?.token || null;
}

/**
 * Normalizes downstream service errors safely without leaking internals or credentials
 */
function handleServiceError(error, serviceName) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return JSON.stringify({
            error: `${serviceName} is currently unavailable. Please try again later.`
        });
    }
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return JSON.stringify({
            error: `${serviceName} request timed out. Please try again.`
        });
    }
    if (error.response) {
        const status = error.response.status;
        const msg = error.response.data?.message || error.response.data?.error;
        if (status === 404) {
            return JSON.stringify({ error: msg || "Requested item was not found." });
        }
        if (status === 401 || status === 403) {
            return JSON.stringify({ error: "Access denied: You do not have permission to view or modify this resource." });
        }
        if (status === 400 || status === 409) {
            return JSON.stringify({ error: msg || "Invalid request or stock conflict." });
        }
        return JSON.stringify({ error: msg || `${serviceName} returned status ${status}.` });
    }
    return JSON.stringify({ error: `An unexpected issue occurred while communicating with ${serviceName}.` });
}

// ─── 1. Product Search ────────────────────────────────────────────────────────
const searchProducts = tool(
    async ({ query }, ctx) => {
        if (!query || typeof query !== 'string' || !query.trim()) {
            return JSON.stringify({ error: "Search query must be a non-empty string" });
        }

        try {
            const token = extractToken(ctx);
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const response = await axios.get(`${PRODUCT_SERVICE_URL}/api/products`, {
                params: { q: query.trim() },
                headers,
                timeout: DEFAULT_TIMEOUT_MS
            });

            const products = response.data?.data || response.data?.products || [];
            if (!Array.isArray(products) || products.length === 0) {
                return JSON.stringify({
                    message: `No products found matching '${query.trim()}'.`,
                    products: []
                });
            }

            const formatted = products.slice(0, 10).map(p => ({
                id: p._id,
                title: p.title,
                price: p.price ? `${p.price.amount} ${p.price.currency}` : undefined,
                stock: p.stock,
                category: p.category,
                description: p.description
            }));

            return JSON.stringify({
                count: formatted.length,
                products: formatted
            });
        } catch (error) {
            return handleServiceError(error, "Product Service");
        }
    },
    {
        name: "searchProducts",
        description: "Search products in the marketplace based on a query keyword or product title",
        schema: z.object({
            query: z.string().describe("Search query for products")
        })
    }
);

// ─── 2. Product Details ───────────────────────────────────────────────────────
const getProductDetails = tool(
    async ({ productId }, ctx) => {
        if (!productId || typeof productId !== 'string' || !mongoose.Types.ObjectId.isValid(productId)) {
            return JSON.stringify({ error: "Invalid product ID format. Must be a valid 24-character hexadecimal ID." });
        }

        try {
            const token = extractToken(ctx);
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const response = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`, {
                headers,
                timeout: DEFAULT_TIMEOUT_MS
            });

            const p = response.data?.product || response.data;
            if (!p || !p._id) {
                return JSON.stringify({ error: "Product not found." });
            }

            return JSON.stringify({
                id: p._id,
                title: p.title,
                description: p.description,
                price: p.price ? `${p.price.amount} ${p.price.currency}` : undefined,
                stock: p.stock,
                category: p.category,
                seller: p.seller
            });
        } catch (error) {
            return handleServiceError(error, "Product Service");
        }
    },
    {
        name: "getProductDetails",
        description: "Get detailed information about a specific product by its ID",
        schema: z.object({
            productId: z.string().describe("ID of the product to view")
        })
    }
);

// ─── 3. View Current User's Cart ──────────────────────────────────────────────
const getCart = tool(
    async (_, ctx) => {
        const token = extractToken(ctx);
        if (!token) {
            return JSON.stringify({ error: "Authentication required to view your cart. Please sign in." });
        }

        try {
            const response = await axios.get(`${CART_SERVICE_URL}/api/cards`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const cart = response.data?.cart || response.data?.card || response.data;
            const items = (cart?.items || []).map(item => ({
                productId: item.product?._id || item.product,
                title: item.product?.title || undefined,
                quantity: item.quantity,
                price: item.price ? `${item.price.amount} ${item.price.currency}` : undefined
            }));

            return JSON.stringify({
                itemCount: items.length,
                items,
                totalPrice: cart?.totalPrice || 0
            });
        } catch (error) {
            return handleServiceError(error, "Cart Service");
        }
    },
    {
        name: "getCart",
        description: "Get the current authenticated user's shopping cart items, quantities, and total price",
        schema: z.object({}).describe("No parameters required; uses user authentication session")
    }
);

// ─── 4. Add Product to Cart ───────────────────────────────────────────────────
const addProductToCart = tool(
    async ({ productId, qty = 1 }, ctx) => {
        const token = extractToken(ctx);
        if (!token) {
            return JSON.stringify({ error: "Authentication required to add products to your cart. Please sign in." });
        }

        if (!productId || typeof productId !== 'string' || !mongoose.Types.ObjectId.isValid(productId)) {
            return JSON.stringify({ error: "Invalid product ID format. Must be a valid 24-character hexadecimal ID." });
        }

        const quantity = Number(qty);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return JSON.stringify({ error: "Quantity must be a positive integer greater than 0." });
        }

        try {
            // Note: canonical endpoint is /api/cards/items
            const response = await axios.post(`${CART_SERVICE_URL}/api/cards/items`, {
                productId,
                qty: quantity
            }, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: DEFAULT_TIMEOUT_MS
            });

            return JSON.stringify({
                success: true,
                message: `Successfully added product ${productId} (quantity: ${quantity}) to your shopping cart.`,
                cart: response.data?.cart || response.data
            });
        } catch (error) {
            return handleServiceError(error, "Cart Service");
        }
    },
    {
        name: "addProductToCart",
        description: "Add a specified quantity of a product to the user's shopping cart",
        schema: z.object({
            productId: z.string().describe("ID of the product to add to the cart"),
            qty: z.number().int().positive().default(1).describe("Quantity of the product to add (defaults to 1)")
        })
    }
);

// ─── 5. Get User Orders ───────────────────────────────────────────────────────
const getUserOrders = tool(
    async (_, ctx) => {
        const token = extractToken(ctx);
        if (!token) {
            return JSON.stringify({ error: "Authentication required to view your orders. Please sign in." });
        }

        try {
            const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders/me`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const orders = response.data?.orders || [];
            if (!Array.isArray(orders) || orders.length === 0) {
                return JSON.stringify({ message: "You have not placed any orders yet.", orders: [] });
            }

            const formatted = orders.map(o => ({
                orderId: o._id,
                status: o.status,
                paymentStatus: o.paymentStatus,
                totalPrice: o.totalPrice,
                itemCount: o.items?.length || 0,
                createdAt: o.createdAt
            }));

            return JSON.stringify({
                count: formatted.length,
                orders: formatted
            });
        } catch (error) {
            return handleServiceError(error, "Order Service");
        }
    },
    {
        name: "getUserOrders",
        description: "Get order history and current status for all orders placed by the current authenticated user",
        schema: z.object({}).describe("No parameters required; uses user authentication session")
    }
);

// ─── 6. Get Order Details ─────────────────────────────────────────────────────
const getOrderDetails = tool(
    async ({ orderId }, ctx) => {
        const token = extractToken(ctx);
        if (!token) {
            return JSON.stringify({ error: "Authentication required to view order details. Please sign in." });
        }

        if (!orderId || typeof orderId !== 'string' || !mongoose.Types.ObjectId.isValid(orderId)) {
            return JSON.stringify({ error: "Invalid order ID format. Must be a valid 24-character hexadecimal ID." });
        }

        try {
            const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders/${orderId}`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const order = response.data?.order || response.data;
            if (!order || !order._id) {
                return JSON.stringify({ error: "Order not found." });
            }

            return JSON.stringify({
                orderId: order._id,
                status: order.status,
                paymentStatus: order.paymentStatus,
                totalPrice: order.totalPrice,
                items: (order.items || []).map(i => ({
                    productId: i.product,
                    quantity: i.quantity,
                    price: i.price
                })),
                address: order.address,
                createdAt: order.createdAt
            });
        } catch (error) {
            return handleServiceError(error, "Order Service");
        }
    },
    {
        name: "getOrderDetails",
        description: "Get full details, items, shipping address, and tracking status for a specific order by order ID",
        schema: z.object({
            orderId: z.string().describe("ID of the order to check")
        })
    }
);

module.exports = {
    searchProducts,
    getProductDetails,
    getCart,
    addProductToCart,
    getUserOrders,
    getOrderDetails,
    extractToken,
    handleServiceError
};