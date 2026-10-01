const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'order',
    },
    // Razorpay payment ID — set after successful verification
    paymentId: {
        type: String,
        default: null,
    },
    // Razorpay order ID — set at payment creation
    razorpayOrderId: {
        type: String,
        required: true,
        unique: true, // prevent duplicate payment records for same Razorpay order
        index: true,
    },
    // Razorpay HMAC-SHA256 signature — set after verification
    signature: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ['CREATED', 'COMPLETED', 'FAILED', 'REFUNDED'],
        default: 'CREATED',
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    price: {
        // amount stored in base units (paise for INR) as returned by Razorpay
        amount: { type: Number, required: true },
        currency: { type: String, required: true, default: 'INR', enum: ['INR', 'USD'] },
    },
    // Failure reason from Razorpay, if applicable
    failureReason: {
        type: String,
        default: null,
    },
    // Razorpay refund ID, if refunded
    refundId: {
        type: String,
        default: null,
    },
}, { timestamps: true });

const VALID_TRANSITIONS = {
    CREATED: ['COMPLETED', 'FAILED'],
    COMPLETED: ['REFUNDED'],
    FAILED: [],
    REFUNDED: [],
};

paymentSchema.statics.isValidTransition = function (from, to) {
    return Array.isArray(VALID_TRANSITIONS[from]) && VALID_TRANSITIONS[from].includes(to);
};

const paymentModel = mongoose.model('Payment', paymentSchema);

module.exports = paymentModel;