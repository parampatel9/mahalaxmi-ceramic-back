const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    billNumber: {
      type: Number,
      required: true,
      min: 0,
    },
    itemNumber: {
      type: String,
      required: true,
      trim: true,
    },
    boxQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    size: {
      type: String,
      trim: true,
      default: "",
    },
    sellPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

customerSchema.index({ billNumber: 1 });
customerSchema.index({ itemNumber: 1 });
customerSchema.index({ customerName: "text" });

module.exports = mongoose.model("Customer", customerSchema);
