async function publishToQueue(queueName, data) {
    console.log(`[Mock Broker] Publishing to ${queueName}:`, data);
    return true;
}

module.exports = { publishToQueue };