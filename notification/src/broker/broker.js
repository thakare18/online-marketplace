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

async function publishToQueue(queueName, data={}) {
    if (!channel || !connection) await connect();

    await channel.assertQueue(queueName, {
         durable: true 
        }); // asserting the queue exists or create it if it doesn't exist the queue


    
         channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data))); // rabitmq data transfer in buffer or binary format so we need to convert data into buffer format and send it to queue
         console.log("Message sent to queue", queueName, data);
        
        
      
}  

// for consuming messages from queue subscribe to the queue automatically whenever there is a new message in the queue
async function subscribeToQueue(queueName, callback) {
    if (!channel || !connection) await connect();

    await channel.assertQueue(queueName, {
        durable: true
    });

    channel.consume(queueName, async (data) => {
        if (data !== null) {
            const message = JSON.parse(data.content.toString()); // convert the message from buffer format to json format
          await  callback(message);
            channel.ack(data); // acknowledge the message after processing it
        }
    });

}

module.exports = {
    connect,
    channel,
    connection,
    publishToQueue,
    subscribeToQueue
}