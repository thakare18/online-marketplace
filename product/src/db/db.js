const mongoose = require('mongoose');

async function connectDB() {
    try{
        await mongoose.connect(process.env.MONGO_URL)
        console.log('Connected to MongoDB');
    }

    catch(error){
        console.log('Error connecting to MongoDB:', error);
        throw error;
    }
}

module.exports = connectDB;