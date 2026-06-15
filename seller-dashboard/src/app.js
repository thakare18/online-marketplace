const express = require('express');
const cookieParser = require('cookie-parser');
const sellerRoutes = require('./routes/seller.routes');

const app = express();


app.use(cookieParser());
app.use(express.json());
app.use('/api/seller/dashboard', sellerRoutes); // prefix all seller dashboard routes with /api/seller/dashboard

module.exports = app;