// routes/order.js
import express from "express";
import axios from "axios";
import { Buffer } from "buffer"; // Needed for base64
import Order from "../models/order.js";
import { protect, restrictTo } from "../middleware/auth.js"; // Assuming these work
import AppError from "../utils/appError.js"; // Import custom error
import {
  generateMerchantTransactionId,
  calculateChecksum,
} from "../utils/phonepe.js"; // Import PhonePe helpers
import {
  sendOrderConfirmation,
  sendOrderNotificationToAdmin,
} from "../utils/email.js"; // Import email functions

const router = express.Router();

// --- GET Routes (Error handling added) ---

// Get all orders for current user
router.get("/my-orders", protect, async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .populate("items.productId", "name image") // Populate specific fields
      .sort({ createdAt: -1 }); // Sort by newest first

    res.json({
      status: "success",
      results: orders.length,
      data: { orders },
    });
  } catch (error) {
    next(error); // Pass to global error handler
  }
});

// GET Order Status by Merchant Transaction ID (for frontend polling)
router.get("/status-by-mtid/:mtid", protect, async (req, res, next) => {
  try {
    const merchantTransactionId = req.params.mtid;
    if (!merchantTransactionId) {
      return next(new AppError("Merchant Transaction ID is required.", 400));
    }

    // Find the order, ensuring it belongs to the logged-in user
    const order = await Order.findOne({
      merchantTransactionId: merchantTransactionId,
      userId: req.user._id, // Important: Ensure user owns this transaction ID
    }).select("paymentStatus status _id"); // Select only needed fields

    if (!order) {
      // Could be pending creation, or invalid ID. Return 404 if definitely invalid.
      // For polling, maybe return a specific "pending" status or 404 if not found after a while.
      // Let's assume for now if not found, it's an issue.
      return next(
        new AppError("Order not found for this transaction ID.", 404),
      );
    }

    res.json({
      status: "success", // Or use order.status if more granular info needed
      orderId: order._id,
      paymentStatus: order.paymentStatus, // e.g., 'pending', 'paid', 'failed'
    });
  } catch (error) {
    next(error);
  }
});

// Get single order by ID (for user)
router.get("/:id", protect, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .populate("items.productId", "name image") // Populate product details
      .populate("userId", "name email"); // Populate user details

    if (!order) {
      return next(
        new AppError("No order found with that ID for this user.", 404),
      );
    }

    res.json({
      status: "success",
      data: { order },
    });
  } catch (error) {
    // Handle CastError specifically if needed before global handler
    if (error.name === "CastError") {
      return next(
        new AppError(`Invalid order ID format: ${req.params.id}`, 400),
      );
    }
    next(error);
  }
});

// Get all orders (Admin only)
router.get("/", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name email") // Populate user details
      .populate("items.productId", "name") // Populate product name
      .sort({ createdAt: -1 });

    res.json({
      status: "success",
      results: orders.length,
      data: { orders },
    });
  } catch (error) {
    next(error);
  }
});

// --- POST Routes (Split Logic) ---

// Create new COD order ONLY
router.post("/", protect, async (req, res, next) => {
  if (req.body.paymentMethod !== "cod") {
    return next(
      new AppError(
        "This endpoint is only for COD orders. Use /initiate-payment for online.",
        400,
      ),
    );
  }
  try {
    const orderData = {
      userId: req.user.id,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress,
      paymentMethod: "cod",
      paymentGateway: "cod",
      shippingCharge: req.body.shippingCharge,
      total: req.body.total,
      // Status and paymentStatus set by pre-save hook
    };

    // Validate required fields manually before create if needed
    if (
      !orderData.shippingAddress ||
      !orderData.total ||
      !orderData.items ||
      orderData.items.length === 0
    ) {
      return next(new AppError("Missing required order data for COD.", 400));
    }

    let order = await Order.create(orderData);

    // Populate fields necessary for emails AFTER creation
    order = await Order.findById(order._id).populate([
      { path: "userId", select: "email name" },
      { path: "items.productId", select: "name image" }, // Populate details needed
    ]);

    if (!order) {
      // Should not happen, but good practice
      return next(
        new AppError("Failed to create or retrieve order after creation.", 500),
      );
    }

    // Send emails immediately for COD (fire and forget, log errors)
    Promise.allSettled([
      sendOrderConfirmation(order.userId.email, order),
      sendOrderNotificationToAdmin(order),
    ]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `Failed to send ${index === 0 ? "user" : "admin"} email for COD Order ${order._id}:`,
            result.reason,
          );
        }
      });
    });

    res.status(201).json({
      status: "success",
      data: { order }, // Send back the populated order
    });
  } catch (error) {
    // Let global handler deal with validation errors etc.
    next(error);
  }
});

