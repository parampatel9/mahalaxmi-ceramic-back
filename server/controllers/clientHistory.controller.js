const ClientHistory = require("../models/clientHistory");
const Client = require("../models/client");
const ClientItem = require("../models/clientItem");
const { buildListQuery } = require("../utils/listQuery");
const mongoose = require("mongoose");

const SEARCH_FIELDS = ["itemNumber"];
const FILTER_SCHEMA = { billNumber: "number" };

/**
 * Client history is auto-generated on customer create. Only list, getOne, delete are exposed.
 */
exports.list = async (req, res) => {
  try {
    const clientId = req.params.id || req.query.clientId;
    if (!clientId) {
      return res.status(400).json({ message: "clientId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }
    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });
    const clientObjectId = new mongoose.Types.ObjectId(clientId);
    const clientScopedOr = [{ clientId: clientObjectId }];

    // Backward compatibility for older history rows that were created without clientId.
    const itemNumbers = await ClientItem.distinct("itemNumber", { clientId: clientObjectId });
    if (itemNumbers.length) {
      clientScopedOr.push({
        clientId: { $exists: false },
        itemNumber: { $in: itemNumbers },
      });
    }
    if (query.$or) {
      const searchOr = query.$or;
      delete query.$or;
      query.$and = [{ $or: searchOr }, { $or: clientScopedOr }];
    } else {
      query.$or = clientScopedOr;
    }

    const [data, total] = await Promise.all([
      ClientHistory.find(query).sort(sort).skip(skip).limit(limit).lean(),
      ClientHistory.countDocuments(query),
    ]);
    const historyItemNumbers = [...new Set(data.map((row) => row.itemNumber).filter(Boolean))];
    let oldNameByItemNumber = new Map();
    if (historyItemNumbers.length) {
      const clientItems = await ClientItem.find({
        clientId: clientObjectId,
        itemNumber: { $in: historyItemNumbers },
      })
        .select({ itemNumber: 1, oldItemName: 1 })
        .lean();
      oldNameByItemNumber = new Map(
        clientItems.map((item) => [item.itemNumber, item.oldItemName || ""])
      );
    }
    const dataWithOldItemName = data.map((row) => ({
      ...row,
      oldItemName: oldNameByItemNumber.get(row.itemNumber) || "",
    }));
    res.json({
      data: dataWithOldItemName,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.dayWiseSummary = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({ message: "clientId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    const rows = await ClientHistory.aggregate([
      { $match: { clientId: clientObjectId } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          totalAmount: { $sum: "$totalPrice" },
          billNumbers: { $addToSet: "$billNumber" },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day",
            },
          },
          totalAmount: 1,
          billCount: { $size: "$billNumbers" },
        },
      },
      { $sort: { date: 1 } },
    ]);

    res.json({ client: { _id: client._id, clientName: client.clientName }, data: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.monthWiseSummary = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({ message: "clientId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });

    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    const rows = await ClientHistory.aggregate([
      { $match: { clientId: clientObjectId } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalAmount: { $sum: "$totalPrice" },
          days: { $addToSet: { $dayOfMonth: "$createdAt" } },
        },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          totalAmount: 1,
          dayCount: { $size: "$days" },
        },
      },
      { $sort: { year: 1, month: 1 } },
    ]);

    res.json({ client: { _id: client._id, clientName: client.clientName }, data: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const doc = await ClientHistory.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Client history not found" });
    let oldItemName = "";
    if (doc.clientId && doc.itemNumber) {
      const clientItem = await ClientItem.findOne({
        clientId: doc.clientId,
        itemNumber: doc.itemNumber,
      })
        .select({ oldItemName: 1 })
        .lean();
      oldItemName = clientItem?.oldItemName || "";
    }
    res.json({ ...doc, oldItemName });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await ClientHistory.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Client history not found" });
    res.json({ message: "Client history deleted", id: doc._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
