const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    // Price snapshot: authoritative price fetched from Product service at time of add/update.
    // Never trust client-provided price.
    price: {
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            enum: ["USD", "INR"],
            default: "INR",
        },
    },
    // Product title snapshot for display (denormalized for performance)
    title: {
        type: String,
        default: null,
    },
}, { _id: true });

const cardSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true, // one cart per user
        },
        items: [cartItemSchema],
    },
    { timestamps: true }
);

const Card = mongoose.model("Card", cardSchema);

module.exports = Card;