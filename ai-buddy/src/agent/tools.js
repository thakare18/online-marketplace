const { tool } = require("@langchain/core/tools"); // two tools one for product search and one for add that product into cart
const { z } = require("zod");
const axios = require("axios");

const searchProducts = tool(
    async ( async  ({query, token}) => {

        console.log("searchProducts called with data :", {query, token})

        const response = await axios.get(`http://localhost:3001/api/products?q=${data.query}`,{
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        return JSON.stringify(response.data); // all tools returns data in string format


    },
    {
        name: "searchProducts",
        description: "search product based on query",
        schema: z.object({
            query: z.string().describe("search query for product")
        })
    
    } )
);

const addProductToCart = tool(async ({productId, qty=1, token})=>{

    const response = await axios.post(`http://localhost:3002/api/cart/items`,{
        productId,
        qty
    },{
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return `Added product with id ${productId} (qty: ${qty}) to cart `

},
{
    name: "addProductToCart",
    description: "add a product to shopping cart",
    schema: z.object({
        productId: z.string().describe("id of the product to added to the cart"),
        qty: z.number().describe("the quantity of the product to add to the cart").default(1),
    })
})

module.exports = {
    searchProducts,
    addProductToCart
}