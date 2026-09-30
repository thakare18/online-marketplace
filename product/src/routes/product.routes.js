const express = require('express');
const multer = require('multer');
const productController = require('../controllers/product.controller');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { createProductValidators, updateStockValidators } = require('../validators/product.validator');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// ─── Public Routes ────────────────────────────────────────────────────────────

// GET /api/products
router.get('/', productController.getProducts);

// GET /api/products/seller - MUST be before /:id to avoid route conflict
router.get('/seller', createAuthMiddleware(['seller', 'admin']), productController.getProductsBySeller);

// GET /api/products/:id
router.get('/:id', productController.getProductById);

// ─── Seller / Admin Routes ────────────────────────────────────────────────────

// POST /api/products
router.post(
    '/',
    createAuthMiddleware(['admin', 'seller']),
    upload.array('images', 5),
    createProductValidators,
    productController.createProduct
);

// PATCH /api/products/:id - seller can update their own; admin can update any
router.patch(
    '/:id',
    createAuthMiddleware(['seller', 'admin']),
    productController.updateProduct
);

// DELETE /api/products/:id - seller can delete their own; admin can delete any
router.delete(
    '/:id',
    createAuthMiddleware(['seller', 'admin']),
    productController.deleteProduct
);

// PATCH /api/products/:id/stock - stock management (seller owns product, or admin)
router.patch(
    '/:id/stock',
    createAuthMiddleware(['seller', 'admin']),
    updateStockValidators,
    productController.updateStock
);

module.exports = router;