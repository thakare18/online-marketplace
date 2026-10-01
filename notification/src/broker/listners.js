const { subscribeToQueue } = require('./broker');
const sendEmail = require('../email');
const templates = require('../templates/templates');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

// In-memory cache for idempotency deduplication
const processedEvents = new Set();

/**
 * Record notification status in DB if connected (non-fatal).
 */
async function recordNotification({ eventId, recipient, channel = 'EMAIL', event, subject, body, status, error, metadata }) {
    if (mongoose.connection.readyState === 1) {
        try {
            await Notification.create({
                eventId,
                recipient,
                channel,
                event,
                subject,
                body,
                status,
                error,
                metadata,
            });
        } catch (dbErr) {
            console.warn('[Notification] Failed to record notification in DB:', dbErr.message);
        }
    }
}

/**
 * Check if event has already been processed (idempotency guard).
 */
async function isDuplicate(idempotencyKey) {
    if (!idempotencyKey) return false;
    if (processedEvents.has(idempotencyKey)) return true;

    if (mongoose.connection.readyState === 1) {
        try {
            const existing = await Notification.findOne({ eventId: idempotencyKey, status: 'SENT' }).exec();
            if (existing) {
                processedEvents.add(idempotencyKey);
                return true;
            }
        } catch (_) {}
    }
    return false;
}

/**
 * Send template notification safely with idempotency and error recording.
 */
async function sendNotificationSafely({ eventName, data, rawEnvelope, getTemplate, defaultRecipient }) {
    try {
        if (!data || typeof data !== 'object') {
            console.warn(`[Notification] Received empty or invalid data for ${eventName}, skipping.`);
            return;
        }

        const recipient = data.email || defaultRecipient;
        const idempotencyKey = rawEnvelope?.id
            || rawEnvelope?.eventId
            || `${eventName}_${data.orderId || data.paymentId || data.transactionId || data.id || recipient}_${data.newStatus || data.status || ''}`;

        // Idempotency check
        if (await isDuplicate(idempotencyKey)) {
            console.log(`[Notification] Duplicate event detected (${idempotencyKey}), skipping.`);
            return;
        }

        if (!recipient) {
            console.warn(`[Notification] No recipient email available for ${eventName}, skipping delivery.`);
            return;
        }

        const { subject, text, html } = getTemplate(data);
        const result = await sendEmail(recipient, subject, text, html);

        if (result && result.success) {
            processedEvents.add(idempotencyKey);
            await recordNotification({
                eventId: idempotencyKey,
                recipient,
                channel: 'EMAIL',
                event: eventName,
                subject,
                body: text,
                status: 'SENT',
                metadata: { orderId: data.orderId, paymentId: data.paymentId },
            });
        } else {
            await recordNotification({
                eventId: idempotencyKey,
                recipient,
                channel: 'EMAIL',
                event: eventName,
                subject,
                body: text,
                status: 'FAILED',
                error: result?.error || 'Unknown email failure',
                metadata: { orderId: data.orderId },
            });
        }
    } catch (err) {
        console.error(`[Notification] Handler error for ${eventName}:`, err.message);
    }
}

/**
 * Register all notification event listeners.
 */
module.exports = function registerListeners() {
    // ─── AUTH EVENTS ──────────────────────────────────────────────────────────
    subscribeToQueue('AUTH_NOTIFICATION.USER_CREATED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'user.created',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.userCreated(d),
            defaultRecipient: data?.email,
        });
    });

    // ─── PAYMENT EVENTS ───────────────────────────────────────────────────────
    subscribeToQueue('PAYMENT_NOTIFICATION.PAYMENT_INITIATED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'payment.initiated',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.paymentInitiated(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'payment.completed',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.paymentCompleted(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('PAYMENT_NOTIFICATION.PAYMENT_FAILED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'payment.failed',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.paymentFailed(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('PAYMENT_NOTIFICATION.PAYMENT_REFUNDED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'payment.refunded',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.paymentRefunded(d),
            defaultRecipient: data?.email,
        });
    });

    // ─── PRODUCT EVENTS ───────────────────────────────────────────────────────
    subscribeToQueue('PRODUCT_NOTIFICATION.PRODUCT_CREATED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'product.created',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.productCreated(d),
            defaultRecipient: data?.email,
        });
    });

    // ─── ORDER EVENTS ─────────────────────────────────────────────────────────
    subscribeToQueue('order.created', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'order.created',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.orderCreated(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('ORDER_NOTIFICATION.ORDER_CREATED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'order.created',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.orderCreated(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('order.cancelled', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'order.cancelled',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.orderCancelled(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('ORDER_NOTIFICATION.ORDER_CANCELLED', async (data, raw) => {
        await sendNotificationSafely({
            eventName: 'order.cancelled',
            data,
            rawEnvelope: raw,
            getTemplate: (d) => templates.orderCancelled(d),
            defaultRecipient: data?.email,
        });
    });

    subscribeToQueue('order.status_updated', async (data, raw) => {
        const status = data?.newStatus;
        let templateFn = (d) => templates.genericNotification(`Order status updated to ${status}`, d);

        if (status === 'CONFIRMED') templateFn = (d) => templates.orderConfirmed(d);
        else if (status === 'SHIPPED') templateFn = (d) => templates.orderShipped(d);
        else if (status === 'DELIVERED') templateFn = (d) => templates.orderDelivered(d);
        else if (status === 'CANCELLED') templateFn = (d) => templates.orderCancelled(d);

        await sendNotificationSafely({
            eventName: `order.${String(status).toLowerCase()}`,
            data,
            rawEnvelope: raw,
            getTemplate: templateFn,
            defaultRecipient: data?.email,
        });
    });

    console.log('[Notification] All event listeners initialized');
};

module.exports.processedEvents = processedEvents;
module.exports.sendNotificationSafely = sendNotificationSafely;
