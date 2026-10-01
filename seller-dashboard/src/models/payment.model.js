const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
            ref: 'order',
        },
        paymentId: {
            type: String,
            default: null,
        },
        razorpayOrderId: {
            type: String,
            required: true,
            index: true,
        },
        signature: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: ['CREATED', 'PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
            default: 'CREATED',
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        price: {
            amount: { type: Number, required: true },
            currency: { type: String, required: true, default: 'INR', enum: ['INR', 'USD'] },
        },
        refundId: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

const paymentModel = mongoose.model('Payment', paymentSchema);

module.exports = paymentModel;