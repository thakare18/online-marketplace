const mongoose = require('mongoose');



async function connectDB(uri = process.env.MONGO_URI) {

    if (!uri) {
        throw new Error('MONGO_URI is not defined');
    }

    try {
        await mongoose.connect(uri);
        console.log("Database connected successfully");
    }

    catch (error) {
        console.error("Database connection failed:", error);
        throw error;
    }
}


module.exports = connectDB;