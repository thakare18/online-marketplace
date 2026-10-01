const amqplib = require('amqplib');



let channel,connection;

async function connect(){ // thet connect channel and connection to rabbitmq

    if (connection) return connection;
    try {
        connection = await amqplib.connect(process.env.RABBIT_URL);
        console.log("Connected to RabbitMQ");
        channel = await connection.createChannel();
    }
    catch (error) {
        console.error("Error connecting to RabbitMQ", error);
    }
}

// for publishing and consuming messages in queue .

async function publishToQueue(queueName, data = {}) {
    try {
        if (!channel || !connection) await connect();
        if (!channel) {
            console.warn(`[Seller-Dashboard Broker] Cannot publish to ${queueName}: RabbitMQ not connected`);
            return;
        }
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));
        console.log("Message sent to queue", queueName);
    } catch (error) {
        console.error("[Seller-Dashboard Broker] Error publishing to queue:", error.message);
        channel = null;
    }
}  

// for consuming messages from queue subscribe to the queue automatically whenever there is a new message in the queue
async function subscribeToQueue(queueName, callback) {
    try {
        if (!channel || !connection) await connect();
        if (!channel) {
            console.warn(`[Seller-Dashboard Broker] Cannot subscribe to ${queueName}: RabbitMQ not connected`);
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
                console.error(`[Seller-Dashboard Broker] Error processing message from ${queueName}:`, err.message);
                try { channel.nack(msg, false, false); } catch (_) {}
            }
        });
    } catch (error) {
        console.error("[Seller-Dashboard Broker] Error subscribing to queue:", error.message);
    }
}

module.exports = {
    connect,
    channel,
    connection,
    publishToQueue,
    subscribeToQueue
}