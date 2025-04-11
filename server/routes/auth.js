import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user.js";
import AppError from "../utils/appError.js";
import { protect } from "../middleware/auth.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../utils/email.js";
import rateLimit from "express-rate-limit";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GMAIL_CLIENT_ID);

// Rate limiter for password reset requests - 3 attempts per hour
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: "Too many password reset attempts. Please try again in an hour.",
  standardHeaders: true,
  legacyHeaders: false,
});

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

// Create admin user if it doesn't exist
const createAdminUser = async () => {
  try {
    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (!adminExists) {
      const password = crypto.randomBytes(32).toString("hex");
      console.log("Admin password:", password); // Log the password only during initial creation

      await User.create({
        name: "Admin",
        email: process.env.ADMIN_EMAIL,
        password,
        role: "admin",
        isEmailVerified: true,
      });
    }
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
};

// Call this when the server starts
createAdminUser();

// Register new user
router.post("/register", async (req, res, next) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      if (!existingUser.isEmailVerified) {
        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

        existingUser.verificationToken = verificationToken;
        existingUser.verificationTokenExpires = verificationTokenExpires;
        await existingUser.save();

        // Send new verification email
        await sendVerificationEmail(existingUser.email, verificationToken);

        return res.status(400).json({
          status: "error",
          message:
            "Account exists but is not verified. A new verification email has been sent.",
          isVerificationError: true,
        });
      } else {
        return res.status(400).json({
          status: "error",
          message: "Email already registered. Please login instead.",
        });
      }
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const newUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      verificationToken,
      verificationTokenExpires,
    });

    await sendVerificationEmail(newUser.email, verificationToken);

    res.status(201).json({
      status: "success",
      message:
        "Registration successful. Please check your email to verify your account.",
    });
  } catch (error) {
    next(error);
  }
});

// Forgot Password
router.post(
  "/forgot-password",
  passwordResetLimiter,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email });
      if (!user) {
        return res.status(200).json({
          status: "success",
          message:
            "If a user with this email exists, a password reset link will be sent.",
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.passwordResetToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
      user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
      await user.save();

      // Send password reset email
      await sendPasswordResetEmail(user.email, resetToken);

      res.status(200).json({
        status: "success",
        message:
          "If a user with this email exists, a password reset link will be sent.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// Reset Password
router.post("/reset-password/:token", async (req, res, next) => {
  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return next(new AppError("Invalid or expired password reset token", 400));
    }

    // Update password
    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Log the user in
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// Resend verification email
router.post("/resend-verification", async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      return next(new AppError("No user found with that email address", 404));
    }

    if (user.isEmailVerified) {
      return next(new AppError("Email is already verified", 400));
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    await sendVerificationEmail(user.email, verificationToken);

    res.status(200).json({
      status: "success",
      message: "Verification email has been sent",
    });
  } catch (error) {
    next(error);
  }
});

// Verify email
router.post("/verify-email", async (req, res, next) => {
  try {
    const user = await User.findOne({
      verificationToken: req.body.token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return next(new AppError("Invalid or expired verification token", 400));
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// Login user
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError("Please provide email and password!", 400));
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    if (!user.isEmailVerified) {
      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      user.verificationToken = verificationToken;
      user.verificationTokenExpires = verificationTokenExpires;
      await user.save();

      // Send new verification email
      await sendVerificationEmail(user.email, verificationToken);

      return res.status(401).json({
        status: "error",
        message:
          "Please verify your email first. A new verification email has been sent.",
        isVerificationError: true,
      });
    }

    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// Google OAuth
router.post("/google", async (req, res, next) => {
  try {
    const { token } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GMAIL_CLIENT_ID,
    });

    const { email, name, sub: googleId } = ticket.getPayload();

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        name,
        googleId,
        isEmailVerified: true,
        password: crypto.randomBytes(32).toString("hex"),
      });
    }

    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get("/me", protect, async (req, res) => {
  res.status(200).json({
    status: "success",
    data: { user: req.user },
  });
});

export default router;
