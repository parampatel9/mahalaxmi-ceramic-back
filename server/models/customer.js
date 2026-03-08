const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    billNumber: {
      type: Number,
      required: true,
      min: 0,
      unique: true,
    },
    items: [
      {
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
        returnBoxQuantity: {
          type: Number,
          min: 0,
          default: 0,
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
        total: {
          type: Number,
          required: true,
          min: 0,
        },
        returnTotal: {
          type: Number,
          min: 0,
          default: 0,
        },
      },
    ],
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    grandReturnTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid"],
      required: true,
      default: "paid",
      trim: true,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    unpaidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paymentHistory: [
      {
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
        date: {
          type: Date,
          required: true,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

customerSchema.index({ "items.itemNumber": 1 });
customerSchema.index({ customerName: "text" });
customerSchema.index({ mobileNumber: 1 });

module.exports = mongoose.model("Customer", customerSchema);
