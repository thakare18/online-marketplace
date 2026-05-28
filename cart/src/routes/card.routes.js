// place that we will write all the routes related to card(api for card)
const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
// const { addItemToCard } = require('../controller/card.controller');
const cardController = require('../controller/card.controller');
const validation = require('../middleware/validator.middleware');


const router = express.Router();

router.get('/',
    createAuthMiddleware([ 'user' ]),
    cardController.getCart
);


router.post("/items",validation.validateAddItemToCard 
    ,createAuthMiddleware(["user"]), 
    cardController.addItemToCard);

router.patch(
    '/items/:productId',
    validation.validateUpdateCartItem,
    createAuthMiddleware([ 'user' ]),
    cardController.updateItemQuantity
);    






module.exports = router;