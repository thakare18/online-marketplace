require('./setup/env');
require('./setup/mongodb');

const request = require('supertest');
const app = require('../src/app');
const emailModule = require('../src/email');
const Notification = require('../src/models/notification.model');
const templates = require('../src/templates/templates');
const { EmailProvider, SmsProvider, PushProvider } = require('../src/providers/provider.registry');
const registerListeners = require('../src/broker/listners');
const { processedEvents, sendNotificationSafely } = registerListeners;

// Mock broker
const mockQueueHandlers = new Map();
jest.mock('../src/broker/broker', () => ({
    connect: jest.fn().mockResolvedValue(true),
    publishToQueue: jest.fn().mockResolvedValue(true),
    subscribeToQueue: jest.fn().mockImplementation((queueName, callback) => {
        mockQueueHandlers.set(queueName, callback);
    }),
}));

describe('Notification Service', () => {
    let mockSendMail;

    beforeEach(() => {
        jest.clearAllMocks();
        mockQueueHandlers.clear();
        if (processedEvents) processedEvents.clear();

        mockSendMail = jest.fn().mockResolvedValue({
            messageId: 'test-msg-12345',
        });

        emailModule.setTransporter({
            sendMail: mockSendMail,
        });

        // Register handlers for testing
        registerListeners();
    });

    afterAll(() => {
        emailModule.setTransporter(null);
    });

    describe('HTTP Endpoints & Health Check', () => {
        it('GET / should return service running message', async () => {
            const res = await request(app).get('/');
            expect(res.status).toBe(200);
            expect(res.body.message).toContain('up and running');
        });

        it('GET /health should return healthy status and uptime', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('healthy');
            expect(res.body.service).toBe('notification');
            expect(res.body.uptime).toBeDefined();
        });

        it('GET /unknown-route should return 404', async () => {
            const res = await request(app).get('/unknown-route');
            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Route not found');
        });
    });

    describe('Provider Registry', () => {
        it('EmailProvider should be configured when EMAIL_USER is present', async () => {
            expect(EmailProvider.isConfigured()).toBe(true);
            const result = await EmailProvider.send({
                to: 'buyer@example.com',
                subject: 'Test Subject',
                text: 'Test Body',
                html: '<p>Test</p>',
            });
            expect(result.success).toBe(true);
            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({ to: 'buyer@example.com' })
            );
        });

        it('SmsProvider should report not configured without fake delivery', async () => {
            expect(SmsProvider.isConfigured()).toBe(false);
            const res = await SmsProvider.send({ to: '+1234567890', message: 'Hello' });
            expect(res.success).toBe(false);
            expect(res.skipped).toBe(true);
            expect(res.error).toContain('SMS provider is not configured');
        });

        it('PushProvider should report not configured without fake delivery', async () => {
            expect(PushProvider.isConfigured()).toBe(false);
            const res = await PushProvider.send({ token: 'device-token', payload: {} });
            expect(res.success).toBe(false);
            expect(res.skipped).toBe(true);
            expect(res.error).toContain('Push notification provider is not configured');
        });
    });

    describe('Event Consumers & Email Delivery', () => {
        it('should handle AUTH_NOTIFICATION.USER_CREATED and send welcome email', async () => {
            const handler = mockQueueHandlers.get('AUTH_NOTIFICATION.USER_CREATED');
            expect(handler).toBeDefined();

            await handler({
                email: 'newuser@example.com',
                fullName: { firstName: 'Alice', lastName: 'Smith' },
                username: 'alice',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'newuser@example.com',
                    subject: 'Welcome to our Marketplace!',
                })
            );

            // Verify notification audit log in MongoDB
            const logged = await Notification.findOne({ recipient: 'newuser@example.com' });
            expect(logged).toBeDefined();
            expect(logged.status).toBe('SENT');
            expect(logged.event).toBe('user.created');
        });

        it('should handle order.created and send order confirmation email', async () => {
            const handler = mockQueueHandlers.get('order.created');
            expect(handler).toBeDefined();

            await handler({
                orderId: 'ord_12345',
                email: 'buyer@example.com',
                username: 'john_buyer',
                totalPrice: { amount: 1500, currency: 'INR' },
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'buyer@example.com',
                    subject: expect.stringContaining('ord_12345'),
                })
            );

            const logged = await Notification.findOne({ recipient: 'buyer@example.com' });
            expect(logged).toBeDefined();
            expect(logged.status).toBe('SENT');
        });

        it('should handle order.status_updated for SHIPPED status', async () => {
            const handler = mockQueueHandlers.get('order.status_updated');
            expect(handler).toBeDefined();

            await handler({
                orderId: 'ord_99999',
                email: 'customer@example.com',
                username: 'Jane',
                newStatus: 'SHIPPED',
                trackingNumber: 'TRK-987654',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'customer@example.com',
                    subject: expect.stringContaining('Shipped'),
                })
            );
        });

        it('should handle order.cancelled', async () => {
            const handler = mockQueueHandlers.get('order.cancelled');
            expect(handler).toBeDefined();

            await handler({
                orderId: 'ord_cancel_1',
                email: 'canceller@example.com',
                username: 'Bob',
                reason: 'Item no longer needed',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'canceller@example.com',
                    subject: expect.stringContaining('Cancelled'),
                })
            );
        });

        it('should handle PAYMENT_NOTIFICATION.PAYMENT_COMPLETED', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED');
            expect(handler).toBeDefined();

            await handler({
                email: 'payer@example.com',
                username: 'PayerOne',
                orderId: 'ord_pay_1',
                amount: 750,
                currency: 'INR',
                transactionId: 'pay_rzp_tx_789',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'payer@example.com',
                    subject: expect.stringContaining('Payment Successful'),
                })
            );
        });

        it('should handle PAYMENT_NOTIFICATION.PAYMENT_FAILED', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_FAILED');
            expect(handler).toBeDefined();

            await handler({
                email: 'failedpayer@example.com',
                username: 'PayerTwo',
                orderId: 'ord_pay_failed',
                reason: 'Card expired',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'failedpayer@example.com',
                    subject: expect.stringContaining('Payment Failed'),
                })
            );
        });

        it('should handle PAYMENT_NOTIFICATION.PAYMENT_REFUNDED', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_REFUNDED');
            expect(handler).toBeDefined();

            await handler({
                email: 'refundee@example.com',
                username: 'RefundUser',
                orderId: 'ord_rfnd_1',
                amount: 500,
                currency: 'INR',
                refundId: 'rfnd_12345',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'refundee@example.com',
                    subject: expect.stringContaining('Refund Processed'),
                })
            );
        });

        it('should handle PRODUCT_NOTIFICATION.PRODUCT_CREATED', async () => {
            const handler = mockQueueHandlers.get('PRODUCT_NOTIFICATION.PRODUCT_CREATED');
            expect(handler).toBeDefined();

            await handler({
                email: 'subscriber@example.com',
                username: 'Subscriber',
                title: 'New Mechanical Keyboard',
            });

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'subscriber@example.com',
                    subject: 'New Product Available!',
                })
            );
        });
    });

    describe('Standardized Envelope vs Legacy Flat Payload Compatibility', () => {
        it('should process standardized payload envelope { event, version, timestamp, data } correctly', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED');

            const standardizedPayload = {
                event: 'payment.completed',
                version: 1,
                timestamp: new Date().toISOString(),
                data: {
                    email: 'envelope_test@example.com',
                    username: 'EnvelopeTester',
                    orderId: 'ord_envelope_1',
                    amount: 999,
                    currency: 'INR',
                    transactionId: 'tx_envelope_123',
                },
            };

            // Raw envelope passed as 2nd arg by broker
            await handler(standardizedPayload.data, standardizedPayload);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'envelope_test@example.com',
                    subject: expect.stringContaining('Payment Successful'),
                })
            );
        });

        it('should process legacy flat payload without envelope', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED');

            const legacyFlatPayload = {
                email: 'legacy_test@example.com',
                username: 'LegacyTester',
                orderId: 'ord_legacy_1',
                amount: 450,
                currency: 'INR',
                transactionId: 'tx_legacy_456',
            };

            await handler(legacyFlatPayload, legacyFlatPayload);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'legacy_test@example.com',
                })
            );
        });
    });

    describe('Idempotency & Deduplication', () => {
        it('should not send duplicate emails for the same event and order ID', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED');

            const eventData = {
                email: 'dedup@example.com',
                username: 'DedupUser',
                orderId: 'ord_dedup_100',
                amount: 300,
                currency: 'INR',
                transactionId: 'tx_dedup_100',
            };

            // First delivery
            await handler(eventData, { eventId: 'unique_event_id_100' });
            expect(mockSendMail).toHaveBeenCalledTimes(1);

            // Duplicate delivery
            await handler(eventData, { eventId: 'unique_event_id_100' });
            expect(mockSendMail).toHaveBeenCalledTimes(1); // Call count remains 1!
        });
    });

    describe('Defensive Handling & Resilience', () => {
        it('should not crash when receiving malformed null or undefined data', async () => {
            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_COMPLETED');
            await expect(handler(null, null)).resolves.not.toThrow();
            await expect(handler(undefined, undefined)).resolves.not.toThrow();
            await expect(handler('malformed string', null)).resolves.not.toThrow();
            expect(mockSendMail).not.toHaveBeenCalled();
        });

        it('should not crash when email is missing in data payload', async () => {
            const handler = mockQueueHandlers.get('order.created');
            await expect(
                handler({ orderId: 'ord_no_email', totalPrice: { amount: 100 } }, {})
            ).resolves.not.toThrow();
            expect(mockSendMail).not.toHaveBeenCalled();
        });

        it('should handle provider sendMail failures gracefully and record failure in DB', async () => {
            mockSendMail.mockRejectedValueOnce(new Error('SMTP connection timed out'));

            const handler = mockQueueHandlers.get('PAYMENT_NOTIFICATION.PAYMENT_FAILED');
            await expect(
                handler({
                    email: 'smtp_fail@example.com',
                    orderId: 'ord_smtp_fail',
                    reason: 'Declined',
                })
            ).resolves.not.toThrow();

            const logged = await Notification.findOne({ recipient: 'smtp_fail@example.com' });
            expect(logged).toBeDefined();
            expect(logged.status).toBe('FAILED');
            expect(logged.error).toContain('SMTP connection timed out');
        });
    });
});
