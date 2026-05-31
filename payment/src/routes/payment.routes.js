const express = require('express');
const createAuthMiddleware = require('../middlewares/auth.middleware');
const  paymentController = require('../controllers/payment.controller');



const router = express.Router();


router.post('/create/:orderId', createAuthMiddleware([ "user" ]), paymentController.createPayment); // 1st middleware then  2nd controller


module.exports = router; // export router to be used in app.js