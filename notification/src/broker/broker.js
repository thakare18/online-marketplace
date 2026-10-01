const amqplib = require('amqplib');

let channel, connection;

async function connect() {
    if (connection) return connection;
    try {
        connection = await amqplib.connect(process.env.RABBIT_URL);
        console.log('[Notification Broker] Connected to RabbitMQ');
        channel = await connection.createChannel();

        connection.on('close', () => {
            console.warn('[Notification Broker] RabbitMQ connection closed');
            connection = null;
            channel = null;
        });

        connection.on('error', (err) => {
            console.error('[Notification Broker] RabbitMQ connection error:', err.message);
            connection = null;
            channel = null;
        });

        return connection;
    } catch (error) {
        console.error('[Notification Broker] Error connecting to RabbitMQ:', error.message);
        connection = null;
        channel = null;
    }
}

async function publishToQueue(queueName, data = {}) {
    try {
        if (!channel || !connection) await connect();
        if (!channel) {
            console.warn(`[Notification Broker] Cannot publish to ${queueName}: RabbitMQ not connected`);
            return;
        }
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));
        console.log(`[Notification Broker] Message sent to queue: ${queueName}`);
    } catch (error) {
        console.error('[Notification Broker] Error publishing to queue:', error.message);
        channel = null;
    }
}

/**
 * Subscribe to a queue.
 * Defensive: malformed messages are nacked, not requeued — prevents poison pills.
 * The `data` field of a standardized payload is unwrapped for backward compat.
 */
async function subscribeToQueue(queueName, callback) {
    try {
        if (!channel || !connection) await connect();
        if (!channel) {
            console.warn(`[Notification Broker] Cannot subscribe to ${queueName}: RabbitMQ not connected`);
            return;
        }
        await channel.assertQueue(queueName, { durable: true });

        channel.consume(queueName, async (msg) => {
            if (msg === null) return;
            try {
                const raw = JSON.parse(msg.content.toString());
                // Support both standardized {event, version, data} and legacy flat payloads
                const message = (raw && typeof raw === 'object' && raw.data !== undefined)
                    ? raw.data
                    : raw;
                await callback(message);
                channel.ack(msg);
            } catch (err) {
                console.error(`[Notification Broker] Error processing message from ${queueName}:`, err.message);
                try { channel.nack(msg, false, false); } catch (_) {}
            }
        });
    } catch (error) {
        console.error('[Notification Broker] Error subscribing to queue:', error.message);
    }
}

module.exports = {
    connect,
    publishToQueue,
    subscribeToQueue,
};