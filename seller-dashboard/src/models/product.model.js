const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        category: { type: String, default: '' },
        price: {
            amount: { type: Number, required: true },
            currency: {
                type: String,
                enum: ['USD', 'INR'],
                default: 'INR',
            },
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        images: [
            {
                url: String,
                thumbnail: String,
                id: String,
            },
        ],
        stock: {
            type: Number,
            default: 0,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

productSchema.index({ title: 'text', description: 'text' });
productSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);