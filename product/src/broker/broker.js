const amqplib = require('amqplib');



let channel, connection;

async function connect() {
    if (connection) return connection;
    try {
        connection = await amqplib.connect(process.env.RABBIT_URL);
        console.log('Connected to RabbitMQ');
        channel = await connection.createChannel();

        connection.on('close', () => {
            console.warn('RabbitMQ connection closed');
            connection = null;
            channel = null;
        });

        return connection;
    } catch (error) {
        console.error('Error connecting to RabbitMQ', error.message);
        // Don't crash on unavailable RabbitMQ
    }
}

async function publishToQueue(queueName, data = {}) {
    try {
        if (!channel || !connection) await connect();

        if (!channel) {
            console.warn(`Cannot publish to ${queueName}: RabbitMQ not connected`);
            return;
        }

        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));
        console.log('Message sent to queue', queueName);
    } catch (error) {
        console.error('Error publishing to queue:', error.message);
        channel = null;
    }
}

async function subscribeToQueue(queueName, callback) {
    try {
        if (!channel || !connection) await connect();

        if (!channel) {
            console.warn(`Cannot subscribe to ${queueName}: RabbitMQ not connected`);
            return;
        }

        await channel.assertQueue(queueName, { durable: true });

        channel.consume(queueName, async (msg) => { // Fixed: was 'data', reference to 'msg' was undefined
            if (msg !== null) {
                const message = JSON.parse(msg.content.toString());
                await callback(message);
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error('Error subscribing to queue:', error.message);
    }
}

module.exports = {
    connect,
    publishToQueue,
    subscribeToQueue
};