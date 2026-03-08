const mongoose = require("mongoose");

const clientHistorySchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    billNumber: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    itemNumber: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: String,
      trim: true,
      default: "",
    },
    boxQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    actualPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    entryType: {
      type: String,
      enum: ["sale", "return", "payment"],
      default: "sale",
    },
    date: {
      type: Date,
    },
  },
  { timestamps: true }
);

clientHistorySchema.index({ clientId: 1 });
clientHistorySchema.index({ itemNumber: 1 });
clientHistorySchema.index({ entryType: 1 });
clientHistorySchema.index({ date: 1 });

module.exports = mongoose.model("ClientHistory", clientHistorySchema);
