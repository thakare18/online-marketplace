const express = require('express');
const cookieParser = require('cookie-parser');

const orderRoutes = require('./routes/order.routes');


const app = express();
app.use(express.json());
app.use(cookieParser());


app.use("/api/orders", orderRoutes); // this is prefix for all order related routes, we will define the actual routes in order.routes.js file



module.exports = app;