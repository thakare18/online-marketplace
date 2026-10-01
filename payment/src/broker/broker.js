const amqplib = require('amqplib');

let channel, connection;

async function connect() {
    if (connection) return connection;
    try {
        connection = await amqplib.connect(process.env.RABBIT_URL);
        console.log('[Payment Broker] Connected to RabbitMQ');
        channel = await connection.createChannel();

        connection.on('close', () => {
            console.warn('[Payment Broker] RabbitMQ connection closed');
            connection = null;
            channel = null;
        });

        connection.on('error', (err) => {
            console.error('[Payment Broker] RabbitMQ connection error:', err.message);
            connection = null;
            channel = null;
        });

        return connection;
    } catch (error) {
        console.error('[Payment Broker] Error connecting to RabbitMQ:', error.message);
        connection = null;
        channel = null;
        // Non-fatal — payment service continues without RabbitMQ
    }
}

/**
 * Publish a standardized event to a queue.
 * Non-fatal: logs warning if RabbitMQ is unavailable.
 */
async function publishToQueue(queueName, data = {}) {
    try {
        if (!channel || !connection) await connect();
        if (!channel) {
            console.warn(`[Payment Broker] Cannot publish to ${queueName}: RabbitMQ not connected`);
            return;
        }
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));
        console.log(`[Payment Broker] Message sent to queue: ${queueName}`);
    } catch (error) {
        console.error('[Payment Broker] Error publishing to queue:', error.message);
        channel = null; // reset so next call retries connection
    }
}

/**
 * Subscribe to a queue with defensive message handling.
 * A malformed/erroring message will be nacked (not crash the service).
 */
async function subscribeToQueue(queueName, callback) {
    try {
        if (!channel || !connection) await connect();
        if (!channel) {
            console.warn(`[Payment Broker] Cannot subscribe to ${queueName}: RabbitMQ not connected`);
            return;
        }
        await channel.assertQueue(queueName, { durable: true });

        channel.consume(queueName, async (msg) => {
            if (msg === null) return;
            try {
                const message = JSON.parse(msg.content.toString());
                await callback(message);
                channel.ack(msg);
            } catch (err) {
                console.error(`[Payment Broker] Error processing message from ${queueName}:`, err.message);
                // nack without requeue to avoid poison-pill infinite loop
                try { channel.nack(msg, false, false); } catch (_) {}
            }
        });
    } catch (error) {
        console.error('[Payment Broker] Error subscribing to queue:', error.message);
    }
}

module.exports = {
    connect,
    publishToQueue,
    subscribeToQueue,
};