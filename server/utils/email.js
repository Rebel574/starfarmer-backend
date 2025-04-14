import nodemailer from "nodemailer";
import { google } from "googleapis";
import dotenv from "dotenv";
import { format } from 'date-fns'
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
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
};

export const sendOrderConfirmation = async (userEmail, orderDetails) => {
  // --- Placeholders - Replace with your actual data/config ---
  const companyName = "StarFarmer"; // Or your actual company name
  const logoUrl = "https://your-domain.com/path/to/logo.png"; // Replace with your logo URL
  const websiteUrl = "https://starfarmer-frontend.onrender.com";
  const supportEmail = "support@starfarmer.com"; // Replace with your support email
  const companyAddress = "123 Agri Teck Park, Pune"; // Replace with your address
  // --- ---

  // Calculate item subtotal for clarity
  const itemsSubtotal = orderDetails.items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const mailOptions = {
    from: `"${companyName}" <${process.env.EMAIL_FROM}>`, // Add sender name
    to: userEmail,
    subject: `Your ${companyName} Order Confirmation (#${orderDetails._id})`, // Clearer subject
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border: 1px solid #dddddd; border-radius: 5px; }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee; }
          .header img { max-width: 150px; height: auto; } /* Logo styling */
          .content h2 { color: #333333; }
          .content p { line-height: 1.6; color: #555555; }
          .order-summary, .items-table, .shipping-details, .totals-section { margin-bottom: 20px; }
          .items-table table { width: 100%; border-collapse: collapse; }
          .items-table th, .items-table td { border: 1px solid #dddddd; padding: 8px; text-align: left; }
          .items-table th { background-color: #f8f9fa; font-weight: bold; color: #333; }
          .items-table .item-total { font-weight: bold; }
          .shipping-details { background-color: #f8f9fa; padding: 15px; border-radius: 4px; border: 1px solid #eeeeee; }
          .totals-section table { width: 100%; max-width: 300px; margin-left: auto; /* Align right */ }
          .totals-section td { padding: 5px 0; }
          .totals-section .label { text-align: right; padding-right: 10px; color: #555; }
          .totals-section .value { text-align: right; font-weight: bold; }
          .totals-section .grand-total .value { font-size: 1.1em; color: #000; }
          .cta-button { display: inline-block; background-color: #28a745; /* Green */ color: #ffffff; padding: 12px 25px; text-align: center; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px; }
          .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eeeeee; font-size: 0.9em; color: #888888; }
          .footer a { color: #28a745; text-decoration: none; }
          .product-name { font-weight: bold; }
          .product-details { font-size: 0.9em; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoUrl ? `<a href="${websiteUrl}"><img src="${logoUrl}" alt="${companyName} Logo"></a>` : `<h1>${companyName}</h1>`}
          </div>

          <div class="content">
            <h2>Thank You For Your Order!</h2>
            <p>Hi there,</p> <p>We've received your order and it's now being processed. You'll receive another email once your order has shipped.</p>

            <div class="order-summary">
              <h3 style="margin-bottom: 10px;">Order Summary</h3>
              <p><strong>Order ID:</strong> ${orderDetails._id}</p>
              <p><strong>Order Date:</strong> ${format(new Date(orderDetails.createdAt), 'PPP p')}</p> <p><strong>Payment Method:</strong> ${orderDetails.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}</p>
              <p><strong>Payment Status:</strong> ${orderDetails.paymentStatus} ${orderDetails.paymentMethod !== 'cod' && orderDetails.gatewayTransactionId ? `(Gateway ID: ${orderDetails.gatewayTransactionId})` : ''}</p>
            </div>

            <div class="items-table">
              <h3 style="margin-bottom: 10px;">Items Ordered</h3>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderDetails.items
                    .map((item) => {
                      const productName = item.productId?.name || "Product Unavailable"; // Safe access
                      const itemSubtotal = item.quantity * item.price;
                      return `
                        <tr>
                          <td>
                            <span class="product-name">${productName}</span>
                            </td>
                          <td>${item.quantity}</td>
                          <td>${formatCurrency(item.price)}</td>
                          <td class="item-total">${formatCurrency(itemSubtotal)}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>

            <div class="shipping-details">
              <h3 style="margin-bottom: 10px;">Shipping Address</h3>
              <p style="margin: 2px 0;"><strong>${orderDetails.shippingAddress.fullName}</strong></p>
              <p style="margin: 2px 0;">${orderDetails.shippingAddress.addressLine1}</p>
              ${orderDetails.shippingAddress.addressLine2 ? `<p style="margin: 2px 0;">${orderDetails.shippingAddress.addressLine2}</p>` : ''}
              <p style="margin: 2px 0;">${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} ${orderDetails.shippingAddress.pincode}</p>
              <p style="margin: 2px 0;">Phone: ${orderDetails.shippingAddress.phone}</p>
            </div>

            <div class="totals-section">
              <h3 style="margin-bottom: 10px;">Order Total</h3>
              <table>
                <tbody>
                  <tr>
                    <td class="label">Subtotal:</td>
                    <td class="value">${formatCurrency(itemsSubtotal)}</td>
                  </tr>
                  <tr>
                    <td class="label">Shipping:</td>
                    <td class="value">${formatCurrency(orderDetails.shippingCharge)}</td>
                  </tr>
                  <tr class="grand-total">
                    <td class="label"><strong>Grand Total:</strong></td>
                    <td class="value"><strong>${formatCurrency(orderDetails.total)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p>You can view your order status and details anytime by visiting your account:</p>
            <a href="${websiteUrl}/my-orders" class="cta-button" style="color: #ffffff;">View My Orders</a>

            <p style="margin-top: 20px;">If you have any questions, please reply to this email or contact our support team at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
            <p>Thanks again for shopping with us!</p>
            <p>Sincerely,<br>The ${companyName} Team</p>
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            <p>${companyAddress}</p>
            <p><a href="${websiteUrl}">Visit our website</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const transporter = await createTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${userEmail} for order ${orderDetails._id}`);
  } catch (error) {
    console.error(`Error sending order confirmation email for order ${orderDetails._id}:`, error);
    // Handle error appropriately (e.g., log to a monitoring service)
  }
};

// Updated Admin Notification
export const sendOrderNotificationToAdmin = async (orderDetails) => {
  const adminBaseUrl = "https://starfarmer-frontend.onrender.com/admin"; // Base URL for your admin panel
  const companyName = "StarFarmer";
  // --- ---

  // Safely access potentially populated user data
  const userName = orderDetails.userId?.name || "Guest User"; // Indicate if user info is missing
  const userEmail = orderDetails.userId?.email || "N/A";

  // Calculate item subtotal
  const itemsSubtotal = orderDetails.items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const mailOptions = {
    from: `"${companyName} System" <${process.env.ADMIN_EMAIL}>`, // Identify the sender
    to: process.env.ADMIN_EMAIL, // Ensure ADMIN_EMAIL is set in your environment
    subject: `[New Order #${orderDetails._id}] ${formatCurrency(orderDetails.total)} from ${userName}`, // More informative subject
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Order Notification</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 650px; /* Slightly wider for admin details */ margin: 20px auto; background-color: #ffffff; padding: 20px; border: 1px solid #dddddd; border-radius: 5px; }
          .header { text-align: center; padding-bottom: 15px; border-bottom: 1px solid #eeeeee; margin-bottom: 20px; }
          .header h2 { margin: 0; color: #333333; }
          .section { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 4px; background-color: #fdfdfd; }
          .section h3 { margin-top: 0; margin-bottom: 10px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 1.1em; }
          .section p { margin: 5px 0; line-height: 1.6; color: #333; }
          .section strong { color: #000; }
          .items-table table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .items-table th, .items-table td { border: 1px solid #dddddd; padding: 8px; text-align: left; font-size: 0.95em;}
          .items-table th { background-color: #f2f2f2; font-weight: bold; color: #333; }
          .items-table .item-total { font-weight: bold; }
          .totals-summary { text-align: right; margin-top: 15px; }
          .totals-summary p { margin: 3px 0; font-size: 1em; }
          .totals-summary .grand-total { font-weight: bold; font-size: 1.1em; color: #000; }
          .admin-link { display: inline-block; background-color: #007bff; /* Blue */ color: #ffffff; padding: 10px 20px; text-align: center; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px; }
          .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eeeeee; font-size: 0.9em; color: #888888; }
          .label { display: inline-block; min-width: 120px; /* Align labels */ font-weight: bold; color: #555;}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>New Order Received!</h2>
          </div>

          <div class="section order-overview">
            <h3>Order Overview</h3>
            <p><span class="label">Order ID:</span> <strong>#${orderDetails._id}</strong></p>
            <p><span class="label">Order Date:</span> ${format(new Date(orderDetails.createdAt), 'PPP p')}</p>
            <p><span class="label">Order Status:</span> <strong>${orderDetails.status}</strong></p>
            <p><span class="label">Total Amount:</span> <strong>${formatCurrency(orderDetails.total)}</strong></p>
          </div>

          <div class="section customer-info">
            <h3>Customer Information</h3>
            <p><span class="label">Name:</span> ${userName}</p>
            <p><span class="label">Email:</span> ${userEmail}</p>
            <p><span class="label">Registered User:</span> ${orderDetails.userId ? 'Yes' : 'No (Guest)'}</p>
            </div>

          <div class="section shipping-info">
            <h3>Shipping Address</h3>
            <p><strong>${orderDetails.shippingAddress.fullName}</strong></p>
            <p>${orderDetails.shippingAddress.addressLine1}</p>
            ${orderDetails.shippingAddress.addressLine2 ? `<p>${orderDetails.shippingAddress.addressLine2}</p>` : ""}
            <p>${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} - ${orderDetails.shippingAddress.pincode}</p>
            <p>Phone: ${orderDetails.shippingAddress.phone}</p>
          </div>

          <div class="section payment-info">
              <h3>Payment Details</h3>
              <p><span class="label">Method:</span> ${orderDetails.paymentMethod} (${orderDetails.paymentGateway || "N/A"})</p>
              <p><span class="label">Status:</span> <strong>${orderDetails.paymentStatus || "N/A"}</strong></p>
              ${orderDetails.merchantTransactionId ? `<p><span class="label">Merchant Txn ID:</span> ${orderDetails.merchantTransactionId}</p>` : ""}
              ${orderDetails.gatewayTransactionId ? `<p><span class="label">Gateway Txn ID:</span> ${orderDetails.gatewayTransactionId}</p>` : ""}
          </div>

          <div class="section items-table">
            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${orderDetails.items
                  .map((item) => {
                    const productName = item.productId?.name || "Product Unavailable"; // Safe access
                    const itemSubtotal = item.quantity * item.price;
                    // Optionally add SKU or Product ID for admin reference
                    // const productSKU = item.productId?.sku || 'N/A';
                    return `
                      <tr>
                        <td>
                          <strong>${productName}</strong>
                          </td>
                        <td>${item.quantity}</td>
                        <td>${formatCurrency(item.price)}</td>
                        <td class="item-total">${formatCurrency(itemSubtotal)}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>

            <div class="totals-summary">
                <p>Subtotal: ${formatCurrency(itemsSubtotal)}</p>
                <p>Shipping Charge: ${formatCurrency(orderDetails.shippingCharge)}</p>
                <p class="grand-total">Grand Total: ${formatCurrency(orderDetails.total)}</p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 25px;">
            <a href="${adminBaseUrl}/orders/${orderDetails._id}" class="admin-link" style="color: #ffffff;">View Order in Admin Panel</a>
          </div>

          <div class="footer">
            <p>This is an automated notification from the ${companyName} system.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    // Ensure ADMIN_EMAIL is configured before trying to send
    if (!process.env.ADMIN_EMAIL) {
      console.warn(`Admin email notification skipped for order ${orderDetails._id}: ADMIN_EMAIL not set.`);
      return; // Don't attempt to send if no admin email is configured
    }
    const transporter = await createTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Admin order notification sent to ${process.env.ADMIN_EMAIL} for order ${orderDetails._id}`);
  } catch (error) {
    console.error(
      `Failed to send admin notification for order ${orderDetails._id}:`,
      error,
    );
    // Consider more robust error logging/alerting for admin notifications
  }
};
