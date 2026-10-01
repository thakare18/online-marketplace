const mongoose = require('mongoose');
const cardModel = require('../models/card.model.js');
const { getProduct } = require('../services/product.service');

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Get the Bearer token from request (for forwarding to Product service).
 */
function extractToken(req) {
    return req.cookies?.token || req.cookies?.accessToken || req.headers?.authorization?.split(' ')[1];
}

/**
 * Compute cart totals server-side.
 * Never trust client-provided totals.
 */
function computeTotals(items) {
    const itemCount = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + (item.price?.amount ?? 0) * item.quantity, 0);
    // Determine currency from first item (all items in a cart should be same currency)
    const currency = items[0]?.price?.currency ?? 'INR';
    return { itemCount, totalQuantity, subtotal, currency };
}

/**
 * Format a cart for response — strip internal fields, include computed totals.
 */
function formatCart(cart) {
    const items = cart.items.map(item => ({
        productId: item.productId,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        subtotal: parseFloat(((item.price?.amount ?? 0) * item.quantity).toFixed(2)),
    }));

    const totals = computeTotals(cart.items);

    return {
        id: cart._id,
        user: cart.user,
        items,
        totals,
        updatedAt: cart.updatedAt,
    };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/cards
 * Returns the current user's cart with server-computed totals.
 * Creates an empty cart if none exists.
 */
async function getCart(req, res) {
    try {
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }

        let card = await cardModel.findOne({ user: userId });
        if (!card) {
            card = await cardModel.create({ user: userId, items: [] });
        }

        return res.status(200).json({
            cart: formatCart(card),
            totals: computeTotals(card.items),
        });
    } catch (err) {
        console.error('getCart error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * POST /api/cards/items
 * Add a product to cart or increment quantity if already present.
 * Validates product existence, price (fetched from Product service), stock.
 */
async function addItemToCard(req, res) {
    try {
        const { productId, qty } = req.body;
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }

        // Validate productId is valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const quantity = parseInt(qty, 10);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ message: 'Quantity must be a positive integer' });
        }

        // Fetch product from Product service (validates existence + gets authoritative price)
        let product;
        const token = extractToken(req);
        try {
            product = await getProduct(productId, token);
        } catch (err) {
            return res.status(err.status || 503).json({ message: err.message });
        }

        // Get or create cart
        let card = await cardModel.findOne({ user: userId });
        if (!card) {
            card = await cardModel.create({ user: userId, items: [] });
        }

        const existingItemIndex = card.items.findIndex(
            item => item.productId.toString() === productId.toString()
        );

        const newQuantity = existingItemIndex >= 0
            ? card.items[existingItemIndex].quantity + quantity
            : quantity;

        // Stock check: requested total quantity must not exceed available stock
        if (typeof product.stock === 'number' && newQuantity > product.stock) {
            return res.status(409).json({
                message: 'Insufficient stock',
                available: product.stock,
                requested: newQuantity,
            });
        }

        // Use authoritative price from Product service — never trust client
        const price = {
            amount: product.price?.amount ?? 0,
            currency: product.price?.currency ?? 'INR',
        };

        if (existingItemIndex >= 0) {
            card.items[existingItemIndex].quantity = newQuantity;
            card.items[existingItemIndex].price = price;
            card.items[existingItemIndex].title = product.title ?? product.name ?? null;
        } else {
            card.items.push({
                productId,
                quantity,
                price,
                title: product.title ?? product.name ?? null,
            });
        }

        await card.save();

        return res.status(200).json({
            message: 'Item added to cart',
            cart: formatCart(card),
        });
    } catch (err) {
        console.error('addItemToCard error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * PATCH /api/cards/items/:productId
 * Update quantity of an existing cart item.
 * Validates stock and refreshes price from Product service.
 */
async function updateItemQuantity(req, res) {
    try {
        const { productId } = req.params;
        const { qty } = req.body;
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }

        const quantity = parseInt(qty, 10);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ message: 'Quantity must be a positive integer' });
        }

        const card = await cardModel.findOne({ user: userId });
        if (!card) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const existingItemIndex = card.items.findIndex(
            item => item.productId.toString() === productId.toString()
        );

        if (existingItemIndex < 0) {
            return res.status(404).json({ message: 'Item not found' });
        }

        // Refresh product info (validates existence + authoritative price + stock)
        let product;
        const token = extractToken(req);
        try {
            product = await getProduct(productId, token);
        } catch (err) {
            return res.status(err.status || 503).json({ message: err.message });
        }

        // Stock check
        if (typeof product.stock === 'number' && quantity > product.stock) {
            return res.status(409).json({
                message: 'Insufficient stock',
                available: product.stock,
                requested: quantity,
            });
        }

        card.items[existingItemIndex].quantity = quantity;
        // Refresh price snapshot
        card.items[existingItemIndex].price = {
            amount: product.price?.amount ?? card.items[existingItemIndex].price.amount,
            currency: product.price?.currency ?? card.items[existingItemIndex].price.currency,
        };

        await card.save();

        return res.status(200).json({
            message: 'Item updated',
            cart: formatCart(card),
        });
    } catch (err) {
        console.error('updateItemQuantity error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * DELETE /api/cards/items/:productId
 * Remove a specific item from the cart.
 * Idempotent: returns 200 even if item was already removed.
 */
async function removeItemFromCart(req, res) {
    try {
        const { productId } = req.params;
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const card = await cardModel.findOne({ user: userId });
        if (!card) {
            // Idempotent - cart doesn't exist, item effectively gone
            return res.status(200).json({ message: 'Item removed from cart', cart: { items: [], totals: computeTotals([]) } });
        }

        const initialLength = card.items.length;
        card.items = card.items.filter(
            item => item.productId.toString() !== productId.toString()
        );

        await card.save();

        return res.status(200).json({
            message: 'Item removed from cart',
            cart: formatCart(card),
            removed: initialLength !== card.items.length,
        });
    } catch (err) {
        console.error('removeItemFromCart error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * DELETE /api/cards
 * Clear all items from the user's cart.
 * Only affects the authenticated user's own cart.
 */
async function clearCart(req, res) {
    try {
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }

        const card = await cardModel.findOne({ user: userId });
        if (!card) {
            return res.status(200).json({ message: 'Cart is already empty' });
        }

        card.items = [];
        await card.save();

        return res.status(200).json({
            message: 'Cart cleared',
            cart: formatCart(card),
        });
    } catch (err) {
        console.error('clearCart error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


module.exports = {
    getCart,
    addItemToCard,
    updateItemQuantity,
    removeItemFromCart,
    clearCart,
};