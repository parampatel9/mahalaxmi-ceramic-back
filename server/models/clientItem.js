const mongoose = require("mongoose");

const clientItemSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    itemNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    oldItemName: {
      type: String,
      trim: true,
      default: "",
    },
    actualPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    itemTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ItemType",
      required: true,
    },
  },
  { timestamps: true }
);

clientItemSchema.index({ clientId: 1 });
clientItemSchema.index({ itemTypeId: 1 });
clientItemSchema.index({ itemNumber: "text" });

module.exports = mongoose.model("ClientItem", clientItemSchema);
