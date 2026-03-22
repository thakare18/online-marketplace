const mongoose = require('mongoose');



async function connectDB(uri = process.env.MONGO_URI || process.env.MONGO_URL) {

    if (!uri) {
        throw new Error('MONGO_URI or MONGO_URL is not defined');
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