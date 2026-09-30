// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
process.env.IMAGEKIT_PUBLIC_KEY = 'test_public_key';
process.env.IMAGEKIT_PRIVATE_KEY = 'test_private_key';
process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/test';

// Mock the broker globally so RabbitMQ is never attempted during tests
jest.mock('../src/broker/broker', () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publishToQueue: jest.fn().mockResolvedValue(undefined),
    subscribeToQueue: jest.fn().mockResolvedValue(undefined),
}));

// Suppress console errors/warnings during tests (optional - comment out if debugging)
// global.console.error = jest.fn();
// global.console.warn = jest.fn();
