import mongoose from "mongoose";

const localizedStringSchema = {
  en: {
    type: String,
    required: [true, "Field must have an English version"],
  },
  mr: {
    type: String,
    required: [true, "Field must have a Marathi version"],
  },
};

const productSchema = new mongoose.Schema({
  name: {
    type: localizedStringSchema,
    required: true,
  },
  description: {
    type: localizedStringSchema,
    required: true,
  },
  benefits: {
    type: [localizedStringSchema],
    required: [true, "A product must have benefits in both languages"],
    validate: {
      validator: function (val) {
        return val.length > 0;
      },
      message: "Benefits cannot be empty",
    },
  },
  price: {
    type: Number,
    required: [true, "A product must have an original price"],
  },
  discountedPrice: {
    type: Number,
    required: [true, "A product must have a discounted price"],
  },
  category: {
    type: String,
    required: [true, "A product must have a category"],
    enum: {
      values: ["fertilizers", "seeds", "equipment"],
      message: "Category is either: fertilizers, seeds, equipment",
    },
  },
  image: {
    type: String,
    required: [true, "A product must have an image"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Product = mongoose.model("Product", productSchema);
export default Product;
