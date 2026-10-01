const productModel = require('../models/product.model');
const { uploadImage } = require('../../services/imagekit.service');
const mongoose = require('mongoose');
const { publishToQueue } = require('../broker/broker');

// ─── Helper: Standardized Event Publisher ─────────────────────────────────────

/**
 * Publish a standardized product event.
 * Event structure: { event, version, timestamp, data }
 */
async function publishProductEvent(eventName, data) {
    const payload = {
        event: eventName,
        version: 1,
        timestamp: new Date().toISOString(),
        data,
    };

    try {
        await publishToQueue(eventName, payload);
    } catch (err) {
        // Non-fatal: log and continue
        console.warn(`Failed to publish event ${eventName}:`, err.message);
    }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/products
 * Accepts multipart/form-data with fields: title, description, priceAmount, priceCurrency, category, stock, images[] (files)
 */
async function createProduct(req, res) {
    try {
        const { title, description, priceAmount, priceCurrency = 'INR', category } = req.body;
        const stock = req.body.stock !== undefined ? Number(req.body.stock) : 0;
        const seller = req.user.id;

        if (stock < 0) {
            return res.status(400).json({ message: 'Stock cannot be negative' });
        }

        const price = {
            amount: Number(priceAmount),
            currency: priceCurrency,
        };

        // Upload images - handle individual upload failures gracefully
        let images = [];
        if (req.files && req.files.length > 0) {
            const uploadResults = await Promise.allSettled(
                req.files.map(file => uploadImage({ buffer: file.buffer }))
            );
            images = uploadResults
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);

            const failures = uploadResults.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                console.warn(`${failures.length} image(s) failed to upload`);
            }
        }

        const product = await productModel.create({
            title,
            description,
            price,
            seller,
            category,
            images,
            stock
        });

        // Publish standardized events
        await publishProductEvent('product.created', {
            productId: product._id,
            title: product.title,
            price: product.price,
            seller: product.seller,
            category: product.category,
            stock: product.stock,
        });

        // Legacy queue names for backward compatibility
        await publishProductEvent('PRODUCT_SELLER_DASHBOARD.PRODUCT_CREATED', {
            productId: product._id,
            title: product.title,
            price: product.price,
            seller: product.seller,
            stock: product.stock,
        });

        await publishProductEvent('PRODUCT_NOTIFICATION.PRODUCT_CREATED', {
            email: req.user.email,
            productId: product._id,
            sellerId: seller,
        });

        return res.status(201).json({
            message: 'Product created',
            data: product,
        });
    } catch (err) {
        console.error('Create product error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * GET /api/products
 * Supports: q (text search), minprice, maxprice, category, skip, limit
 */
async function getProducts(req, res) {
    try {
        const { q, minprice, maxprice, category } = req.query;

        // Safe, bounded pagination
        const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const filter = {};

        if (q && typeof q === 'string') {
            filter.$text = { $search: String(q) };
        }

        if (minprice !== undefined && !isNaN(Number(minprice))) {
            filter['price.amount'] = { ...filter['price.amount'], $gte: Number(minprice) };
        }

        if (maxprice !== undefined && !isNaN(Number(maxprice))) {
            filter['price.amount'] = { ...filter['price.amount'], $lte: Number(maxprice) };
        }

        if (category && typeof category === 'string') {
            filter.category = String(category);
        }

        const products = await productModel.find(filter).skip(skip).limit(limit);

        return res.status(200).json({ data: products });
    } catch (err) {
        console.error('Get products error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * GET /api/products/:id
 */
async function getProductById(req, res) {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        const product = await productModel.findById(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.status(200).json({ product });
    } catch (err) {
        console.error('Get product by ID error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * PATCH /api/products/:id
 * Sellers can update their own products. Admins can update any.
 */
async function updateProduct(req, res) {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        const product = await productModel.findById(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Admins can update any product; sellers only their own
        if (req.user.role !== 'admin' && product.seller.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden: You can only update your own products' });
        }

        const allowedUpdates = ['title', 'description', 'price', 'category', 'stock'];
        for (const key of Object.keys(req.body)) {
            if (!allowedUpdates.includes(key)) continue;

            if (key === 'price' && typeof req.body.price === 'object') {
                if (req.body.price.amount !== undefined) {
                    const newAmount = Number(req.body.price.amount);
                    if (newAmount < 0) {
                        return res.status(400).json({ message: 'Price cannot be negative' });
                    }
                    product.price.amount = newAmount;
                }
                if (req.body.price.currency !== undefined) {
                    product.price.currency = req.body.price.currency;
                }
            } else if (key === 'stock') {
                const newStock = Number(req.body.stock);
                if (isNaN(newStock) || newStock < 0) {
                    return res.status(400).json({ message: 'Stock cannot be negative' });
                }
                product.stock = newStock;
            } else {
                product[key] = req.body[key];
            }
        }

        await product.save();

        await publishProductEvent('product.updated', {
            productId: product._id,
            title: product.title,
            price: product.price,
            seller: product.seller,
            category: product.category,
            stock: product.stock,
        });

        return res.status(200).json({ message: 'Product updated', product });
    } catch (err) {
        console.error('Update product error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * DELETE /api/products/:id
 * Sellers can delete their own products. Admins can delete any.
 */
async function deleteProduct(req, res) {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        const product = await productModel.findById(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Admins can delete any product; sellers only their own
        if (req.user.role !== 'admin' && product.seller.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden: You can only delete your own products' });
        }

        await productModel.findByIdAndDelete(id);

        await publishProductEvent('product.deleted', {
            productId: product._id,
            seller: product.seller,
        });

        return res.status(200).json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Delete product error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * GET /api/products/seller
 * Returns products owned by the authenticated seller.
 */
async function getProductsBySeller(req, res) {
    try {
        const sellerId = req.user.id;

        const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const products = await productModel.find({ seller: sellerId }).skip(skip).limit(limit);

        return res.status(200).json({ data: products });
    } catch (err) {
        console.error('Get products by seller error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


/**
 * PATCH /api/products/:id/stock
 * Internal stock update endpoint for atomic inventory management.
 * Used by: Order service (to reserve/decrement inventory).
 *
 * Supports:
 *   { action: 'set', quantity: N }     - set stock to N
 *   { action: 'decrement', quantity: N } - safely decrement stock by N (fails if insufficient)
 *   { action: 'increment', quantity: N } - increment stock by N (e.g., restock)
 */
async function updateStock(req, res) {
    try {
        const { id } = req.params;
        const { action, quantity } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product id' });
        }

        const qty = Number(quantity);
        if (isNaN(qty) || qty < 0) {
            return res.status(400).json({ message: 'quantity must be a non-negative number' });
        }

        if (!['set', 'increment', 'decrement'].includes(action)) {
            return res.status(400).json({ message: 'action must be set, increment, or decrement' });
        }

        let product;

        if (action === 'set') {
            product = await productModel.findOneAndUpdate(
                { _id: id },
                { $set: { stock: qty } },
                { returnDocument: 'after', runValidators: true }
            );
        } else if (action === 'increment') {
            product = await productModel.findOneAndUpdate(
                { _id: id },
                { $inc: { stock: qty } },
                { returnDocument: 'after', runValidators: true }
            );
        } else if (action === 'decrement') {
            // Atomic decrement: only decrement if stock >= qty (prevents negative)
            product = await productModel.findOneAndUpdate(
                { _id: id, stock: { $gte: qty } },
                { $inc: { stock: -qty } },
                { returnDocument: 'after', runValidators: true }
            );

            if (!product) {
                // Check if product exists at all
                const exists = await productModel.findById(id);
                if (!exists) {
                    return res.status(404).json({ message: 'Product not found' });
                }
                // Product exists but insufficient stock
                return res.status(409).json({
                    message: 'Insufficient stock',
                    available: exists.stock
                });
            }
        }

        if (!product && action !== 'decrement') {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Publish inventory update event
        await publishProductEvent('inventory.updated', {
            productId: product._id,
            seller: product.seller,
            action,
            quantity: qty,
            newStock: product.stock,
        });

        return res.status(200).json({
            message: 'Stock updated',
            product: {
                id: product._id,
                title: product.title,
                stock: product.stock,
            }
        });
    } catch (err) {
        console.error('Update stock error', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}


module.exports = {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    getProductsBySeller,
    updateStock
};