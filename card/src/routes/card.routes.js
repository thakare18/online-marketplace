// place that we will write all the routes related to card(api for card)
const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { addItemToCard } = require('../controller/card.controller');
const cardController = require('../controller/card.controller');



const router = express.Router();


router.post("/items", createAuthMiddleware(["user"]), cardController.addItemToCard);



module.exports = router;