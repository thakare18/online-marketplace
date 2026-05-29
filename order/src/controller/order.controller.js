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

        console.log("Fetched product :", products)
    }
    catch(err){
        console.error("Error fetching card details:", err.message);
        res.status(500).json({message: "Internal Server Error", error: err.message});
    }

}

module.exports = {
    createOrder
}