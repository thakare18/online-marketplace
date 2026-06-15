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


app.use('/api/products', productRoutes);

module.exports = app;


