require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db');


async function startServer() {
    try {
        await connectDB();

        app.listen(3001, () => {
            console.log('Server is running on port 3001');
        });
    } catch (error) {
        console.error('Server startup failed:', error.message);
        process.exit(1);
    }
}

startServer();