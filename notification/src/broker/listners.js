const { subscribeToQueue } = require("./broker");
const sendEmail = require("../email");

module.exports = function () {
    subscribeToQueue("AUTH_NOTIFICATION.USER_CREATED", async (data) => {

        const emailHTMLTemplate = `
        <h1>Welcome to our platform!</h1>
        <p>Dear ${data.fullName.firstName + " " + ( data.fullName.lastName || "" ) },</p>
        <p>Thank you for signing up. We're excited to have you on board!</p>
        <p>Best regards,</p>.</br>the Team </p> 
        `;

        await sendEmail(data.email, "Welcome to our Service!", "Thank you for registering with us!", emailHTMLTemplate); 
    })
}
    
