const mongoose = require("mongoose");
const Client = require("../models/client");
const ClientHistory = require("../models/clientHistory");
const ClientTransaction = require("../models/clientTransaction");

const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["clientName"];
const FILTER_SCHEMA = {};

exports.listLedger = async (req, res) => {
  try {
    const queryInput = { ...req.query, ...(req.body || {}) };
    const { query, skip, limit, sort, page } = buildListQuery({ query: queryInput }, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "clienthistories",
          localField: "_id",
          foreignField: "clientId",
          as: "history",
        },
      },
      {
        $lookup: {
          from: "clienttransactions",
          localField: "_id",
          foreignField: "clientId",
          as: "transactions",
        },
      },
      {
        $addFields: {
          totalSale: {
            $sum: {
              $map: {
                input: "$history",
                as: "h",
                in: {
                  $cond: [{ $gt: ["$$h.totalPrice", 0] }, "$$h.totalPrice", 0],
                },
              },
            },
          },
          totalReturn: {
            $sum: {
              $map: {
                input: "$history",
                as: "h",
                in: {
                  $cond: [{ $lt: ["$$h.totalPrice", 0] }, "$$h.totalPrice", 0],
                },
              },
            },
          },
          totalPurchase: { $sum: "$history.totalPrice" },
          totalPaid: { $sum: "$transactions.amount" },
        },
      },
      {
        $addFields: {
          pendingAmount: { $subtract: ["$totalPurchase", "$totalPaid"] },
        },
      },
      {
        $project: {
          history: 0,
          transactions: 0,
        },
      },
    ];

    const [data, totalRows] = await Promise.all([
      Client.aggregate([...pipeline, { $sort: sort }, { $skip: skip }, { $limit: limit }]),
      Client.aggregate([...pipeline, { $count: "count" }]),
    ]);

    const total = totalRows[0]?.count || 0;

    res.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
      {
        $group: {
          _id: null,
          totalSale: {
            $sum: {
              $cond: [{ $gt: ["$totalPrice", 0] }, "$totalPrice", 0],
            },
          },
          totalReturn: {
            $sum: {
              $cond: [{ $lt: ["$totalPrice", 0] }, "$totalPrice", 0],
            },
          },
          totalPurchase: { $sum: "$totalPrice" },
        },
      },
    ]);
    const totalSale = purchaseAgg?.totalSale || 0;
    const totalReturn = purchaseAgg?.totalReturn || 0;
    const totalPurchase = purchaseAgg?.totalPurchase || 0;

    const [paymentAgg] = await ClientTransaction.aggregate([
      { $match: { clientId: clientObjectId } },
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
      totalSale,
      totalReturn,
      totalPurchase,
      totalPaid,
      pendingAmount,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
