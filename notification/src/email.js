const nodemailer = require('nodemailer');

let customTransporter = null;

function createDefaultTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: process.env.EMAIL_USER,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN,
        },
    });
}

function getTransporter() {
    if (customTransporter) return customTransporter;
    return createDefaultTransporter();
}

function setTransporter(transporter) {
    customTransporter = transporter;
}

// Verify transporter only in non-test mode and when credentials are provided
if (process.env.NODE_ENV !== 'test' && process.env.EMAIL_USER && process.env.CLIENT_ID) {
    const transporter = getTransporter();
    transporter.verify((error) => {
        if (error) {
            console.warn('[Notification] Email server connection check warning:', error.message);
        } else {
            console.log('[Notification] Email server is ready to send messages');
        }
    });
}

/**
 * Send an email notification.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} text - Plain text body
 * @param {string} html - HTML formatted body
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
const sendEmail = async (to, subject, text, html) => {
    try {
        if (!to) {
            throw new Error('Recipient email is required');
        }

        const transporter = getTransporter();
        const info = await transporter.sendMail({
            from: `"Marketplace Notifications" <${process.env.EMAIL_USER || 'no-reply@marketplace.local'}>`,
            to,
            subject,
            text,
            html,
        });

        console.log('[Notification] Message sent: %s to %s', info.messageId, to);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Notification] Error sending email to %s:', to, error.message);
        return { success: false, error: error.message };
    }
};

module.exports = sendEmail;
module.exports.sendEmail = sendEmail;
module.exports.setTransporter = setTransporter;
module.exports.getTransporter = getTransporter;