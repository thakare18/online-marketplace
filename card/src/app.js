const express = require('express');
const cardRoutes = require('./routes/card.routes');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(cookieParser());


app.use('/api/cards', cardRoutes); //prefix for all card related routes

module.exports = app;