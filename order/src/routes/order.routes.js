const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const orderController = require("../controller/order.controller");

const router = express.Router();

router.post("/", authMiddleware, orderController.createOrder);


module.exports = router;