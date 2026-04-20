const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const userModel = require('../src/models/user.model');

describe('Address Management Endpoints', () => {
    let authCookie;
    let userId;
    let addressId;

    beforeEach(async () => {
        // Create and login a test user
        const password = 'TestPassword123!';
        const hash = await bcrypt.hash(password, 10);
        const user = await userModel.create({
            username: 'address_test_user',
            email: 'addresstest@example.com',
            password: hash,
            fullName: { firstName: 'Address', lastName: 'Tester' },
            addresses: [
                {
                    street: '123 Main St',
                    city: 'New York',
                    state: 'NY',
                    zip: '10001',
                    country: 'USA'
                }
            ]
        });

        userId = user._id.toString();
        addressId = user.addresses[0]._id.toString();

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'addresstest@example.com', password });

        authCookie = loginRes.headers['set-cookie'];
    });

    describe('GET /api/auth/users/me/addresses', () => {
        it('returns 401 when no auth cookie is provided', async () => {
            const res = await request(app).get('/api/auth/users/me/addresses');
            expect(res.status).toBe(401);
        });

        it('returns 200 with list of addresses for authenticated user', async () => {
            const res = await request(app)
                .get('/api/auth/users/me/addresses')
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('User addresses fetched successfully');
            expect(res.body.addresses).toBeDefined();
            expect(Array.isArray(res.body.addresses)).toBe(true);
            expect(res.body.addresses.length).toBe(1);
        });

        it('returns empty addresses array for user with no addresses', async () => {
            const password = 'TestPassword123!';
            const hash = await bcrypt.hash(password, 10);
            await userModel.create({
                username: 'no_address_user',
                email: 'noaddress@example.com',
                password: hash,
                fullName: { firstName: 'No', lastName: 'Address' }
            });

            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: 'noaddress@example.com', password });

            const res = await request(app)
                .get('/api/auth/users/me/addresses')
                .set('Cookie', loginRes.headers['set-cookie']);

            expect(res.status).toBe(200);
            expect(res.body.addresses).toEqual([]);
        });

        it('returns address details including street, city, state, zip, country', async () => {
            const res = await request(app)
                .get('/api/auth/users/me/addresses')
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            const address = res.body.addresses[0];
            expect(address.street).toBe('123 Main St');
            expect(address.city).toBe('New York');
            expect(address.state).toBe('NY');
            expect(address.zip).toBe('10001');
            expect(address.country).toBe('USA');
        });
    });

    describe('POST /api/auth/users/me/addresses', () => {
        it('returns 401 when no auth cookie is provided', async () => {
            const res = await request(app)
                .post('/api/auth/users/me/addresses')
                .send({
                    street: '456 Oak Ave',
                    city: 'Los Angeles',
                    state: 'CA',
                    zip: '90001',
                    country: 'USA'
                });

            expect(res.status).toBe(401);
        });

        it('adds a new address successfully for authenticated user', async () => {
            const newAddress = {
                street: '456 Oak Ave',
                city: 'Los Angeles',
                state: 'CA',
                zip: '90001',
                country: 'USA',
                isDefault: false
            };

            const res = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(newAddress);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Address added successfully');
            expect(res.body.address).toBeDefined();
            expect(res.body.address.street).toBe(newAddress.street);
            expect(res.body.address.city).toBe(newAddress.city);
            expect(res.body.address.state).toBe(newAddress.state);
            expect(res.body.address.zip).toBe(newAddress.zip);
            expect(res.body.address.country).toBe(newAddress.country);
        });

        it('validates zip code format (must be numeric)', async () => {
            const invalidAddress = {
                street: '456 Oak Ave',
                city: 'Los Angeles',
                state: 'CA',
                zip: 'INVALID',
                country: 'USA'
            };

            const res = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(invalidAddress);

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('zip');
        });

        it('validates required fields (street, city, state, zip, country)', async () => {
            const incompleteAddress = {
                street: '456 Oak Ave',
                city: 'Los Angeles'
                // missing state, zip, country
            };

            const res = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(incompleteAddress);

            expect(res.status).toBe(400);
            expect(res.body.message).toBeDefined();
        });

        it('sets isDefault flag when specified', async () => {
            const newAddress = {
                street: '789 Pine Rd',
                city: 'Chicago',
                state: 'IL',
                zip: '60601',
                country: 'USA',
                isDefault: true
            };

            const res = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(newAddress);

            expect(res.status).toBe(201);
            expect(res.body.address.isDefault).toBe(true);
        });

        it('allows multiple addresses per user', async () => {
            const address1 = {
                street: '456 Oak Ave',
                city: 'Los Angeles',
                state: 'CA',
                zip: '90001',
                country: 'USA'
            };

            const address2 = {
                street: '789 Pine Rd',
                city: 'Chicago',
                state: 'IL',
                zip: '60601',
                country: 'USA'
            };

            const res1 = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(address1);

            expect(res1.status).toBe(201);

            const res2 = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(address2);

            expect(res2.status).toBe(201);

            const getRes = await request(app)
                .get('/api/auth/users/me/addresses')
                .set('Cookie', authCookie);

            expect(getRes.body.addresses.length).toBe(3); // 1 existing + 2 new
        });
    });

    describe('DELETE /api/auth/users/me/addresses/:addressId', () => {
        it('returns 401 when no auth cookie is provided', async () => {
            const res = await request(app)
                .delete(`/api/auth/users/me/addresses/${addressId}`);

            expect(res.status).toBe(401);
        });

        it('deletes an address successfully for authenticated user', async () => {
            const res = await request(app)
                .delete(`/api/auth/users/me/addresses/${addressId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Address deleted successfully');
            expect(res.body.addresses).toBeDefined();
            expect(Array.isArray(res.body.addresses)).toBe(true);
        });

        it('returns 404 when address does not exist', async () => {
            const fakeAddressId = '507f1f77bcf86cd799439011';

            const res = await request(app)
                .delete(`/api/auth/users/me/addresses/${fakeAddressId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Address not found');
        });

        it('validates address ID format (must be valid MongoDB ObjectId)', async () => {
            const res = await request(app)
                .delete('/api/auth/users/me/addresses/invalid-id')
                .set('Cookie', authCookie);

            expect(res.status).toBe(400);
        });

        it('returns empty addresses array after deleting the only address', async () => {
            const res = await request(app)
                .delete(`/api/auth/users/me/addresses/${addressId}`)
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.addresses.length).toBe(0);
        });

        it('deletes correct address when user has multiple addresses', async () => {
            // Add another address
            const newAddress = {
                street: '999 Elm St',
                city: 'Boston',
                state: 'MA',
                zip: '02101',
                country: 'USA'
            };

            const addRes = await request(app)
                .post('/api/auth/users/me/addresses')
                .set('Cookie', authCookie)
                .send(newAddress);

            const newAddressId = addRes.body.address._id;

            // Delete the first address
            const deleteRes = await request(app)
                .delete(`/api/auth/users/me/addresses/${addressId}`)
                .set('Cookie', authCookie);

            expect(deleteRes.status).toBe(200);
            expect(deleteRes.body.addresses.length).toBe(1);
            expect(deleteRes.body.addresses[0]._id).toBe(newAddressId);
        });

        it('confirms address is deleted by fetching addresses after deletion', async () => {
            // Delete the address
            const deleteRes = await request(app)
                .delete(`/api/auth/users/me/addresses/${addressId}`)
                .set('Cookie', authCookie);

            expect(deleteRes.status).toBe(200);

            // Fetch addresses list and verify deletion
            const getRes = await request(app)
                .get('/api/auth/users/me/addresses')
                .set('Cookie', authCookie);

            expect(getRes.status).toBe(200);
            const addressExists = getRes.body.addresses.some(addr => addr._id === addressId);
            expect(addressExists).toBe(false);
        });
    });
});
