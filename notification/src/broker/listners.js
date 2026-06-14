const { subscribeToQueue } = require("./broker");

module.exports = function () {
    subscribeToQueue("AUTH_NOTIFICATION.USER_CREATED", async (data) => {
    console.log("Received message from queue", data);
});
}