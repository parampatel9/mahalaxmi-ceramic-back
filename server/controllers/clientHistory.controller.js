const ClientHistory = require("../models/clientHistory");
const Client = require("../models/client");
const ClientItem = require("../models/clientItem");
const { buildListQuery } = require("../utils/listQuery");
const mongoose = require("mongoose");

const SEARCH_FIELDS = [];
const FILTER_SCHEMA = { billNumber: "number", entryType: "string" };

function extractSearchText(query = {}) {
  const rawSearch =
    typeof query.search === "string"
      ? query.search
      : typeof query.searchFields === "string"
      ? query.searchFields
      : "";
  return rawSearch.trim();
}

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
    const searchText = extractSearchText(req.query);
    const clientScopedOr = [{ clientId: clientObjectId }];
    const searchOr = [];

    // Backward compatibility for older history rows that were created without clientId.
    const itemNumbers = await ClientItem.distinct("itemNumber", { clientId: clientObjectId });
    if (itemNumbers.length) {
      clientScopedOr.push({
        clientId: { $exists: false },
        itemNumber: { $in: itemNumbers },
      });
    }

    if (searchText) {
      searchOr.push({ itemNumber: new RegExp(searchText, "i") });

      if (/^\d+$/.test(searchText)) {
        searchOr.push({ billNumber: Number(searchText) });
      }

      const oldNameItemNumbers = await ClientItem.distinct("itemNumber", {
        clientId: clientObjectId,
        oldItemName: new RegExp(searchText, "i"),
      });
      if (oldNameItemNumbers.length) {
        searchOr.push({ itemNumber: { $in: oldNameItemNumbers } });
      }
    }

    query.$and = query.$and || [];
    query.$and.push({ $or: clientScopedOr });
    if (searchOr.length) {
      query.$and.push({ $or: searchOr });
    }

    // Date filter: if ?date=YYYY-MM-DD is provided, filter by that business day in IST.
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      const dateStr = req.query.date;
      // Start and end of the day in Asia/Kolkata
      const startOfDay = new Date(`${dateStr}T00:00:00.000+05:30`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);

      const dateFieldQuery = { $gte: startOfDay, $lte: endOfDay };

      // Filter by the new 'date' field if it exists, otherwise fallback to 'createdAt'
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { date: dateFieldQuery },
          { date: { $exists: false }, createdAt: dateFieldQuery }
        ]
      });
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

    // Build the query to include both direct clientId matches and itemNumber matches for backward compatibility.
    const clientScopedOr = [{ clientId: clientObjectId }];
    const itemNumbers = await ClientItem.distinct("itemNumber", { clientId: clientObjectId });
    if (itemNumbers.length) {
      clientScopedOr.push({
        clientId: { $exists: false },
        itemNumber: { $in: itemNumbers },
      });
    }

    const rows = await ClientHistory.aggregate([
      { $match: { $or: clientScopedOr } },
      {
        $addFields: {
          effectiveDate: { $ifNull: ["$date", "$createdAt"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { date: "$effectiveDate", timezone: "Asia/Kolkata" } },
            month: { $month: { date: "$effectiveDate", timezone: "Asia/Kolkata" } },
            day: { $dayOfMonth: { date: "$effectiveDate", timezone: "Asia/Kolkata" } },
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
              timezone: "Asia/Kolkata",
            },
          },
          totalAmount: 1,
          billCount: { $size: "$billNumbers" },
        },
      },
      { $sort: { date: -1 } },
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

    // Build the query to include both direct clientId matches and itemNumber matches for backward compatibility.
    const clientScopedOr = [{ clientId: clientObjectId }];
    const itemNumbers = await ClientItem.distinct("itemNumber", { clientId: clientObjectId });
    if (itemNumbers.length) {
      clientScopedOr.push({
        clientId: { $exists: false },
        itemNumber: { $in: itemNumbers },
      });
    }

    const rows = await ClientHistory.aggregate([
      { $match: { $or: clientScopedOr } },
      {
        $addFields: {
          effectiveDate: { $ifNull: ["$date", "$createdAt"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { date: "$effectiveDate", timezone: "Asia/Kolkata" } },
            month: { $month: { date: "$effectiveDate", timezone: "Asia/Kolkata" } },
          },
          totalAmount: { $sum: "$totalPrice" },
          days: { $addToSet: { $dayOfMonth: { date: "$effectiveDate", timezone: "Asia/Kolkata" } } },
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
      { $sort: { year: -1, month: -1 } },
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
