process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-payment-service';
process.env.JWT_COOKIE_NAME = 'token';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key_id';
process.env.RAZORPAY_KEY_SECRET = 'test_razorpay_secret';
process.env.ORDER_SERVICE_URL = 'http://localhost:3003';
