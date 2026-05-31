const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({

    order : {
        type : mongoose.Schema.Types.ObjectId, // order id from order service (application)
        required : true,
    },
    paymentId : { // razorpay payment id 
        type : String,
    },
    orderId : { // razorpay order id
        type : String,
        required : true,
    },
    signature : { // razorpay signature
        type : String,
    },
    status : {
        type : String,
        enum : ['PENDING', 'COMPLETED', 'FAILED'],
        default : 'PENDING',
    },
    user : {
        type : mongoose.Schema.Types.ObjectId, 
        required : true,
    }
},
{timestamps : true}
);


const paymentModel = mongoose.model('Payment', paymentSchema);

module.exports = paymentModel;