import express from 'express';
import Order from '../models/order.js';
import { protect, restrictTo } from '../middleware/auth.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// Get all orders for current user
router.get('/my-orders', protect, async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .populate('items.productId');
    
    res.json({
      status: 'success',
      results: orders.length,
      data: { orders }
    });
  } catch (error) {
    next(error);
  }
});

// Get all orders (Admin only)
router.get('/', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate('userId', 'email')
      .populate('items.productId');
    
    res.json({
      status: 'success',
      results: orders.length,
      data: { orders }
    });
  } catch (error) {
    next(error);
  }
});

// Create new order
router.post('/', protect, async (req, res, next) => {
  try {
    const order = await Order.create({
      userId: req.user._id,
      ...req.body
    });

    res.status(201).json({
      status: 'success',
      data: { order }
    });
  } catch (error) {
    next(error);
  }
});

// Update order status (Admin only)
router.patch('/:id/status', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return next(new AppError('No order found with that ID', 404));
    }

    res.json({
      status: 'success',
      data: { order }
    });
  } catch (error) {
    next(error);
  }
});

export default router;