const mongoose = require('mongoose');


const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    price: {
        amount: {
            type: Number,
            required: true,
            min: [0, 'Price cannot be negative']
        },
        currency: {
            type: String,
            enum: ['USD', 'INR'],
            default: 'INR'
        }
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'user'
    },
    category: {
        type: String,
        trim: true,
        default: null
    },
    images: [
        {
            url: String,
            thumbnail: String, // Fixed: was 'tumbnail' (typo)
            id: String
        }
    ],
    stock: {
        type: Number,
        default: 0,
        min: [0, 'Stock cannot be negative']
    }
}, { timestamps: true });

// Text search index on title and description
productSchema.index({ title: 'text', description: 'text' });
// Index for seller queries
productSchema.index({ seller: 1 });
// Index for price filtering
productSchema.index({ 'price.amount': 1 });

module.exports = mongoose.model('Product', productSchema);