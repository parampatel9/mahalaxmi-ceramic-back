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
    actualPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

clientHistorySchema.index({ clientId: 1 });
clientHistorySchema.index({ billNumber: 1 });
clientHistorySchema.index({ itemNumber: 1 });

module.exports = mongoose.model("ClientHistory", clientHistorySchema);