// Initiate PhonePe Payment
router.post("/initiate-payment", protect, async (req, res, next) => {
  if (req.body.paymentMethod !== "online") {
    return next(
      new AppError(
        "This endpoint is only for online payments via PhonePe.",
        400,
      ),
    );
  }
  try {
    const { items, shippingAddress, shippingCharge, total } = req.body;
    const userId = req.user._id;
    const userPhone = shippingAddress?.phone; // Get phone from shipping address
    const userEmail = req.user.email;

    // Basic validation
    if (
      !shippingAddress ||
      !total ||
      !items ||
      items.length === 0 ||
      !userPhone
    ) {
      return next(
        new AppError(
          "Missing required data for online payment initiation.",
          400,
        ),
      );
    }
    if (
      !process.env.PHONEPE_MERCHANT_ID ||
      !process.env.PHONEPE_SALT_KEY ||
      !process.env.PHONEPE_SALT_INDEX ||
      !process.env.PHONEPE_PAY_API_URL ||
      !process.env.PHONEPE_REDIRECT_URL ||
      !process.env.PHONEPE_CALLBACK_URL
    ) {
      console.error("PhonePe environment variables not configured!");
      return next(new AppError("Payment gateway configuration error.", 500));
    }

    const merchantTransactionId = generateMerchantTransactionId();

    // 1. Create Order in DB with 'payment_pending' status
    const orderData = {
      userId,
      items,
      shippingAddress,
      paymentMethod: "online",
      paymentGateway: "phonepe",
      shippingCharge,
      total,
      merchantTransactionId,
      // Status and paymentStatus set by pre-save hook
    };
    const order = await Order.create(orderData);

    // 2. Prepare PhonePe Payload
    const paymentData = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userId.toString(),
      amount: Math.round(total * 100), // Ensure amount is integer (paise)
      redirectUrl: `${process.env.PHONEPE_REDIRECT_URL}?mtid=${merchantTransactionId}`, // Pass mtid back
      redirectMode: "POST",
      callbackUrl: process.env.PHONEPE_CALLBACK_URL,
      mobileNumber: userPhone.replace(/[^0-9]/g, "").slice(-10), // Clean phone number if needed
      paymentInstrument: { type: "PAY_PAGE" },
      // email: userEmail // Optional
    };

    // 3. Encode & Checksum
    const payloadBase64 = Buffer.from(JSON.stringify(paymentData)).toString(
      "base64",
    );
    const checksum = calculateChecksum(
      payloadBase64,
      process.env.PHONEPE_SALT_KEY,
      process.env.PHONEPE_SALT_INDEX,
    );

    // 4. Call PhonePe API
    const options = {
      method: "POST",
      url: process.env.PHONEPE_PAY_API_URL,
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
      },
      data: { request: payloadBase64 },
    };

    console.log("Calling PhonePe Pay API...");
    const phonePeResponse = await axios.request(options);
    console.log("PhonePe Response Status:", phonePeResponse.status);
    // console.log("PhonePe Response Data:", JSON.stringify(phonePeResponse.data));

    // 5. Process Response
    if (
      phonePeResponse.data?.success &&
      phonePeResponse.data?.data?.instrumentResponse?.redirectInfo?.url
    ) {
      console.log(
        `PhonePe payment initiated successfully for Order ${order._id} / MTID ${merchantTransactionId}`,
      );
      res.json({
        status: "success",
        redirectUrl:
          phonePeResponse.data.data.instrumentResponse.redirectInfo.url,
      });
    } else {
      console.error(
        `PhonePe payment initiation failed for Order ${order._id}:`,
        phonePeResponse.data?.message || "Unknown error from PhonePe",
      );
      // Update order status to failed as initiation failed
      await Order.findByIdAndUpdate(order._id, {
        status: "payment_failed",
        paymentStatus: "failed",
      });
      // Send specific error message if available
      throw new AppError(
        phonePeResponse.data?.message ||
          "Failed to initiate payment with PhonePe.",
        500,
      );
    }
  } catch (error) {
    console.error("Initiate payment controller error:", error);
    // Let the global error handler manage the response format
    // Ensure AppError is passed correctly
    if (axios.isAxiosError(error)) {
      console.error("PhonePe API Call Error:", error.response?.data);
      return next(
        new AppError(
          `PhonePe API Error: ${error.response?.data?.message || error.message}`,
          error.response?.status || 500,
        ),
      );
    }
    // Pass other errors (like AppError thrown above or DB errors)
    next(error);
  }
});

// --- PATCH Routes (Error handling added) ---

// Update order status (Admin only)
router.patch(
  "/:id/status",
  protect,
  restrictTo("admin"),
  async (req, res, next) => {
    try {
      const { status } = req.body;
      // Optional: Add validation for allowed status transitions
      if (!status) {
        return next(new AppError("Please provide a status to update.", 400));
      }

      const allowedStatuses = [
        "payment_pending",
        "processing",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
        "payment_failed",
        "payment_issue",
      ];
      if (!allowedStatuses.includes(status)) {
        return next(new AppError(`Invalid status value: ${status}`, 400));
      }

      const order = await Order.findByIdAndUpdate(
        req.params.id,
        { status: status },
        // Optionally update paymentStatus based on fulfillment status if needed
        // { status: status, ...(status === 'completed' ? { paymentStatus: 'paid'} : {}) },
        { new: true, runValidators: true },
      ).populate("userId", "name email"); // Populate needed fields if sending emails on status change

      if (!order) {
        return next(new AppError("No order found with that ID", 404));
      }

      // Optional: Send status update email to user
      // try {
      //     await sendOrderStatusUpdateEmail(order.userId.email, order);
      // } catch (emailError) {
      //     console.error(`Failed to send status update email for Order ${order._id}:`, emailError);
      // }

      res.json({
        status: "success",
        data: { order },
      });
    } catch (error) {
      if (error.name === "CastError") {
        return next(
          new AppError(`Invalid order ID format: ${req.params.id}`, 400),
        );
      }
      next(error);
    }
  },
);

export default router;
