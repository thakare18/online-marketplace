const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const User = require('../src/models/user.model');

describe('POST /auth/register', () => {
    it('creates a user and hashes password', async () => {
        // Arrange: valid registration payload.
        const payload = {
            username: 'john_doe',
            email: 'john@example.com',
            password: 'StrongPass123!',
            firstName: 'John',
            lastName: 'Doe',
            role: 'user'
        };

        // Act: hit the register endpoint.
        const response = await request(app)
            .post('/auth/register')
            .send(payload);

        // Assert: endpoint returns created status and expected safe user fields.
        expect(response.status).toBe(201);
        expect(response.body.message).toBe('User registered successfully');
        expect(response.body.user).toMatchObject({
            username: payload.username,
            email: payload.email,
            role: payload.role
        });

        // Assert: password is persisted as hash, not plain text.
        const savedUser = await User.findOne({ email: payload.email }).lean();
        expect(savedUser).toBeTruthy();
        expect(savedUser.password).not.toBe(payload.password);

        const passwordMatches = await bcrypt.compare(payload.password, savedUser.password);
        expect(passwordMatches).toBe(true);
    });

    it('returns 409 when user already exists', async () => {
        // Arrange: create one user, then try to register same credentials again.
        const payload = {
            username: 'existing_user',
            email: 'existing@example.com',
            password: 'StrongPass123!',
            firstName: 'Existing',
            lastName: 'User'
        };

        await request(app).post('/auth/register').send(payload);

        // Act + Assert: duplicate registration should be rejected.
        const response = await request(app)
            .post('/auth/register')
            .send(payload);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('User with this email or username already exists');
    });

    it('returns 400 when required fields are missing', async () => {
        // Missing fields should trigger request validation failure.
        const response = await request(app)
            .post('/auth/register')
            .send({ email: 'missing-fields@example.com' });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('All required fields must be provided');
    });
});
