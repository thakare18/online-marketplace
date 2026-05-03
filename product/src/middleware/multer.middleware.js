const multer = require('multer');

// Configure multer for memory storage (storing buffer in memory)
const storage = multer.memoryStorage();

// File filter for image validation
const fileFilter = (req, file, cb) => {
	// Allowed image types
	const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

	if (allowedMimes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(new Error('Only image files are allowed (jpeg, png, gif, webp)'), false);
	}
};

// Create multer middleware
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit
	},
});

module.exports = upload;
