require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db');
const { connect } = require('./src/brocker/brocker');

connectDB();
connect();

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});