const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        eventId: {
            type: String,
            index: true,
            sparse: true,
        },
        recipient: {
            type: String,
            required: true,
            trim: true,
        },
        channel: {
            type: String,
            enum: ['EMAIL', 'SMS', 'PUSH'],
            default: 'EMAIL',
        },
        event: {
            type: String,
            required: true,
        },
        subject: {
            type: String,
            default: '',
        },
        body: {
            type: String,
            default: '',
        },
        status: {
            type: String,
            enum: ['SENT', 'FAILED', 'SKIPPED'],
            default: 'SENT',
        },
        error: {
            type: String,
            default: null,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Compound index to help check idempotency per event and recipient
notificationSchema.index({ eventId: 1, recipient: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
