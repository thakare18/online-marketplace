const express = require('express');
const upload = require('../middleware/multer.middleware');
const { createProduct, getProducts, getProductById } = require('../controllers/product.controller');

const router = express.Router();

// POST - Create a new product with image upload
router.post('/', upload.single('image'), createProduct);

// GET - Get all products
router.get('/', getProducts);

// GET - Get product by ID
router.get('/:id', getProductById);

module.exports = router;