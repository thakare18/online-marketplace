const express = require('express');
const cookieParser = require('cookie-parser');
const productRoutes = require('./routes/product.routes');




const app = express();
app.use(cookieParser());
app.use(express.json());

//health check route
app.get('/', (req, res) => {
    res.status(200).json({ message: "Product service is running" });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: "healthy", service: "product", timestamp: new Date().toISOString() });
});

app.use('/api/products', productRoutes);

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Product] Unhandled error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;


