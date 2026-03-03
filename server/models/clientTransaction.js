const mongoose = require("mongoose");

const clientTransactionSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["payment", "adjustment"],
      default: "payment",
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    paymentMode: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

clientTransactionSchema.index({ clientId: 1, date: -1, createdAt: -1 });

module.exports = mongoose.model("ClientTransaction", clientTransactionSchema);
