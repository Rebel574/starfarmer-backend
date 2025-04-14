import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";
import rateLimit from "express-rate-limit";

import productsRouter from "./routes/products.js";
import authRouter from "./routes/auth.js";
import orderRoutes from "./routes/orders.js";
import paymentRoutes from "./routes/payment.js";
import cartRouter from "./routes/cart.js";
import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();

// Trust first proxy
app.set("trust proxy", 1);

// Security Middleware
app.use(helmet()); // Set security HTTP headers
app.use(
  cors({
    origin: "https://starfarmer-frontend.onrender.com", // Vite default port
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" })); // Body parser with size limit
app.use(mongoSanitize()); // Data sanitization against NoSQL query injection
app.use(xss()); // Data sanitization against XSS
app.use(hpp()); // Prevent parameter pollution

// Rate limiting
const limiter = rateLimit({
  max: 100, // limit each IP to 100 requests per windowMs
  windowMs: 60 * 60 * 1000, // 1 hour
  message: "Too many requests from this IP, please try again in an hour!",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// Routes
app.use("/api/products", productsRouter);
app.use("/api/auth", authRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes); // Register payment callback route

// Error handling
app.use(errorHandler);

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
