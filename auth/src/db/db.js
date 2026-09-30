const mongoose = require('mongoose');



async function connectDB(uri = process.env.MONGO_URI || process.env.MONGO_URL) {

    if (!uri) {
        throw new Error('MONGO_URI or MONGO_URL is not defined');
    }

    try {
        // Only enable TLS for non-local/non-test connections
        const isLocalOrTest = uri.startsWith('mongodb://') || process.env.NODE_ENV === 'test';
        const allowInsecureTls = String(process.env.MONGO_TLS_INSECURE || '').toLowerCase() === 'true';

        const options = {
            serverSelectionTimeoutMS: 10000,
        };

        if (!isLocalOrTest) {
            options.tls = true;
            options.tlsAllowInvalidCertificates = allowInsecureTls;
        }

        await mongoose.connect(uri, options);
        console.log('Database connected successfully');
    }

    catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
}


module.exports = connectDB;