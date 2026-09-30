const request = require('supertest');
const app = require('../src/app');

beforeAll(() => {
    // Ensure JWT signing works in controller during tests.
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
    process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
});

describe('Auth API', () => {
    test('POST /api/auth/register creates user', async () => {
        const payload = {
            username: 'john_doe',
            email: 'john@example.com',
            password: 'password123',
            fullName: {
                firstName: 'John',
                lastName: 'Doe'
            }
        };

        const res = await request(app)
            .post('/api/auth/register')
            .send(payload);

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toBe('User registered successfully');
        expect(res.body.user).toBeDefined();
        expect(res.body.user.username).toBe(payload.username);
        expect(res.body.user.email).toBe(payload.email);
        // Password must NOT be exposed
        expect(res.body.user.password).toBeUndefined();
        // Should set cookies
        expect(res.headers['set-cookie']).toBeDefined();
    });

    test('POST /api/auth/register rejects duplicate user', async () => {
        const payload = {
            username: 'jane_doe',
            email: 'jane@example.com',
            password: 'password123',
            fullName: {
                firstName: 'Jane',
                lastName: 'Doe'
            }
        };

        await request(app).post('/api/auth/register').send(payload);
        const res = await request(app).post('/api/auth/register').send(payload);

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toBe('Username or email already exists');
    });

    test('POST /api/auth/login authenticates valid credentials', async () => {
        const payload = {
            username: 'login_user',
            email: 'login@example.com',
            password: 'password123',
            fullName: {
                firstName: 'Login',
                lastName: 'User'
            }
        };

        await request(app).post('/api/auth/register').send(payload);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: payload.email, password: payload.password });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Logged in successfully');
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(payload.email);
        expect(res.headers['set-cookie']).toBeDefined();
    });

    test('POST /api/auth/login rejects invalid credentials', async () => {
        const payload = {
            username: 'wrong_pass_user',
            email: 'wrongpass@example.com',
            password: 'password123',
            fullName: {
                firstName: 'Wrong',
                lastName: 'Pass'
            }
        };

        await request(app).post('/api/auth/register').send(payload);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: payload.email, password: 'bad-password' });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Invalid credentials');
    });

    test('POST /api/auth/login accepts normalized email input', async () => {
        const payload = {
            username: 'case_user',
            email: 'Case.User@Example.com',
            password: 'password123',
            fullName: {
                firstName: 'Case',
                lastName: 'User'
            }
        };

        await request(app).post('/api/auth/register').send(payload);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: '  case.user@example.com ', password: payload.password });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Logged in successfully');
    });

    test('POST /api/auth/register returns role=user by default', async () => {
        const payload = {
            username: 'role_default_user',
            email: 'roledefault@example.com',
            password: 'password123',
            fullName: { firstName: 'Role', lastName: 'Default' }
        };
        const res = await request(app).post('/api/auth/register').send(payload);
        expect(res.statusCode).toBe(201);
        expect(res.body.user.role).toBe('user');
    });

    test('POST /api/auth/register allows seller role', async () => {
        const payload = {
            username: 'seller_reg_user',
            email: 'sellerreg@example.com',
            password: 'password123',
            fullName: { firstName: 'Seller', lastName: 'Reg' },
            role: 'seller'
        };
        const res = await request(app).post('/api/auth/register').send(payload);
        expect(res.statusCode).toBe(201);
        expect(res.body.user.role).toBe('seller');
    });

    test('POST /api/auth/register rejects admin role via public endpoint', async () => {
        const payload = {
            username: 'admin_attempt',
            email: 'adminattempt@example.com',
            password: 'password123',
            fullName: { firstName: 'Admin', lastName: 'Attempt' },
            role: 'admin'
        };
        const res = await request(app).post('/api/auth/register').send(payload);
        // Should fail validation because 'admin' is not in allowed registration roles
        expect(res.statusCode).toBe(400);
    });

    test('POST /api/auth/register - validation failure on missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'x' }); // missing required fields
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('Validation failed');
        expect(res.body.errors).toBeDefined();
    });

    test('POST /api/auth/refresh issues new tokens using cookie refresh token', async () => {
        // Register and login to get refresh token
        const payload = {
            username: 'refresh_user',
            email: 'refresh@example.com',
            password: 'password123',
            fullName: { firstName: 'Refresh', lastName: 'User' }
        };
        await request(app).post('/api/auth/register').send(payload);
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: payload.email, password: payload.password });

        const cookies = loginRes.headers['set-cookie'];
        expect(cookies).toBeDefined();

        const refreshRes = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies);

        expect(refreshRes.statusCode).toBe(200);
        expect(refreshRes.body.message).toBe('Token refreshed successfully');
        expect(refreshRes.headers['set-cookie']).toBeDefined();
    });

    test('POST /api/auth/refresh fails without token', async () => {
        const res = await request(app).post('/api/auth/refresh');
        expect(res.statusCode).toBe(401);
    });

    test('POST /api/auth/logout invalidates session', async () => {
        const payload = {
            username: 'logout_user',
            email: 'logout@example.com',
            password: 'password123',
            fullName: { firstName: 'Logout', lastName: 'User' }
        };
        await request(app).post('/api/auth/register').send(payload);
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: payload.email, password: payload.password });

        const cookies = loginRes.headers['set-cookie'];

        const logoutRes = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', cookies);

        expect(logoutRes.statusCode).toBe(200);
        expect(logoutRes.body.message).toBe('Logged out successfully');
    });
});
