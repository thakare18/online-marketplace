const { subscribeToQueue } = require("./broker");
const sendEmail = require("../email");

module.exports = function () {
    subscribeToQueue("AUTH_NOTIFICATION.USER_CREATED", async (data) => {

        const emailHTMLTemplate = `
        <h1>Welcome to our platform!</h1>
        <p>Dear ${data.fullName.firstName + " " + ( data.fullName.lastName || "" ) },</p>
        <p>Thank you for signing up. We're excited to have you on board!</p>
        <p>Best regards,</p></br>the Team </p> 
        `;

        await sendEmail(data.email, "Welcome to our Service!", "Thank you for registering with us!", emailHTMLTemplate); 
    })

    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_INITIATED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Payment Initiated</h1>
        <p>Dear ${data.fullName.firstName + " " + ( data.fullName.lastName || "" ) },</p>
        <p>Your payment of ${data.currency} ${data.amount} has been initiated. We will notify you once the transaction is completed.</p>
        <p>Best regards,</p></br>the Team </p>
        `;
        await sendEmail(data.email, "Payment Initiated", "Your payment has been initiated", emailHTMLTemplate);
    })

    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_COMPLETED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Payment Successful!</h1>
        <p>Dear ${data.username },</p>
        <p>We have received your payment of ${data.currency} ${data.amount}. Your transaction ID is ${data.transactionId}.</p>
        <p>Thank you for your purchase!</p>
        <p>Best regards,</p></br>the Team </p>
        `;
        await sendEmail(data.email, "Payment Confirmation", "Your payment has been received", emailHTMLTemplate);
    })

    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_FAILED", async (data) => {
        const emailHTMLTemplate = `
        <h1>Payment Failed</h1>
        <p>Dear ${data.username},</p>
        <p>Unfortunately, your payment for the order ID: ${data.orderId} has failed.</p>
        <p>Please try again or contact support if the issue persists.</p>
        <p>Best regards,</p></br>the Team </p>
        `;
        await sendEmail(data.email, "Payment Failed", "Your payment could not be processed", emailHTMLTemplate);
    })

}
    
