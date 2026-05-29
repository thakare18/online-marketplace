// order creation logic here. 
const orderModel = require("../models/order.model");
const axios = require("axios");


async function createOrder(req,res){
    const user = req.user; // we get this from auth middleware
    const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1]; // support both cookie and header token

    try{
        // Fetch user card from card service
        const cardResponse = await axios.get("http://localhost:3002/api/cards", {
            headers: {
                Authorization: `Bearer ${token}`
            }

        })
        const products = await Promise.all(cardResponse.data.cart.items.map(async (item) => {
            // Fetch product details from product service
            return (await axios.get(`http://localhost:3001/api/products/${item.productId}`,{
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })).data.product;
        }))

        let priceAmount = 0;


        const orderItems = cardResponse.data.cart.items.map((item, index) => {


            const product = products.find(p => p._id === item.productId);

            // if not in stock , them does not allow to order creation

            if(product.stock < item.quantity){ // stock is less than quantity in cart if true then throw error product is out of stock

                throw new Error(`Product ${product.name} is out of stock`);
            }


            const itemTotal = product.price.amount * item.quantity;
            priceAmount += itemTotal;
            return {
                product: item.productId,
                quantity: item.quantity,
                price: {
                    amount: itemTotal,
                    currency: product.price.currency
                }
            }
        })
        console.log("Total Price Amount:", priceAmount);
        console.log(orderItems);
    }
    catch(err){
        console.error("Error fetching card details:", err.message);
        res.status(500).json({message: "Internal Server Error", error: err.message});
    }

}

module.exports = {
    createOrder
}