const paymentModel = require('../models/payment.model');

async function createPayment(req, res) {
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[ 1 ];

    try{
        const orderId = req.params.orderId;

        const orderResponse = await fetch(`http://localhost:3002/api/orders/` + orderId, {
            headers : {
                Authorization : `Bearer ${token}`,

            }
        })

        console.log(orderResponse.data);

        

    }
    catch(err) {
        console.error('Error creating payment:', err);
        res.status(500).json({message: 'Internal server error' });
    }


}



module.exports = {
    createPayment
 };