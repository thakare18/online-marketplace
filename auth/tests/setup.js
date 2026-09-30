const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const connectDB = require('../src/db/db');

// Mock Redis to prevent connection attempts during tests
jest.mock('ioredis', () => {
    return {
        Redis: jest.fn().mockImplementation(() => {
            return {
                on: jest.fn(),
                quit: jest.fn().mockResolvedValue('OK'),
                get: jest.fn().mockResolvedValue(null),
                set: jest.fn().mockResolvedValue('OK'),
                del: jest.fn().mockResolvedValue(1),
            };
        }),
    };
});

// Mock RabbitMQ broker to prevent connection attempts during tests
jest.mock('../src/brocker/brocker', () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publishToQueue: jest.fn().mockResolvedValue(undefined),
    subscribeToQueue: jest.fn().mockResolvedValue(undefined),
}));

const redis = require('../src/db/redis');

let mongoServer;

// Use a long enough timeout for MongoMemoryServer startup
jest.setTimeout(60000);

beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
    process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
    process.env.NODE_ENV = 'test';

    // Start an isolated, in-memory MongoDB instance for test runs.
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);
});

afterEach(async () => {
    // Keep tests independent by clearing all collections after each test.
    const collections = mongoose.connection.collections;
    const cleanupPromises = Object.values(collections).map((collection) => collection.deleteMany({}));
    await Promise.all(cleanupPromises);
});

afterAll(async () => {
    // Fully tear down database resources to avoid open-handle warnings.
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    if (mongoServer) {
        await mongoServer.stop();
    }
    // Disconnect from Redis (mocked)
    await redis.quit();
});
