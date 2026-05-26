const express = require('express');
const multer = require('multer');
const productController = require('../controllers/product.controller');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { createProductValidators } = require('../validators/product.validator');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// POST /api/products
router.post(
    '/',
    createAuthMiddleware([ 'admin', 'seller' ]),
    upload.array('images', 5),
    createProductValidators,
    productController.createProduct
);

// GET /api/products
router.get('/', productController.getProducts)

// GET /api/products/:id
router.get('/:id', productController.getProductById);


// PATCH /api/products/:id - only seller can update their own products
router.patch("/:id", createAuthMiddleware([ "seller" ]), productController.updateProduct);

// DELETE /api/products/:id - only seller can delete their own products
router.delete("/:id", createAuthMiddleware([ "seller" ]), productController.deleteProduct);


// router.get("/seller", createAuthMiddleware([ "seller" ]), productController.getProductsBySeller);





module.exports = router;