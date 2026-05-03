const request = require('supertest');
const ImageKit = require('imagekit').default;

jest.mock('imagekit', () => ({
	default: jest.fn(),
}));

jest.mock('../../src/middleware/multer.middleware', () => {
	return {
		single: jest.fn(() => (req, res, next) => {
			next();
		}),
	};
});

const app = require('../../src/app');

describe('Debug Test', () => {
	let mockImageKit;

	beforeEach(() => {
		jest.clearAllMocks();
		mockImageKit = {
			upload: jest.fn().mockResolvedValue({
				url: 'https://ik.imagekit.io/demo/products/123_test.jpg',
				fileId: 'file-123',
			}),
		};
		ImageKit.mockImplementation(() => mockImageKit);
	});

	it('should show response body on error', async () => {
		const response = await request(app)
			.post('/api/products')
			.field('name', 'Test')
			.field('description', 'Test')
			.field('price', '99')
			.field('category', 'Test')
			.attach('image', Buffer.from('test'), 'test.jpg');

		console.log('Status:', response.status);
		console.log('Body:', JSON.stringify(response.body, null, 2));
		console.log('Text:', response.text);

		// Don't assert, just log for debugging
	});
});
