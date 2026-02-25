const mongoose = require("mongoose");

const itemTypeSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ItemType", itemTypeSchema);
