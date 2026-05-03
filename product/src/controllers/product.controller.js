const ImageKit = require('imagekit').default;

// Create a new product with image upload
const createProduct = async (req, res) => {
	try {
		const { name, description, price, category } = req.body;

		// Validation
		if (!name || !description || !price || !category) {
			return res.status(400).json({
				success: false,
				message: 'Missing required fields: name, description, price, category',
			});
		}

		// Check if image file is uploaded
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: 'Product image is required',
			});
		}

		// Initialize ImageKit
		const imageKit = new ImageKit({
			publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
			privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
			urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
		});

		// Upload image to ImageKit
		const imageResponse = await imageKit.upload({
			file: req.file.buffer,
			fileName: `${Date.now()}_${req.file.originalname}`,
			folder: '/products',
		});

		// Create product object with image data
		const product = {
			name,
			description,
			price: parseFloat(price),
			category,
			image: {
				url: imageResponse.url,
				fileId: imageResponse.fileId,
				publicUrl: imageResponse.url,
			},
			createdAt: new Date(),
		};

		// Here you would typically save to database
		// For now, returning the product object
		res.status(201).json({
			success: true,
			message: 'Product created successfully',
			data: product,
		});
	} catch (error) {
		console.error('Error creating product:', error);
		res.status(500).json({
			success: false,
			message: 'Error creating product',
			error: error.message,
		});
	}
};

// Get all products
const getProducts = async (req, res) => {
	try {
		// This would typically fetch from database
		res.status(200).json({
			success: true,
			message: 'Products fetched successfully',
			data: [],
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Error fetching products',
			error: error.message,
		});
	}
};

// Get product by ID
const getProductById = async (req, res) => {
	try {
		const { id } = req.params;

		if (!id) {
			return res.status(400).json({
				success: false,
				message: 'Product ID is required',
			});
		}

		// This would typically fetch from database
		res.status(200).json({
			success: true,
			message: 'Product fetched successfully',
			data: null,
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Error fetching product',
			error: error.message,
		});
	}
};

module.exports = {
	createProduct,
	getProducts,
	getProductById,
};
