// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.IMAGEKIT_PUBLIC_KEY = 'test_public_key';
process.env.IMAGEKIT_PRIVATE_KEY = 'test_private_key';
process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/test';

// Suppress console errors during tests (optional)
global.console.error = jest.fn();
global.console.warn = jest.fn();
