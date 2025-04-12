import nodemailer from "nodemailer";
import { google } from "googleapis";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// OAuth2 credentials from Google Developer Console
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/oauth/callback"; // Ensure this matches the redirect URI you set in the Google Console
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

// Set up OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

// Set the credentials (refresh token)
oauth2Client.setCredentials({
  refresh_token: REFRESH_TOKEN,
});

// Function to get an access token
async function getAccessToken() {
  try {
    const { token } = await oauth2Client.getAccessToken();
    return token;
  } catch (err) {
    console.error("Failed to get access token:", err.message);
    throw err;
  }
}

// Create a Nodemailer transporter using OAuth2
async function createTransporter() {
  const accessToken = await getAccessToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL_USERNAME, // Gmail address
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: accessToken,
    },
  });

  return transporter;
}

// Send an email using Nodemailer
export const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `https://starfarmer-frontend.onrender.com/verify-email?token=${token}`;

  const transporter = await createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Email Verification - Your App",
    html: `
      <h2>Welcome to Your App!</h2>
      <p>Click the link to verify your email: <a href="${verificationUrl}">Verify Email</a></p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent!");
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `https://starfarmer-frontend.onrender.com/reset-password?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Password Reset - Star Farmer",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>You requested to reset your password. Click the button below to set a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
          Reset Password
        </a>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 30 minutes.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
      </div>
    `,
  };
  const transporter = await createTransporter();
  await transporter.sendMail(mailOptions);
};

// Send order confirmation email
export const sendOrderConfirmation = async (userEmail, orderDetails) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: userEmail,
    subject: "Order Confirmation - Star Farmer",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Thank you for your order!</h2>
        <p>Your order has been confirmed and is being processed.</p>
        <h3>Order Details:</h3>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 4px;">
          <p><strong>Order ID:</strong> ${orderDetails._id}</p>
          <p><strong>Total Amount:</strong> ₹${orderDetails.total}</p>
          <h4>Items:</h4>
          ${orderDetails.items
            .map(
              (item) => `
            <div style="margin-bottom: 8px;">
              <p style="margin: 0;"><strong>${item.productId.name}</strong></p>
              <p style="margin: 0;">Quantity: ${item.quantity} x ₹${item.price}</p>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `,
  };

  const transporter = await createTransporter();
  await transporter.sendMail(mailOptions);
};

// Send order notification to admin
export const sendOrderNotificationToAdmin = async (orderDetails) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.ADMIN_EMAIL,
    subject: "New Order Received - Star Farmer",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Order Received!</h2>
        <p>A new order has been placed.</p>
        <h3>Order Details:</h3>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 4px;">
          <p><strong>Order ID:</strong> ${orderDetails._id}</p>
          <p><strong>Customer Email:</strong> ${orderDetails.userId.email}</p>
          <p><strong>Total Amount:</strong> ₹${orderDetails.total}</p>
          <h4>Items:</h4>
          ${orderDetails.items
            .map(
              (item) => `
            <div style="margin-bottom: 8px;">
              <p style="margin: 0;"><strong>${item.productId.name}</strong></p>
              <p style="margin: 0;">Quantity: ${item.quantity} x ₹${item.price}</p>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `,
  };

  const transporter = await createTransporter();
  await transporter.sendMail(mailOptions);
};
