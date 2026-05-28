const cardmodel = require('../models/card.model.js');

async function addItemToCard(req, res) {

  const { productId, qty } = req.body;

  const user = req.user;
  const userId = user?._id || user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  let card = await cardmodel.findOne({ user: userId });

  if (!card) {
    card = await cardmodel.create({ user: userId, items: [] });
  }

    const existingItemIndex = card.items.findIndex(item => item.productId.toString() === productId);
    
    if (existingItemIndex >= 0) {
        card.items[existingItemIndex].quantity += qty;
    }
    else {
        card.items.push({ productId, quantity: qty });
    }

    await card.save();

    res.status(200).json({
      message: 'Item added to cart',
      cart: card
    });


}


module.exports = {
    addItemToCard
}