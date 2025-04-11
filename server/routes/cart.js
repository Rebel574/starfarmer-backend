import express from "express";
import Cart from "../models/cart.js"; // Assuming models are relative to this file's new location or configured path
import Product from "../models/product.js"; // Assuming models are relative
import AppError from "../utils/appError.js"; // Assuming utils are relative
import { protect } from "../middleware/auth.js"; // Assuming middleware is relative

const router = express.Router();

// --- Middleware ---
// Apply authentication middleware to all cart routes
router.use(protect);

// GET / - Get cart for the current user
router.get("/", async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.productId",
    );
    // If cart is null (doesn't exist), send back an empty cart structure
    res.status(200).json({ status: "success", data: cart || { items: [] } });
  } catch (err) {
    next(err); // Pass errors to the error handling middleware
  }
});

// POST /add - Add item to cart
router.post("/add", async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return next(new AppError("Product ID is required", 400));
    }
    const product = await Product.findById(productId);
    if (!product) {
      return next(new AppError("Product not found", 404));
    }

    // Find the user's cart or create it if it doesn't exist
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      // If no cart, create one and add the item
      cart = await Cart.create({
        user: req.user._id,
        items: [{ productId, quantity: 1 }],
      });
    } else {
      // Cart exists, check if item is already in the cart
      const itemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId,
      );

      if (itemIndex > -1) {
        // Product exists in the cart, increment quantity
        cart.items[itemIndex].quantity += 1;
      } else {
        // Product does not exist in cart, add new item
        cart.items.push({ productId, quantity: 1 });
      }
      await cart.save(); // Save changes to the cart
    }

    // Optionally populate product details before sending response, or just send success
    // const updatedCart = await Cart.findById(cart._id).populate('items.productId');
    res.status(200).json({
      status: "success",
      message: "Item added to cart" /*, data: updatedCart */,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /update - Update item quantity in cart
router.patch("/update", async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
      return next(new AppError("Product ID and quantity are required", 400));
    }

    const quantityNum = parseInt(quantity, 10); // Ensure quantity is a number

    if (isNaN(quantityNum)) {
      return next(new AppError("Quantity must be a number", 400));
    }

    if (quantityNum <= 0) {
      // If quantity is 0 or less, remove the item instead
      await Cart.findOneAndUpdate(
        { user: req.user._id },
        { $pull: { items: { productId } } },
        { new: true }, // Although 'new' isn't strictly needed for $pull here, good practice
      );
      res
        .status(200)
        .json({ status: "success", message: "Item removed from cart" });
    } else {
      // Update the quantity for the specific item
      const cart = await Cart.findOneAndUpdate(
        { user: req.user._id, "items.productId": productId },
        { $set: { "items.$.quantity": quantityNum } },
        { new: true }, // Return the updated document
      );

      if (!cart) {
        return next(new AppError("Cart not found or item not in cart", 404));
      }
      res
        .status(200)
        .json({ status: "success", message: "Cart updated" /*, data: cart */ });
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /remove - Remove item from cart
router.delete("/remove", async (req, res, next) => {
  try {
    const { productId } = req.body; // Often productId might come from params (e.g., /remove/:productId) or query string
    if (!productId) {
      return next(new AppError("Product ID is required", 400));
    }

    const cart = await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $pull: { items: { productId } } },
      { new: true }, // Return the modified cart
    );

    if (!cart) {
      // This might happen if the user has no cart yet. Or maybe the item wasn't found.
      // Depending on requirements, you might return 404 or just success.
      return next(new AppError("Cart not found", 404));
    }

    res
      .status(200)
      .json({ status: "success", message: "Item removed" /*, data: cart */ });
  } catch (err) {
    next(err);
  }
});

// DELETE /clear - Clear entire cart
router.delete("/clear", async (req, res, next) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } }, // Set items array to empty
      { new: true }, // Return the modified cart
    );

    if (!cart) {
      // If the user never had a cart, this will return null.
      // We can consider this a success (the cart is effectively clear).
      return res.status(200).json({
        status: "success",
        message: "Cart is already empty or does not exist",
      });
    }

    res
      .status(200)
      .json({ status: "success", message: "Cart cleared" /*, data: cart */ });
  } catch (err) {
    next(err);
  }
});
// POST /api/cart/sync - Save full cart (on logout or manual sync)
router.post("/sync", async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return next(new AppError("Invalid items array", 400));
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items });
    } else {
      cart.items = items;
      await cart.save();
    }

    res.status(200).json({ status: "success", message: "Cart synced" });
  } catch (err) {
    next(err);
  }
});

export default router;
