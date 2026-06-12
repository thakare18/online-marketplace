const mongoose = require('mongoose');



async function connectDB(uri = process.env.MONGO_URI || process.env.MONGO_URL) {

    if (!uri) {
        throw new Error('MONGO_URI or MONGO_URL is not defined');
    }

    try {
        const allowInsecureTls = String(process.env.MONGO_TLS_INSECURE || '').toLowerCase() === 'true';

        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            tls: true,
            tlsAllowInvalidCertificates: allowInsecureTls
        });
        console.log("Database connected successfully");
    }

    catch (error) {
        console.error("Database connection failed:", error);
        throw error;
    }
}


module.exports = connectDB;