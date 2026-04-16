const request = require('supertest');
const app = require('../src/app');

beforeAll(() => {
    // Ensure JWT signing works in controller during tests.
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
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

});
