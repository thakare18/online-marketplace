const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const orderController = require("../controller/order.controller");
const validation = require("../middleware/validation.middleware");

const router = express.Router();

router.post("/",authMiddleware(), validation.createOrderValidation, orderController.createOrder);

router.get("/me",authMiddleware(), orderController.getMyOrders); 

router.post("/:id/cancel", authMiddleware(["user"]), orderController.cancelOrderById);

router.get("/:id",authMiddleware(["user", "admin"]), orderController.getOrderById);



module.exports = router;