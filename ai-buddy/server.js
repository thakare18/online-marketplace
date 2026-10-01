require('dotenv').config();
const app = require('./src/app');
const http = require('http');

const initSocketServer = require('./src/sockets/socket.server');

const httpServer = http.createServer(app);

const io = initSocketServer(httpServer);

const PORT = process.env.PORT || 3005;

if (process.env.NODE_ENV !== 'test') {
    httpServer.listen(PORT, () => {
        console.log(`AI Buddy Server is running on port ${PORT}`);
    });
}

module.exports = { app, httpServer, io };