const userModel = require('../models/user.model');


async function registerUser(req, res) {
    const { username, email, password, fullName = {} } = req.body;
    const { firstName, lastName } = fullName;

    return res.status(201).json({
        message: 'Validation passed',
        data: {
            username,
            email,
            password,
            fullName: {
                firstName,
                lastName
            }
        }
    });
}

module.exports = {
    registerUser
};