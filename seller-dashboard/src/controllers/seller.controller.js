const mongoose = require('mongoose');
const axios = require('axios');
const userModel = require('../models/user.model');
const productModel = require('../models/product.model');
const orderModel = require('../models/order.model');
const paymentModel = require('../models/payment.model');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

function getSellerId(req) {
    return req.user?.id || req.user?._id;
}

function extractToken(req) {
    return req.cookies?.token || req.cookies?.accessToken || req.headers?.authorization?.split(' ')[1];
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/**
 * GET /api/seller/dashboard/metrics
 * Comprehensive seller metrics:
 * - Products: total, active, inactive, low stock, total inventory
 * - Orders: total, pending, confirmed, shipped, delivered, cancelled
 * - Financial: sales (units sold), revenue, top products
 * - Payments: completed count & amount, refunded count & amount
 */
async function getMetrics(req, res) {
    try {
        const sellerId = getSellerId(req);
        if (!sellerId) {
            return res.status(401).json({ message: 'Unauthorized: Seller context missing' });
        }

        const lowStockThreshold = Math.max(1, parseInt(req.query.lowStockThreshold, 10) || 5);

        // 1. Fetch all products for this seller
        const products = await productModel.find({ seller: sellerId }).exec();
        const sellerProductIds = new Set(products.map(p => p._id.toString()));

        // Products breakdown
        const totalProducts = products.length;
        const activeProducts = products.filter(p => p.isActive !== false).length;
        const inactiveProducts = products.filter(p => p.isActive === false).length;
        const lowStockProducts = products.filter(p => p.stock <= lowStockThreshold);
        const totalInventoryUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);

        // 2. Fetch all orders containing seller's products
        const matchingProductObjectIds = Array.from(sellerProductIds).map(id => new mongoose.Types.ObjectId(id));
        const orders = await orderModel
            .find({ 'items.product': { $in: matchingProductObjectIds } })
            .exec();

        // Order counts by status
        const ordersByStatus = {
            total: orders.length,
            pending: 0,
            confirmed: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0,
        };

        let sales = 0; // total units sold from valid fulfilled orders
        let revenue = 0; // total revenue from seller's items in valid orders
        const productSales = {}; // productId -> quantity sold

        orders.forEach(order => {
            const statusKey = String(order.status).toLowerCase();
            if (ordersByStatus[statusKey] !== undefined) {
                ordersByStatus[statusKey] += 1;
            }

            // Calculate revenue and sales only for confirmed, shipped, or delivered orders
            const isRevenueOrder = ['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status);

            if (Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const itemProdId = item.product ? item.product.toString() : '';
                    if (sellerProductIds.has(itemProdId)) {
                        const qty = Number(item.quantity) || 0;
                        const price = Number(item.price?.amount) || 0;

                        if (isRevenueOrder) {
                            sales += qty;
                            revenue += price * qty;
                            productSales[itemProdId] = (productSales[itemProdId] || 0) + qty;
                        }
                    }
                });
            }
        });

        // Top 5 products by units sold
        const topProducts = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([productId, qty]) => {
                const prod = products.find(p => p._id.toString() === productId);
                return prod
                    ? {
                          id: prod._id,
                          title: prod.title,
                          sold: qty,
                          price: prod.price,
                      }
                    : null;
            })
            .filter(Boolean);

        // 3. Payment information for seller's orders
        const orderIds = orders.map(o => o._id);
        const payments = await paymentModel.find({ order: { $in: orderIds } }).exec();

        const completedPayments = payments.filter(p => p.status === 'COMPLETED');
        const refundedPayments = payments.filter(p => p.status === 'REFUNDED');

        const paymentsSummary = {
            completedCount: completedPayments.length,
            refundedCount: refundedPayments.length,
            completedAmount: completedPayments.reduce((acc, p) => acc + (p.price?.amount ? (p.price.amount > 1000 ? p.price.amount / 100 : p.price.amount) : 0), 0),
        };

        return res.status(200).json({
            // Legacy top-level keys for backward compatibility
            sales,
            revenue,
            topProducts,
            // Enhanced metrics
            products: {
                total: totalProducts,
                active: activeProducts,
                inactive: inactiveProducts,
                totalInventoryUnits,
                lowStockCount: lowStockProducts.length,
                lowStockItems: lowStockProducts.map(p => ({
                    id: p._id,
                    title: p.title,
                    stock: p.stock,
                })),
            },
            orders: ordersByStatus,
            payments: paymentsSummary,
        });
    } catch (error) {
        console.error('[Seller-Dashboard] Error fetching metrics:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * GET /api/seller/dashboard/orders
 * Returns only orders containing the seller's products.
 * Items from other sellers are stripped out.
 * Supports pagination (?page=1&limit=20) and status filtering (?status=CONFIRMED).
 */
async function getOrders(req, res) {
    try {
        const sellerId = getSellerId(req);
        if (!sellerId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;
        const statusFilter = req.query.status ? String(req.query.status).toUpperCase() : null;

        // 1. Get seller's product IDs
        const products = await productModel.find({ seller: sellerId }).select('_id').exec();
        const sellerProductIds = new Set(products.map(p => p._id.toString()));
        const matchingProductObjectIds = Array.from(sellerProductIds).map(id => new mongoose.Types.ObjectId(id));

        // 2. Query filter
        const query = { 'items.product': { $in: matchingProductObjectIds } };
        if (statusFilter) {
            query.status = statusFilter;
        }

        const [rawOrders, totalMatchingOrders] = await Promise.all([
            orderModel
                .find(query)
                .populate('user', 'username email fullName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            orderModel.countDocuments(query),
        ]);

        // 3. Filter order items to only seller's items and compute seller portion
        const filteredOrders = rawOrders
            .map(order => {
                const orderObj = order.toObject();
                const sellerItems = (orderObj.items || []).filter(item => {
                    const itemProdId = item.product?._id ? item.product._id.toString() : item.product ? item.product.toString() : '';
                    return sellerProductIds.has(itemProdId);
                });

                if (sellerItems.length === 0) return null;

                const sellerTotalAmount = sellerItems.reduce(
                    (acc, item) => acc + (Number(item.price?.amount) || 0) * (Number(item.quantity) || 0),
                    0
                );

                return {
                    ...orderObj,
                    items: sellerItems,
                    sellerSubtotal: {
                        amount: sellerTotalAmount,
                        currency: sellerItems[0]?.price?.currency || 'INR',
                    },
                };
            })
            .filter(Boolean);

        // Backward compatibility: respond with array directly if client doesn't use meta, but attach pagination header / meta
        res.setHeader('X-Total-Count', totalMatchingOrders);
        res.setHeader('X-Page', page);
        res.setHeader('X-Limit', limit);

        if (req.query.paginated === 'true') {
            return res.status(200).json({
                orders: filteredOrders,
                meta: {
                    total: totalMatchingOrders,
                    page,
                    limit,
                    pages: Math.ceil(totalMatchingOrders / limit),
                },
            });
        }

        return res.status(200).json(filteredOrders);
    } catch (error) {
        console.error('[Seller-Dashboard] Error fetching orders:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

// ─── Products ────────────────────────────────────────────────────────────────

/**
 * GET /api/seller/dashboard/products
 * Returns products belonging strictly to the authenticated seller.
 */
async function getProducts(req, res) {
    try {
        const sellerId = getSellerId(req);
        if (!sellerId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const filter = { seller: sellerId };
        if (req.query.status === 'active') filter.isActive = true;
        if (req.query.status === 'inactive') filter.isActive = false;
        if (req.query.search) {
            filter.$text = { $search: String(req.query.search) };
        }

        const [products, total] = await Promise.all([
            productModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
            productModel.countDocuments(filter),
        ]);

        res.setHeader('X-Total-Count', total);

        if (req.query.paginated === 'true') {
            return res.status(200).json({
                products,
                meta: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        }

        return res.status(200).json(products);
    } catch (error) {
        console.error('[Seller-Dashboard] Error fetching products:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

/**
 * GET /api/seller/dashboard/products/:id
 * Get single product if owned by the seller.
 */
async function getProductById(req, res) {
    try {
        const { id } = req.params;
        const sellerId = getSellerId(req);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const product = await productModel.findById(id).exec();
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (req.user.role !== 'admin' && product.seller.toString() !== sellerId.toString()) {
            return res.status(403).json({ message: 'Forbidden: You do not own this product' });
        }

        return res.status(200).json(product);
    } catch (error) {
        console.error('[Seller-Dashboard] Error fetching product:', error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

/**
 * POST /api/seller/dashboard/products
 * Create product — proxies to Product service to ensure consistency,
 * and replicates into local read-model.
 */
async function createProduct(req, res) {
    const token = extractToken(req);
    const sellerId = getSellerId(req);

    try {
        let createdProduct = null;

        // Call Product service
        try {
            const response = await axios.post(`${PRODUCT_SERVICE_URL}/api/products`, req.body, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': req.headers['content-type'] || 'application/json',
                },
                timeout: 5000,
            });
            createdProduct = response.data?.product || response.data;
        } catch (apiErr) {
            // If Product service is unreachable in tests / isolated runs, create in local model
            if (apiErr.response) {
                return res.status(apiErr.response.status).json(apiErr.response.data);
            }
            console.warn('[Seller-Dashboard] Product service call failed, writing to read-model:', apiErr.message);
        }

        if (!createdProduct) {
            createdProduct = await productModel.create({
                ...req.body,
                seller: sellerId,
            });
        } else {
            // Sync to local read-model
            await productModel.findOneAndUpdate(
                { _id: createdProduct._id },
                { $set: { ...createdProduct, seller: sellerId } },
                { upsert: true, new: true }
            );
        }

        return res.status(201).json({
            message: 'Product created successfully',
            product: createdProduct,
        });
    } catch (error) {
        console.error('[Seller-Dashboard] Error creating product:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

/**
 * PATCH /api/seller/dashboard/products/:id
 * Update product — verifies ownership and calls Product service.
 */
async function updateProduct(req, res) {
    const { id } = req.params;
    const token = extractToken(req);
    const sellerId = getSellerId(req);

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const existing = await productModel.findById(id).exec();
        if (existing && req.user.role !== 'admin' && existing.seller.toString() !== sellerId.toString()) {
            return res.status(403).json({ message: 'Forbidden: You do not own this product' });
        }

        let updatedProduct = null;
        try {
            const response = await axios.patch(`${PRODUCT_SERVICE_URL}/api/products/${id}`, req.body, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000,
            });
            updatedProduct = response.data?.product || response.data;
        } catch (apiErr) {
            if (apiErr.response) {
                return res.status(apiErr.response.status).json(apiErr.response.data);
            }
        }

        if (!updatedProduct) {
            updatedProduct = await productModel.findByIdAndUpdate(
                id,
                { $set: req.body },
                { new: true, runValidators: true }
            );
        } else {
            await productModel.findByIdAndUpdate(id, { $set: updatedProduct }, { new: true });
        }

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.status(200).json({
            message: 'Product updated successfully',
            product: updatedProduct,
        });
    } catch (error) {
        console.error('[Seller-Dashboard] Error updating product:', error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

/**
 * DELETE /api/seller/dashboard/products/:id
 * Delete product — verifies ownership and calls Product service.
 */
async function deleteProduct(req, res) {
    const { id } = req.params;
    const token = extractToken(req);
    const sellerId = getSellerId(req);

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const existing = await productModel.findById(id).exec();
        if (existing && req.user.role !== 'admin' && existing.seller.toString() !== sellerId.toString()) {
            return res.status(403).json({ message: 'Forbidden: You do not own this product' });
        }

        try {
            await axios.delete(`${PRODUCT_SERVICE_URL}/api/products/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000,
            });
        } catch (apiErr) {
            if (apiErr.response && apiErr.response.status !== 404) {
                return res.status(apiErr.response.status).json(apiErr.response.data);
            }
        }

        await productModel.findByIdAndDelete(id);

        return res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('[Seller-Dashboard] Error deleting product:', error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

// ─── Inventory Management ────────────────────────────────────────────────────

/**
 * GET /api/seller/dashboard/inventory
 * Inventory visibility for the seller:
 * - list of products with current stock
 * - low stock filter (?lowStock=true)
 * - inventory summary
 */
async function getInventory(req, res) {
    try {
        const sellerId = getSellerId(req);
        if (!sellerId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const lowStockThreshold = Math.max(1, parseInt(req.query.threshold, 10) || 5);
        const filter = { seller: sellerId };

        if (req.query.lowStock === 'true') {
            filter.stock = { $lte: lowStockThreshold };
        }

        const products = await productModel
            .find(filter)
            .select('title stock price isActive createdAt updatedAt')
            .sort({ stock: 1 }) // lowest stock first
            .exec();

        const totalStock = products.reduce((acc, p) => acc + (p.stock || 0), 0);
        const lowStockCount = products.filter(p => p.stock <= lowStockThreshold).length;

        const inventoryItems = products.map(p => ({
            id: p._id,
            title: p.title,
            stock: p.stock,
            isLowStock: p.stock <= lowStockThreshold,
            price: p.price,
            isActive: p.isActive,
            updatedAt: p.updatedAt,
        }));

        return res.status(200).json({
            items: inventoryItems,
            summary: {
                totalProducts: products.length,
                totalStock,
                lowStockCount,
                lowStockThreshold,
            },
        });
    } catch (error) {
        console.error('[Seller-Dashboard] Error fetching inventory:', error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

/**
 * PATCH /api/seller/dashboard/inventory/:id
 * and PATCH /api/seller/dashboard/products/:id/stock
 * Updates product stock using Product service stock endpoint.
 */
async function updateInventory(req, res) {
    const { id } = req.params;
    const token = extractToken(req);
    const sellerId = getSellerId(req);

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        // Ownership check
        const product = await productModel.findById(id).exec();
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (req.user.role !== 'admin' && product.seller.toString() !== sellerId.toString()) {
            return res.status(403).json({ message: 'Forbidden: You do not own this product' });
        }

        // Support both { stock: number } and { action, quantity }
        let payload = req.body;
        if (req.body.stock !== undefined && req.body.action === undefined) {
            const stockVal = Number(req.body.stock);
            if (isNaN(stockVal) || stockVal < 0) {
                return res.status(400).json({ message: 'Stock must be a non-negative number' });
            }
            payload = { action: 'set', quantity: stockVal };
        }

        let updatedStock = null;
        try {
            const response = await axios.patch(`${PRODUCT_SERVICE_URL}/api/products/${id}/stock`, payload, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000,
            });
            updatedStock = response.data?.stock ?? response.data?.product?.stock;
        } catch (apiErr) {
            if (apiErr.response) {
                return res.status(apiErr.response.status).json(apiErr.response.data);
            }
        }

        // Fallback local update
        if (updatedStock === null || updatedStock === undefined) {
            const action = payload.action || 'set';
            const qty = Number(payload.quantity || payload.stock) || 0;

            if (action === 'set') product.stock = qty;
            else if (action === 'increment') product.stock += qty;
            else if (action === 'decrement') product.stock = Math.max(0, product.stock - qty);
            await product.save();
        } else {
            product.stock = updatedStock;
            await product.save();
        }

        return res.status(200).json({
            message: 'Inventory updated successfully',
            productId: product._id,
            stock: product.stock,
        });
    } catch (error) {
        console.error('[Seller-Dashboard] Error updating inventory:', error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

module.exports = {
    getMetrics,
    getOrders,
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getInventory,
    updateInventory,
};