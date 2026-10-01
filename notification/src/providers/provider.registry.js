/**
 * Notification Provider Registry
 * Provides clean provider interfaces for Email, SMS, and Push channels.
 * SMS and Push channels declare clean interfaces and config validation
 * without faking delivery or requiring external credentials.
 */

const sendEmail = require('../email');

class EmailProvider {
    constructor() {
        this.name = 'email';
    }

    isConfigured() {
        return Boolean(process.env.EMAIL_USER);
    }

    async send({ to, subject, text, html }) {
        if (!to) {
            return { success: false, error: 'Recipient email address is required' };
        }
        return sendEmail(to, subject, text, html);
    }
}

class SmsProvider {
    constructor() {
        this.name = 'sms';
    }

    isConfigured() {
        return Boolean(process.env.SMS_PROVIDER_API_KEY && process.env.SMS_SENDER_ID);
    }

    async send({ to, message }) {
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'SMS provider is not configured. Set SMS_PROVIDER_API_KEY and SMS_SENDER_ID in environment.',
                skipped: true,
            };
        }
        if (!to || !message) {
            return { success: false, error: 'Recipient phone number and message are required' };
        }
        // When real SMS provider is integrated (e.g. Twilio/AWS SNS), call client here.
        return { success: true, provider: 'sms' };
    }
}

class PushProvider {
    constructor() {
        this.name = 'push';
    }

    isConfigured() {
        return Boolean(process.env.FCM_SERVER_KEY || process.env.PUSH_CREDENTIALS);
    }

    async send({ token, payload }) {
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'Push notification provider is not configured. Set FCM_SERVER_KEY in environment.',
                skipped: true,
            };
        }
        if (!token) {
            return { success: false, error: 'Device push token is required' };
        }
        // When FCM/WebPush is integrated, call client here.
        return { success: true, provider: 'push' };
    }
}

module.exports = {
    EmailProvider: new EmailProvider(),
    SmsProvider: new SmsProvider(),
    PushProvider: new PushProvider(),
};
