const request = require('supertest');
const ImageKit = require('imagekit').default;

// Mock ImageKit before importing app
jest.mock('imagekit', () => ({
	default: jest.fn(),
}));

// Mock multer middleware to inject file object
jest.mock('../../src/middleware/multer.middleware', () => {
	return {
		single: jest.fn(() => (req, res, next) => {
			next();
		}),
	};
});

const app = require('../../src/app');

describe('POST /api/products', () => {
	let mockImageKit;

	beforeEach(() => {
		jest.clearAllMocks();
		mockImageKit = {
			upload: jest.fn().mockResolvedValue({
				url: 'https://ik.imagekit.io/demo/products/123_test.jpg',
				fileId: 'file-123',
				name: '123_test.jpg',
			}),
		};
		ImageKit.mockImplementation(() => mockImageKit);
	});

	describe('Successful product creation', () => {
		it('should create a product with valid data and image', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Test Product')
				.field('description', 'Test Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe('Product created successfully');
			expect(response.body.data).toHaveProperty('name', 'Test Product');
			expect(response.body.data).toHaveProperty('price', 99.99);
			expect(response.body.data.image).toHaveProperty('url');
			expect(response.body.data.image).toHaveProperty('fileId');
		});

		it('should return 201 status for successful product creation', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Laptop')
				.field('description', 'High-performance laptop')
				.field('price', '1299.99')
				.field('category', 'Computers')
				.attach('image', Buffer.from('fake image data'), 'laptop.png');

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
		});

		it('should include all product fields in response', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Mouse')
				.field('description', 'Wireless mouse')
				.field('price', '29.99')
				.field('category', 'Accessories')
				.attach('image', Buffer.from('fake image data'), 'mouse.jpg');

			expect(response.status).toBe(201);
			expect(response.body.data).toHaveProperty('name', 'Mouse');
			expect(response.body.data).toHaveProperty('description', 'Wireless mouse');
			expect(response.body.data).toHaveProperty('category', 'Accessories');
			expect(response.body.data).toHaveProperty('createdAt');
		});
	});

	describe('Missing required fields', () => {
		it('should return 400 when name is missing', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('description', 'Test Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Missing required fields');
		});

		it('should return 400 when description is missing', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it('should return 400 when price is missing', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it('should return 400 when category is missing', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it('should return 400 when all fields are missing', async () => {
			const response = await request(app)
				.post('/api/products')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Missing required fields');
		});
	});

	describe('Missing image file', () => {
		it('should return 400 when image is not provided', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Product image is required');
		});
	});

	describe('Price validation', () => {
		it('should convert price string to number', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '150.50')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.data.price).toBe(150.5);
			expect(typeof response.body.data.price).toBe('number');
		});

		it('should handle decimal prices correctly', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.data.price).toBe(99.99);
		});

		it('should handle integer prices', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '100')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.data.price).toBe(100);
		});
	});

	describe('ImageKit integration', () => {
		it('should call ImageKit upload', async () => {
			await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(mockImageKit.upload).toHaveBeenCalled();
		});

		it('should pass fileName to ImageKit upload', async () => {
			await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			const uploadCall = mockImageKit.upload.mock.calls[0][0];
			expect(uploadCall.fileName).toContain('_test.jpg');
		});

		it('should upload to products folder', async () => {
			await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			const uploadCall = mockImageKit.upload.mock.calls[0][0];
			expect(uploadCall.folder).toBe('/products');
		});

		it('should include image URL in response', async () => {
			const mockUrl = 'https://ik.imagekit.io/demo/products/123_test.jpg';
			mockImageKit.upload.mockResolvedValue({
				url: mockUrl,
				fileId: 'file-123',
			});

			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.data.image.url).toBe(mockUrl);
		});

		it('should include fileId in response', async () => {
			const mockFileId = 'file-xyz-789';
			mockImageKit.upload.mockResolvedValue({
				url: 'https://ik.imagekit.io/demo/products/123_test.jpg',
				fileId: mockFileId,
			});

			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.data.image.fileId).toBe(mockFileId);
		});

		it('should handle ImageKit upload error', async () => {
			mockImageKit.upload.mockRejectedValue(new Error('ImageKit upload failed'));

			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Error creating product');
		});

		it('should include error message in response', async () => {
			const errorMsg = 'Authentication failed';
			mockImageKit.upload.mockRejectedValue(new Error(errorMsg));

			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.error).toBe(errorMsg);
		});
	});

	describe('Response structure', () => {
		it('should return success flag in response', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body).toHaveProperty('success');
			expect(response.body.success).toBe(true);
		});

		it('should return message in response', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body).toHaveProperty('message');
			expect(typeof response.body.message).toBe('string');
		});

		it('should return data object in response', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body).toHaveProperty('data');
			expect(typeof response.body.data).toBe('object');
		});

		it('should have correct data structure with all fields', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Test Product')
				.field('description', 'Test Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			const { data } = response.body;
			expect(data).toHaveProperty('name', 'Test Product');
			expect(data).toHaveProperty('description', 'Test Description');
			expect(data).toHaveProperty('price', 99.99);
			expect(data).toHaveProperty('category', 'Electronics');
			expect(data).toHaveProperty('image');
			expect(data.image).toHaveProperty('url');
			expect(data.image).toHaveProperty('fileId');
			expect(data.image).toHaveProperty('publicUrl');
		});

		it('should have createdAt timestamp', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.body.data).toHaveProperty('createdAt');
			expect(new Date(response.body.data.createdAt)).toBeInstanceOf(Date);
		});
	});

	describe('Edge cases', () => {
		it('should handle product name with special characters', async () => {
			const specialName = 'Product @#$% Test & Co.';
			const response = await request(app)
				.post('/api/products')
				.field('name', specialName)
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(201);
			expect(response.body.data.name).toBe(specialName);
		});

		it('should handle very long product description', async () => {
			const longDescription = 'A'.repeat(1000);
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', longDescription)
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(201);
			expect(response.body.data.description.length).toBe(1000);
		});

		it('should handle zero price', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Free Product')
				.field('description', 'Description')
				.field('price', '0')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(201);
			expect(response.body.data.price).toBe(0);
		});

		it('should handle very large price', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Expensive Product')
				.field('description', 'Description')
				.field('price', '999999.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(201);
			expect(response.body.data.price).toBe(999999.99);
		});

		it('should reject empty name', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', '')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it('should reject empty description', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', '')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(400);
		});
	});

	describe('Content-Type', () => {
		it('should accept multipart/form-data requests', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.status).toBe(201);
		});

		it('should return application/json response', async () => {
			const response = await request(app)
				.post('/api/products')
				.field('name', 'Product')
				.field('description', 'Description')
				.field('price', '99.99')
				.field('category', 'Electronics')
				.attach('image', Buffer.from('fake image data'), 'test.jpg');

			expect(response.type).toMatch(/application\/json/);
		});
	});
});
