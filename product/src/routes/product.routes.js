const express = require('express');
const multer = require('multer');
const productController = require('../controllers/product.controller');
const createAuthMiddleware = require('../middleware/auth.middleware');


const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// post /api/products
router.post('/', createAuthMiddleware([ 'admin', 'seller' ]),upload.array('images', 5), productController.createProduct);

module.exports = router;