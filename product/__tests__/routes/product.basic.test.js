const request = require('supertest');
const ImageKit = require('imagekit').default;

jest.mock('../../src/middleware/multer.middleware', () => {
	return {
		single: jest.fn(() => (req, res, next) => {
			// Mock file object
			req.file = {
				buffer: Buffer.from('test'),
				originalname: 'test.jpg',
				mimetype: 'image/jpeg',
			};
			next();
		}),
	};
});

jest.mock('imagekit', () => ({
	default: jest.fn(),
}));

const app = require('../../src/app');

describe('POST /api/products - Basic Test', () => {
	let mockImageKit;

	beforeEach(() => {
		jest.clearAllMocks();
		mockImageKit = {
			upload: jest.fn().mockResolvedValue({
				url: 'https://ik.imagekit.io/demo/products/test.jpg',
				fileId: 'file-123',
			}),
		};
		ImageKit.mockImplementation(() => mockImageKit);
	});

	it('should handle basic product creation', async () => {
		const response = await request(app)
			.post('/api/products')
			.field('name', 'Test Product')
			.field('description', 'Test Description')
			.field('price', '99.99')
			.field('category', 'Electronics');

		console.log('Response status:', response.status);
		console.log('Response body:', response.body);

		expect(response.status).toBe(201);
		expect(response.body.success).toBe(true);
	});
});
