const { subscribeToQueue } = require("./broker")
const userModel = require("../models/user.model")



module.exports = async function listenForEvents() {

    await subscribeToQueue("AUTH_SELLER_DASHBOARD.USER_CREATED", async (user) => {
        // Handle user created event
        await userModel.create(user);
    });

}