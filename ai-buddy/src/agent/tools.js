const { tool } = require("@langchain/core/tools"); // two tools one for product search and one for add that product into cart
const { z } = require("zod");
const axios = require("axios");

const searchProducts = tool(
    async ( async  (data) => {
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