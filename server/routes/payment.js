// routes/payment.js
import express from "express";
import { Buffer } from "buffer";
import Order from "../models/order.js";
import AppError from "../utils/appError.js";
import { verifyChecksum } from "../utils/phonepe.js";
import {
  sendOrderConfirmation,
  sendOrderNotificationToAdmin,
} from "../utils/email.js";

const router = express.Router();

// PhonePe Server-to-Server Callback Handler
router.post("/phonepe-callback", async (req, res) => {
  // Note: Not calling next() here usually
  try {
    console.log(`Received PhonePe Callback at ${new Date().toISOString()}`);
    // console.log("Callback Headers:", JSON.stringify(req.headers)); // Log headers for debugging checksum issues
    // console.log("Callback Body:", JSON.stringify(req.body));

    const encodedResponse = req.body.response; // PhonePe sends base64 encoded JSON in 'response' field
    if (!encodedResponse) {
      console.error(
        "PhonePe Callback Error: Missing 'response' field in body.",
      );
      return res.status(400).send("Invalid callback: Missing response payload");
    }

    // 1. Verify Checksum
    const receivedChecksum = req.headers["x-verify"];
    if (!receivedChecksum) {
      console.error("PhonePe Callback Error: Missing 'x-verify' header.");
      return res
        .status(400)
        .send("Invalid callback: Missing verification header");
    }

    const isVerified = verifyChecksum(
      encodedResponse,
      receivedChecksum,
      process.env.PHONEPE_SALT_KEY,
      process.env.PHONEPE_SALT_INDEX,
    );

    if (!isVerified) {
      console.error("PhonePe Callback Error: Checksum verification failed!");
      // Respond directly to PhonePe - DO NOT PROCESS
      return res.status(400).send("Checksum mismatch");
    }
    console.log("PhonePe Callback Checksum VERIFIED.");

    // 2. Decode Payload
    const decodedResponse = JSON.parse(
      Buffer.from(encodedResponse, "base64").toString("utf8"),
    );
    console.log("Decoded PhonePe Callback:", JSON.stringify(decodedResponse));

    // 3. Extract Key Information
    const { success, code, message, data } = decodedResponse;
    const merchantTransactionId = data?.merchantTransactionId;
    const gatewayTransactionId = data?.transactionId; // PhonePe's ID
    const paymentState = data?.state; // e.g., COMPLETED, FAILED
    const responseCode = data?.responseCode; // e.g., SUCCESS, PAYMENT_ERROR

    if (!merchantTransactionId) {
      console.error(
        "PhonePe Callback Error: Missing 'merchantTransactionId' in decoded data.",
      );
      // Acknowledge receipt but log error - might be a test callback or issue
      return res
        .status(200)
        .send("Callback acknowledged, missing merchant transaction ID.");
    }

    // 4. Find Order
    const order = await Order.findOne({
      merchantTransactionId: merchantTransactionId,
    });

    if (!order) {
      console.error(
        `PhonePe Callback Warning: Order not found for merchantTransactionId: ${merchantTransactionId}. Acknowledging.`,
      );
      // Acknowledge receipt to stop PhonePe retries, but log this issue.
      return res.status(200).send("Order not found, acknowledged.");
    }

    // 5. Idempotency Check: Avoid reprocessing
    // Check if payment already marked as paid or failed definitively
    if (order.paymentStatus === "paid" || order.paymentStatus === "failed") {
      console.log(
        `Order ${order._id} (MTID: ${merchantTransactionId}) already processed with status ${order.paymentStatus}. Ignoring callback.`,
      );
      return res.status(200).send("Already processed.");
    }

    // 6. Update Order Based on Response Code/State
    let sendEmails = false;
    if (
      success &&
      code === "PAYMENT_SUCCESS" &&
      paymentState === "COMPLETED" &&
      responseCode === "SUCCESS"
    ) {
      console.log(
        `Payment SUCCESS for Order ${order._id} (MTID: ${merchantTransactionId})`,
      );

      const paymentAmount = data?.amount / 100; // Amount in Rupees

      // Optional: Amount verification
      if (paymentAmount !== order.total) {
        console.warn(
          `Amount Mismatch for Order ${order._id}. Expected ${order.total}, received ${paymentAmount}. Flagging.`,
        );
        order.status = "payment_issue";
        order.paymentStatus = "paid"; // It was paid, but amount is wrong
      } else {
        order.status = "processing"; // Move to fulfillment
        order.paymentStatus = "paid";
      }
      order.gatewayTransactionId = gatewayTransactionId;
      await order.save();
      sendEmails = true; // Mark to send emails after saving
    } else {
      // Handle various failure/pending scenarios based on PhonePe codes
      console.warn(
        `Payment FAILED or PENDING for Order ${order._id} (MTID: ${merchantTransactionId}). Code: ${code}, State: ${paymentState}, ResponseCode: ${responseCode}, Message: ${message}`,
      );
      order.status = "payment_failed"; // Or 'cancelled' or keep 'payment_pending' depending on code
      order.paymentStatus = "failed";
      order.gatewayTransactionId = gatewayTransactionId; // Store ID even on failure
      await order.save();
      // Optional: Send failure email to user?
    }

    // 7. Send Emails (only on first successful processing)
    if (sendEmails) {
      try {
        // Populate details needed for email templates
        const populatedOrder = await Order.findById(order._id).populate([
          { path: "userId", select: "email name" },
          { path: "items.productId", select: "name image" },
        ]);

        if (populatedOrder) {
          await Promise.allSettled([
            sendOrderConfirmation(populatedOrder.userId.email, populatedOrder),
            sendOrderNotificationToAdmin(populatedOrder),
          ]);
          console.log(`Emails queued for successful order ${order._id}`);
        } else {
          console.error(
            `Failed to re-populate order ${order._id} for sending emails.`,
          );
        }
      } catch (emailError) {
        console.error(
          `Error sending emails for Order ${order._id} after successful payment:`,
          emailError,
        );
        // Log error, but don't fail the callback response
      }
    }

    // 8. Respond to PhonePe
    // Always send 200 OK if callback was received and processed (even if payment failed)
    // to prevent PhonePe from retrying unnecessarily.
    res.status(200).send("Callback processed successfully.");
  } catch (error) {
    console.error("CRITICAL Error processing PhonePe callback:", error);
    // Send 500 only for unexpected server errors during processing
    res.status(500).send("Internal Server Error processing callback.");
  }
});

export default router;
