/**
 * Reusable notification templates for email notifications.
 * Each template returns { subject, text, html }.
 */

function formatName(name) {
    if (!name) return 'Customer';
    if (typeof name === 'object') {
        const { firstName = '', lastName = '' } = name;
        return `${firstName} ${lastName}`.trim() || 'Customer';
    }
    return String(name).trim() || 'Customer';
}

const templates = {
    // ─── User / Auth Events ───────────────────────────────────────────────────
    userCreated(data = {}) {
        const name = formatName(data.fullName || data.username || data.name);
        return {
            subject: 'Welcome to our Marketplace!',
            text: `Dear ${name},\n\nThank you for signing up. We're excited to have you on board!\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #2b6cb0;">Welcome to our Marketplace!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Thank you for signing up. We are thrilled to welcome you to our growing community of buyers and sellers.</p>
                    <p>Explore thousands of products and enjoy seamless shopping today!</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    // ─── Order Events ─────────────────────────────────────────────────────────
    orderCreated(data = {}) {
        const name = formatName(data.username || data.name);
        const orderId = data.orderId || data._id || 'N/A';
        const total = data.totalPrice ? `${data.totalPrice.currency || 'INR'} ${data.totalPrice.amount}` : 'N/A';

        return {
            subject: `Order Confirmation - #${orderId}`,
            text: `Dear ${name},\n\nYour order #${orderId} has been successfully placed. Total: ${total}.\n\nWe will notify you when it ships.\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #2b6cb0;">Order Placed Successfully!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Thank you for your order. We have received it and are getting it ready for processing.</p>
                    <div style="background-color: #f7fafc; border-left: 4px solid #3182ce; padding: 12px; margin: 16px 0;">
                        <p style="margin: 0;"><strong>Order ID:</strong> ${orderId}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Total Amount:</strong> ${total}</p>
                    </div>
                    <p>We will send you another update as soon as your items are confirmed and shipped.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    orderConfirmed(data = {}) {
        const name = formatName(data.username || data.name);
        const orderId = data.orderId || data._id || 'N/A';

        return {
            subject: `Order Confirmed - #${orderId}`,
            text: `Dear ${name},\n\nGreat news! Your order #${orderId} has been confirmed and is being prepared for dispatch.\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #38a169;">Order Confirmed!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Great news! Your order <strong>#${orderId}</strong> has been confirmed by our sellers and is being prepared for dispatch.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    orderShipped(data = {}) {
        const name = formatName(data.username || data.name);
        const orderId = data.orderId || data._id || 'N/A';
        const tracking = data.trackingNumber || 'Available shortly';

        return {
            subject: `Your Order #${orderId} Has Shipped!`,
            text: `Dear ${name},\n\nYour order #${orderId} is on its way!\nTracking: ${tracking}\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #3182ce;">Your Order Has Shipped!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Your order <strong>#${orderId}</strong> is on its way to you.</p>
                    <p><strong>Tracking Information:</strong> ${tracking}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    orderDelivered(data = {}) {
        const name = formatName(data.username || data.name);
        const orderId = data.orderId || data._id || 'N/A';

        return {
            subject: `Delivered: Your Order #${orderId}`,
            text: `Dear ${name},\n\nYour order #${orderId} has been successfully delivered. We hope you enjoy your purchase!\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #38a169;">Your Package Has Been Delivered!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Your order <strong>#${orderId}</strong> has been marked as delivered. We hope you love your purchase!</p>
                    <p>If you have any feedback or concerns, please don't hesitate to contact our support.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    orderCancelled(data = {}) {
        const name = formatName(data.username || data.name);
        const orderId = data.orderId || data._id || 'N/A';
        const reason = data.reason || 'Requested by customer or order cancelled prior to fulfillment.';

        return {
            subject: `Order Cancelled - #${orderId}`,
            text: `Dear ${name},\n\nYour order #${orderId} has been cancelled.\nReason: ${reason}\n\nIf you were charged, a refund will be initiated automatically.\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #e53e3e;">Order Cancelled</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Your order <strong>#${orderId}</strong> has been cancelled.</p>
                    <p><strong>Details:</strong> ${reason}</p>
                    <p>If payment was already deducted, a full refund has been scheduled.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    // ─── Payment Events ───────────────────────────────────────────────────────
    paymentInitiated(data = {}) {
        const name = formatName(data.username || data.name);
        const currency = data.currency || 'INR';
        const amount = data.amount || '0.00';

        return {
            subject: 'Payment Initiated',
            text: `Dear ${name},\n\nYour payment of ${currency} ${amount} has been initiated. We will notify you once the transaction is completed.\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #3182ce;">Payment Initiated</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Your payment of <strong>${currency} ${amount}</strong> has been initiated. We will notify you once the transaction is completed.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    paymentCompleted(data = {}) {
        const name = formatName(data.username || data.name);
        const currency = data.currency || 'INR';
        const amount = data.amount || '0.00';
        const txId = data.transactionId || data.paymentId || 'N/A';

        return {
            subject: 'Payment Successful - Receipt',
            text: `Dear ${name},\n\nWe have received your payment of ${currency} ${amount}. Transaction ID: ${txId}.\n\nThank you for your purchase!\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #38a169;">Payment Successful!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>We have successfully received your payment of <strong>${currency} ${amount}</strong>.</p>
                    <div style="background-color: #f7fafc; border-left: 4px solid #38a169; padding: 12px; margin: 16px 0;">
                        <p style="margin: 0;"><strong>Transaction ID:</strong> ${txId}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Amount Paid:</strong> ${currency} ${amount}</p>
                    </div>
                    <p>Thank you for your purchase!</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    paymentFailed(data = {}) {
        const name = formatName(data.username || data.name);
        const orderId = data.orderId || 'N/A';
        const reason = data.reason || 'Transaction could not be completed';

        return {
            subject: 'Payment Failed - Action Required',
            text: `Dear ${name},\n\nUnfortunately, your payment for order ID: ${orderId} has failed.\nReason: ${reason}\n\nPlease try again or contact support if the issue persists.\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #e53e3e;">Payment Failed</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Unfortunately, your payment for order <strong>#${orderId}</strong> could not be processed.</p>
                    <p style="color: #c53030;"><strong>Reason:</strong> ${reason}</p>
                    <p>Please review your payment details and try again, or use an alternative payment method.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    paymentRefunded(data = {}) {
        const name = formatName(data.username || data.name);
        const currency = data.currency || 'INR';
        const amount = data.amount || '0.00';
        const refundId = data.refundId || 'N/A';
        const orderId = data.orderId || 'N/A';

        return {
            subject: 'Refund Processed',
            text: `Dear ${name},\n\nA refund of ${currency} ${amount} has been processed for order #${orderId}.\nRefund ID: ${refundId}\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #3182ce;">Refund Processed</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>A refund of <strong>${currency} ${amount}</strong> has been successfully processed for order <strong>#${orderId}</strong>.</p>
                    <p><strong>Refund ID:</strong> ${refundId}</p>
                    <p>The funds will reflect in your original payment method in 3-5 business days.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    // ─── Product Events ───────────────────────────────────────────────────────
    productCreated(data = {}) {
        const name = formatName(data.username || data.name);
        const productTitle = data.title || 'Special Item';

        return {
            subject: 'New Product Available!',
            text: `Dear ${name},\n\nCheck out our newly launched product: ${productTitle}!\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #2b6cb0;">New Product Available!</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>Check out our latest product: <strong>${productTitle}</strong>.</p>
                    <p>Visit the marketplace to discover exclusive launch offers today!</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },

    // ─── Generic Fallback ─────────────────────────────────────────────────────
    genericNotification(eventName, data = {}) {
        const name = formatName(data.username || data.name);
        return {
            subject: `Notification: ${eventName}`,
            text: `Dear ${name},\n\nYou have an update regarding: ${eventName}.\n\nBest regards,\nThe Marketplace Team`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #2b6cb0;">Marketplace Notification</h2>
                    <p>Dear <strong>${name}</strong>,</p>
                    <p>You have received an update regarding <strong>${eventName}</strong>.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">Best regards,<br/><strong>The Marketplace Team</strong></p>
                </div>
            `,
        };
    },
};

module.exports = templates;
