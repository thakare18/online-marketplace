const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const orderController = require("../controller/order.controller");
const validation = require("../middleware/validation.middleware");

const router = express.Router();

router.post("/", authMiddleware, validation.createOrderValidation, orderController.createOrder);


module.exports = router;