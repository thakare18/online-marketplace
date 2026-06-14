require('dotenv').config();
const app = require('./src/app');

const connectDB = require('./src/db/db');


connectDB();



app.listen(3007, () => {
    console.log("seller dashboard server is running on port 3007");
});