const { Redis } = require('ioredis');


const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    // Disable auto-reconnect retries in test environment
    maxRetriesPerRequest: process.env.NODE_ENV === 'test' ? 0 : 3,
    retryStrategy: (times) => {
        if (process.env.NODE_ENV === 'test') return null; // don't retry in tests
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 100, 3000); // exponential backoff
    },
    lazyConnect: true, // don't connect until first command
});


redis.on('connect', () => {
    console.log('Connected to Redis');
});

redis.on('error', (err) => {
    // Only log errors, don't crash the process
    if (process.env.NODE_ENV !== 'test') {
        console.error('Redis error:', err.message);
    }
});

module.exports = redis;