require('dotenv').config();
const app = require('./src/app');

const connectDB = require('./src/db/db');
const listener = require('./src/broker/listener');
const { connect } = require('./src/broker/broker')


connectDB();

connect().then(() => {
    listener();// start listening for events after connecting to rabbitmq
})


app.listen(3007, () => {
    console.log("seller dashboard server is running on port 3007");
});