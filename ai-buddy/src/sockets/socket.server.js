const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const agent = require('../agent/agent');


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
            socket.token = token;
            next();
        } catch (error) {
            return next(new Error('Invalid token'));
        }

    });


    io.on('connection', (socket) => {

    console.log(socket.user, socket.token);

    socket.on('message', async (data) => {

        const agentResponse = await agent.invoke(
            {
                messages: [
                    {
                        role: "user",
                        content: data
                    }
                ]
            },
            {
                metadata: {
                    token: socket.token
                }
            }
        );

        const lastMessage = agentResponse.messages[ agentResponse.messages.length - 1 ]

        socket.emit('message', lastMessage.content)
    });

});


}


module.exports = initSocketServer;