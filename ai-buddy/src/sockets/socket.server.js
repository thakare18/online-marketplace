const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const cookie = require('cookie');


async function initSocketServer(httpServer) {

    const io = new Server(httpServer, {});


    io.use((socket, next) => {
        const cookies = cookie.parse(socket.handshake.headers.cookie || '');
        const { token } = cookies;

        if (!token) {
            return next(new Error('token Not provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (error) {
            return next(new Error('Invalid token'));
        }

    });


    io.on('connection', (socket) => {
        console.log('A user connected');
    });


}


module.exports = initSocketServer;