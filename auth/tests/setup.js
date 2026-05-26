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
                get: jest.fn(),
                set: jest.fn(),
                del: jest.fn(),
            };
        }),
    };
});

const redis = require('../src/db/redis');

let mongoServer;

beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

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
