const bcrypt = require('bcryptjs');
const userModel = require('../models/user.model');

async function registerUser(req, res) {
    try {
        const { username, email, password, firstName, lastName, role } = req.body;

        if (!username || !email || !password || !firstName || !lastName) {
            return res.status(400).json({ message: 'All required fields must be provided' });
        }

        const existingUser = await userModel.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(409).json({ message: 'User with this email or username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await userModel.create({
            username,
            email,
            password: hashedPassword,
            fullName: {
                firstName,
                lastName
            },
            role
        });

        return res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = {
    registerUser
};