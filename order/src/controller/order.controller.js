// order creation logic here. 
const orderModel = require("../models/order.model");
const axios = require("axios");


async function createOrder(req,res){
    const user = req.user; // we get this from auth middleware
    const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1]; // support both cookie and header token

    try{
        // Fetch user card from card service
        const cardResponse = await axios.get("http://localhost:3002/api/card", {
            headers: {
                Authorization: `Bearer ${token}`
            }

        })
        console.log("Card service response:", cardResponse.data);
    }
    catch(err){
        console.error("Error fetching card details:", err.message);
        res.status(500).json({message: "Internal Server Error", error: err.message});
    }

}

module.exports = {
    createOrder
}