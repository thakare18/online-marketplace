const { subscribeToQueue } = require("./broker")
const userModel = require("../models/user.model")
const productModel = require("../models/product.model")



module.exports = async function listenForEvents() {

    await subscribeToQueue("AUTH_SELLER_DASHBOARD.USER_CREATED", async (user) => {
        // Handle user created event
        await userModel.create(user);
    });

    await subscribeToQueue("AUTH_SELLER_DASHBOARD.PRODUCT_CREATED", async (product) => {
        // Handle product created event, if product is created by seller then that replicate on seller-dashboard
        await productModel.create(product);
    });

}