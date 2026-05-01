const express = require('express');



const router = express.Router();

router.post('/', (req, res) => {
	res.status(200).json({
		message: 'Product route is working',
	});
});


module.exports = router;