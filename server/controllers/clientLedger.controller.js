const mongoose = require("mongoose");
const Client = require("../models/client");
const ClientHistory = require("../models/clientHistory");
const ClientTransaction = require("../models/clientTransaction");

exports.getLedger = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    const [purchaseAgg] = await ClientHistory.aggregate([
      { $match: { clientId: clientObjectId } },
      { $group: { _id: null, totalPurchase: { $sum: "$totalPrice" } } },
    ]);
    const totalPurchase = purchaseAgg?.totalPurchase || 0;

    const [paymentAgg] = await ClientTransaction.aggregate([
      { $match: { clientId: clientObjectId, type: "payment" } },
      { $group: { _id: null, totalPaid: { $sum: "$amount" } } },
    ]);
    const totalPaid = paymentAgg?.totalPaid || 0;

    const pendingAmount = totalPurchase - totalPaid;

    const transactions = await ClientTransaction.find({ clientId: clientObjectId })
      .select("clientId amount type date paymentMode note createdAt updatedAt")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json({
      client: {
        _id: client._id,
        clientName: client.clientName,
      },
      totalPurchase,
      totalPaid,
      pendingAmount,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
