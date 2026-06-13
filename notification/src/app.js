const express = require("express");


const app = express();


app.get("/", (req, res) => {
    res.send("Notification service is up and running");
});


module.exports = app;