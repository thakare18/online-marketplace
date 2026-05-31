const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({

    order : {
        type : mongoose.Schema.Types.ObjectId, // order id from order service (application)
        required : true,
    },
    paymentId : { // razorpay payment id 
        type : String,
    },
    razorpayOrderId : { // razorpay order id
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
    },
    price : {
        amount : { type : Number, required : true },
        currency : { type : String, required : true, default : 'INR' ,enum : ['INR','USD'] }, 
    }
},
{timestamps : true}
);


const paymentModel = mongoose.model('Payment', paymentSchema);

module.exports = paymentModel;