const mongoose = require('mongoose');


const addressSchema = new mongoose.Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
});

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Product',
    },
    // Snapshot of product title at order time — preserved even if product changes/deletes
    title: {
        type: String,
        default: null,
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1,
    },
    // Unit price at order time — NEVER derived from current product price after order creation
    price: {
        amount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            required: true,
            enum: ['USD', 'INR'],
        },
    },
});

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    items: [orderItemSchema],
    status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
        default: 'PENDING',
    },
    totalPrice: {
        amount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            required: true,
            enum: ['USD', 'INR'],
        },
    },
    shippingAddress: {
        type: addressSchema,
        required: true,
    },
    // Payment service compatibility — updated by Payment service via event/API
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PAID', 'REFUNDED', 'FAILED'],
        default: 'UNPAID',
    },
    paymentId: {
        type: String,
        default: null,
    },
}, { timestamps: true });


// Valid status transitions — enforced in controller
orderSchema.statics.isValidTransition = function (from, to) {
    const transitions = {
        PENDING: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['DELIVERED'],
        DELIVERED: [],
        CANCELLED: [],
    };
    return (transitions[from] || []).includes(to);
};

const orderModel = mongoose.model('order', orderSchema);

module.exports = orderModel;