const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/seller.controller');

const router = express.Router();

// ─── Metrics ─────────────────────────────────────────────────────────────────
router.get('/metrics', createAuthMiddleware(['seller']), controller.getMetrics);

// ─── Orders ──────────────────────────────────────────────────────────────────
router.get('/orders', createAuthMiddleware(['seller']), controller.getOrders);

// ─── Inventory Management ────────────────────────────────────────────────────
router.get('/inventory', createAuthMiddleware(['seller']), controller.getInventory);
router.patch('/inventory/:id', createAuthMiddleware(['seller']), controller.updateInventory);

// ─── Product Management ──────────────────────────────────────────────────────
router.get('/products', createAuthMiddleware(['seller']), controller.getProducts);
router.get('/products/:id', createAuthMiddleware(['seller']), controller.getProductById);
router.post('/products', createAuthMiddleware(['seller']), controller.createProduct);
router.patch('/products/:id', createAuthMiddleware(['seller']), controller.updateProduct);
router.delete('/products/:id', createAuthMiddleware(['seller']), controller.deleteProduct);
router.patch('/products/:id/stock', createAuthMiddleware(['seller']), controller.updateInventory);

module.exports = router;