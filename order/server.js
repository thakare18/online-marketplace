require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db');
const { connect } = require('./src/brocker/brocker');



connectDB();
connect();

app.listen(3003, () => {
    console.log('order service is running on port 3003');
}
);
