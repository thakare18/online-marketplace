const orderModel = require("../models/order.model");
const axios = require("axios");

async function createOrder(req, res) {
    const user = req.user;
    const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];

    try {
        // fetch user cart from cart service
        const cartResponse = await axios.get("http://localhost:3002/api/cards", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const products = await Promise.all(
            cartResponse.data.cart.items.map(async (item) => {
                return (
                    await axios.get(`http://localhost:3001/api/products/${item.productId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    })
                ).data.product;
            })
        );

        let priceAmount = 0;

        const orderItems = cartResponse.data.cart.items.map((item) => {
            const product = products.find(p => p._id === item.productId);

            // if not in stock, does not allow order creation
            if (product.stock < item.quantity) {
                throw new Error(`Product ${product.name} is out of stock or insufficient stock`);
            }

            const itemTotal = product.price.amount * item.quantity;
            priceAmount += itemTotal;

            return {
                product: item.productId,
                quantity: item.quantity,
                price: {
                    amount: itemTotal,
                    currency: product.price.currency
                }
            };
        });

        const order = await orderModel.create({
            user: user.id,
            items: orderItems,
            status: "PENDING",
            totalPrice: {
                amount: priceAmount,
                currency: "INR"
            },
            shippingAddress: {
                street: req.body.shippingAddress.street,
                city: req.body.shippingAddress.city,
                state: req.body.shippingAddress.state,
                zip: req.body.shippingAddress.pincode,
                country: req.body.shippingAddress.country
            }
        });

        res.status(201).json({ order });

    } catch (err) {
        res.status(500).json({
            message: "Internal server error",
            error: err.message
        });
    }
}

async function getMyOrders(req, res) {
    const user = req.user;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        const orders = await orderModel.find({ user: user.id }).skip(skip).limit(limit).exec();
        const totalOrders = await orderModel.countDocuments({ user: user.id });

        res.status(200).json({
            orders,
            meta: {
                total: totalOrders,
                page,
                limit
            }
        })
    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message })
    }
}

module.exports = {
    createOrder,
    getMyOrders

};