import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Order must belong to a user']
  },
  items: [{
    productId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Product',
      required: [true, 'Order item must have a product']
    },
    quantity: {
      type: Number,
      required: [true, 'Order item must have a quantity'],
      min: 1
    },
    price: {
      type: Number,
      required: [true, 'Order item must have a price']
    }
  }],
  total: {
    type: Number,
    required: [true, 'Order must have a total']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Order = mongoose.model('Order', orderSchema);
export default Order;