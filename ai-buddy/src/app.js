const express = require('express');


const app = express();

app.get('/', (req, res) => {
    res.status(200).send('Ai service is running');
});

module.exports = app;