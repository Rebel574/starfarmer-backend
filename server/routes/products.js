import express from "express";
import Product from "../models/product.js";
import { protect, restrictTo } from "../middleware/auth.js";
import AppError from "../utils/appError.js";

const router = express.Router();

// Get all products with search, sort, and pagination
router.get("/", async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const searchRegex = new RegExp(search, "i");

    const query = search
      ? {
          $or: [
            { "name.en": searchRegex },
            { "name.mr": searchRegex },
            { "description.en": searchRegex },
            { "description.mr": searchRegex },
          ],
        }
      : {};

    const sortOptions = {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
    };

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .select("+discountedPrice");

    res.json({
      status: "success",
      results: products.length,
      total,
      page: +page,
      pages: Math.ceil(total / +limit),
      data: { products },
    });
  } catch (error) {
    next(error);
  }
});

// Get product by ID
router.get("/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }
    res.json({
      status: "success",
      data: { product },
    });
  } catch (error) {
    next(error);
  }
});

// Create new product (Admin only)
router.post("/", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({
      status: "success",
      data: { product },
    });
  } catch (error) {
    next(error);
  }
});

// Update product (Admin only)
router.put("/:id", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }
    res.json({
      status: "success",
      data: { product },
    });
  } catch (error) {
    next(error);
  }
});

// Delete product (Admin only)
router.delete("/:id", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    console.log(product);
    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }
    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
