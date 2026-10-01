const request = require('supertest');
const app = require('../src/app');
const userModel = require('../src/models/user.model');
const redis = require('../src/db/redis');

describe('Security Hardening & Observability Audit Tests', () => {
    const validUserPayload = {
        username: 'securitytestuser',
        email: 'security@example.com',
        password: 'Password123!',
        fullName: { firstName: 'Security', lastName: 'Auditor' },
        role: 'user'
    };

    // ─── 1. Authentication Lifecycle: Register -> Login -> Protected API ──────
    describe('Authentication Lifecycle & Role Hardening', () => {
        it('should register user and strictly prevent role escalation to admin', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    ...validUserPayload,
                    username: 'attemptedadmin',
                    email: 'adminattempt@example.com',
                    role: 'admin' // Attempting to register as admin
                });

            // express-validator rejects 'admin' role with 400
            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Validation failed');

            // Verify user was NOT created in DB
            const userInDb = await userModel.findOne({ email: 'adminattempt@example.com' });
            expect(userInDb).toBeNull();
        });

        it('should successfully register customer and return access/refresh cookies', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send(validUserPayload);

            expect(res.status).toBe(201);
            expect(res.body.user).toBeDefined();
            expect(res.body.user.role).toBe('user');
            expect(res.body.user.password).toBeUndefined(); // Password must NEVER be returned

            const cookies = res.headers['set-cookie'] || [];
            expect(cookies.some(c => c.includes('token='))).toBe(true);
            expect(cookies.some(c => c.includes('refreshToken='))).toBe(true);
        });

        it('should log in with valid credentials and access protected API', async () => {
            // Register first
            await request(app)
                .post('/api/auth/register')
                .send(validUserPayload);

            // Login
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    email: validUserPayload.email,
                    password: validUserPayload.password
                });

            expect(loginRes.status).toBe(200);
            expect(loginRes.body.user.email).toBe(validUserPayload.email);

            const cookies = loginRes.headers['set-cookie'].map(c => c.split(';')[0]);

            // Access protected /api/auth/me
            const meRes = await request(app)
                .get('/api/auth/me')
                .set('Cookie', cookies);

            expect(meRes.status).toBe(200);
            expect(meRes.body.user.email).toBe(validUserPayload.email);
            expect(meRes.body.user.role).toBe('user');
        });

        it('should reject login with wrong password', async () => {
            await request(app)
                .post('/api/auth/register')
                .send(validUserPayload);

            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    email: validUserPayload.email,
                    password: 'WrongPassword999!'
                });

            expect(loginRes.status).toBe(401);
            expect(loginRes.body.message).toBe('Invalid credentials');
        });
    });

    // ─── 2. Refresh Token Rotation & Revocation on Reuse ──────────────────────
    describe('Refresh Token Rotation & Revocation Security', () => {
        it('should rotate refresh token and revoke on token reuse attempt', async () => {
            // 1. Register
            const regRes = await request(app)
                .post('/api/auth/register')
                .send(validUserPayload);

            const initialCookies = regRes.headers['set-cookie'];
            const refreshTokenCookie = initialCookies.find(c => c.startsWith('refreshToken=')).split(';')[0];

            // 2. Rotate token (1st valid refresh)
            const refresh1Res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [refreshTokenCookie]);

            expect(refresh1Res.status).toBe(200);
            const newCookies = refresh1Res.headers['set-cookie'];
            const newRefreshTokenCookie = newCookies.find(c => c.startsWith('refreshToken=')).split(';')[0];
            expect(newRefreshTokenCookie).toBeDefined();
            expect(newRefreshTokenCookie).not.toBe(refreshTokenCookie);

            // 3. Attempt token reuse using the OLD refresh token
            const reuseRes = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [refreshTokenCookie]);

            // Must reject reused token and revoke
            expect(reuseRes.status).toBe(401);
            expect(reuseRes.body.message).toContain('revoked');

            // 4. Verify that even the newest token was revoked due to token theft detection
            const subsequentRes = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [newRefreshTokenCookie]);

            expect(subsequentRes.status).toBe(401);
        });
    });

    // ─── 3. Logout & Token Revocation ─────────────────────────────────────────
    describe('Logout & Token Blacklisting', () => {
        it('should clear cookies and revoke refresh token on logout', async () => {
            const regRes = await request(app)
                .post('/api/auth/register')
                .send(validUserPayload);

            const cookies = regRes.headers['set-cookie'].map(c => c.split(';')[0]);

            const logoutRes = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', cookies);

            expect(logoutRes.status).toBe(200);
            expect(logoutRes.body.message).toBe('Logged out successfully');

            // Check that refresh token hash was cleared in DB
            const userInDb = await userModel.findOne({ email: validUserPayload.email });
            expect(userInDb.refreshTokenHash).toBeNull();
        });

        it('should reject access when token is marked as blacklisted in Redis', async () => {
            const regRes = await request(app)
                .post('/api/auth/register')
                .send(validUserPayload);

            const cookies = regRes.headers['set-cookie'];
            const tokenCookie = cookies.find(c => c.startsWith('token='));
            const rawToken = tokenCookie.split(';')[0].replace('token=', '');

            // Mock Redis get to return 'true' for this blacklisted token
            redis.get.mockResolvedValueOnce('true');

            const meRes = await request(app)
                .get('/api/auth/me')
                .set('Cookie', [`token=${rawToken}`]);

            expect(meRes.status).toBe(401);
            expect(meRes.body.message).toContain('revoked');
        });
    });

    // ─── 4. Health & Observability Without Secret Exposure ────────────────────
    describe('Observability & Readiness Health Checks', () => {
        it('GET /health should return status, uptime, readiness, and never expose secrets', async () => {
            const res = await request(app).get('/health');

            expect(res.status).toBe(200);
            expect(res.body.service).toBe('auth');
            expect(res.body.status).toBe('healthy');
            expect(typeof res.body.uptime).toBe('number');
            expect(res.body.readiness.database).toBe('connected');

            // Verify no secrets/tokens are present in the response
            const bodyStr = JSON.stringify(res.body);
            expect(bodyStr).not.toContain('password');
            expect(bodyStr).not.toContain('secret');
            expect(bodyStr).not.toContain('mongodb');
            expect(bodyStr).not.toContain('redis');
        });

        it('Security headers should be present in HTTP responses', async () => {
            const res = await request(app).get('/health');

            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['x-frame-options']).toBeDefined();
        });
    });
});
