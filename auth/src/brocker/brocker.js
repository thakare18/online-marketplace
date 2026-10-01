const amqplib = require('amqplib');



let channel, connection;

async function connect() {
    if (connection) return connection;
    try {
        connection = await amqplib.connect(process.env.RABBIT_URL);
        console.log('Connected to RabbitMQ');
        channel = await connection.createChannel();

        // Reconnect on close
        connection.on('close', () => {
            console.warn('RabbitMQ connection closed');
            connection = null;
            channel = null;
        });

        return connection;
    } catch (error) {
        console.error('Error connecting to RabbitMQ', error.message);
        // Don't crash the app if RabbitMQ is unavailable
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
        // Reset channel so next call re-connects
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

        channel.consume(queueName, async (msg) => {
            if (msg === null) return;
            try {
                const raw = JSON.parse(msg.content.toString());
                const message = (raw && typeof raw === 'object' && raw.data !== undefined) ? raw.data : raw;
                await callback(message);
                channel.ack(msg);
            } catch (err) {
                console.error(`[Auth Broker] Error processing message from ${queueName}:`, err.message);
                try { channel.nack(msg, false, false); } catch (_) {}
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