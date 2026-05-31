const mongoose = require('mongoose');

async function connectDB() {

    try {
        await mongoose.connect(process.env.MONGO_URL)
        console.log('Connected to MongoDB successfully');
    }

    catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }

}

module.exports = connectDB;