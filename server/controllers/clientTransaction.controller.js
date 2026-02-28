const mongoose = require("mongoose");
const Client = require("../models/client");
const ClientTransaction = require("../models/clientTransaction");

exports.list = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const transactions = await ClientTransaction.find({ clientId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ data: transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const rawAmount = req.body.amount;
    const amount = Number(rawAmount);
    if (rawAmount == null || rawAmount === "" || Number.isNaN(amount) || amount < 0) {
      return res
        .status(400)
        .json({ message: "amount is required and must be a non-negative number" });
    }

    const type = req.body.type || "payment";
    if (!["payment", "adjustment"].includes(type)) {
      return res.status(400).json({ message: "Invalid type" });
    }

    const note = (req.body.note || "").trim();

    const tx = await ClientTransaction.create({
      clientId,
      amount,
      type,
      note,
    });

    res.status(201).json({
      status: 201,
      message: "Transaction created successfully",
      transaction: tx,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id: clientId, transactionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({ message: "Invalid transaction ID" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const deleted = await ClientTransaction.findOneAndDelete({
      _id: transactionId,
      clientId,
    });
    if (!deleted) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json({ message: "Transaction deleted", id: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

