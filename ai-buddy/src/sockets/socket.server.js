const { server } = require("socket.io");


async function initSocketServer(httpServer) {

    const io = new server(httpServer, {});

    io.on('connection', (socket) => {
        console.log('A user connected');
    });


}


module.exports = initSocketServer;