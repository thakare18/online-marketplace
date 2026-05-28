const express = require('express');
const cardRoutes = require('./routes/card.routes');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(cookieParser());


app.use('/api/cards', cardRoutes); //prefix for all card related routes

// Surface async route errors (Express 5 will forward rejected promises here)
app.use((err, req, res, next) => {
	console.error('Unhandled error:', err);
	res.status(500).json({ message: 'Internal server error', error: err?.message });
});

module.exports = app;