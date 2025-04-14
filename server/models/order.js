// models/order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Order must belong to a user"],
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.ObjectId,
          ref: "Product",
          required: [true, "Order item must have a product"],
        },
        quantity: {
          type: Number,
          required: [true, "Order item must have a quantity"],
          min: 1,
        },
        price: {
          type: Number,
          required: [true, "Order item must have a price"],
        },
        // Ensure Product schema has 'name' and 'image' if needed here or populate later
      },
    ],
    shippingAddress: {
      fullName: { type: String, required: [true, "Full name is required"] },
      phone: { type: String, required: [true, "Phone number is required"] },
      addressLine1: {
        type: String,
        required: [true, "Address line 1 is required"],
      },
      addressLine2: { type: String },
      city: { type: String, required: [true, "City is required"] },
      state: { type: String, required: [true, "State is required"] },
      pincode: { type: String, required: [true, "Pincode is required"] },
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "online"],
      required: [true, "Payment method is required"],
    },
    shippingCharge: {
      type: Number,
      required: true,
      default: 0,
    },
    total: {
      type: Number,
      required: [true, "Order must have a total"],
    },
    // --- Payment Gateway Specific ---
    merchantTransactionId: {
      // ID sent TO gateway
      type: String,
      index: true, // Index for faster lookups on callback
      sparse: true, // Allows null/undefined if not online payment
    },
    gatewayTransactionId: {
      // ID received FROM gateway
      type: String,
    },
    paymentStatus: {
      // Tracks only the payment state
      type: String,
      enum: ["pending", "paid", "failed", "not_applicable"], // 'not_applicable' for COD
      default: "pending",
    },
    paymentGateway: {
      // Which gateway was used
      type: String,
      enum: ["cod", "phonepe"],
    },
    // --- Order Fulfillment Status ---
    status: {
      type: String,
      enum: [
        "payment_pending",
        "processing",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
        "payment_failed",
        "payment_issue",
      ], // Added potential statuses
      default: "payment_pending",
    },
  },
  { timestamps: true },
); // Use timestamps for createdAt, updatedAt

// Pre-save hook example to set default paymentStatus for COD
orderSchema.pre("save", function (next) {
  if (this.paymentMethod === "cod") {
    this.paymentStatus = "not_applicable";
    // Optionally set initial fulfillment status for COD here too
    if (this.isNew) {
      // Only on creation
      this.status = "processing"; // Example: COD orders go straight to processing
    }
  } else if (this.isNew) {
    this.paymentStatus = "pending";
    this.status = "payment_pending";
  }
  next();
});

const Order = mongoose.model("Order", orderSchema);
export default Order;
