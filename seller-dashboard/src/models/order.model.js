const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String,
});

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'user',
        },
        items: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    required: true,
                    ref: 'Product',
                },
                quantity: {
                    type: Number,
                    default: 1,
                    min: 1,
                },
                price: {
                    amount: {
                        type: Number,
                        required: true,
                    },
                    currency: {
                        type: String,
                        required: true,
                        enum: ['USD', 'INR'],
                        default: 'INR',
                    },
                },
            },
        ],
        status: {
            type: String,
            enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'SHIPPED', 'DELIVERED'],
            default: 'PENDING',
        },
        paymentStatus: {
            type: String,
            enum: ['UNPAID', 'PAID', 'REFUNDED', 'FAILED'],
            default: 'UNPAID',
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
                default: 'INR',
            },
        },
        shippingAddress: {
            type: addressSchema,
            default: null,
        },
    },
    { timestamps: true }
);

orderSchema.index({ 'items.product': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

const orderModel = mongoose.model('order', orderSchema);

module.exports = orderModel;