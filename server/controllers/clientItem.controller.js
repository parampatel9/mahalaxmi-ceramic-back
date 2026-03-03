const ClientItem = require("../models/clientItem");
const Client = require("../models/client");
const { buildListQuery } = require("../utils/listQuery");
const mongoose = require("mongoose");

const SEARCH_FIELDS = ["itemNumber", "oldItemName"];
const FILTER_SCHEMA = { actualPrice: "number" };

function getListOptions(req, clientId) {
  const opts = buildListQuery(req, {
    searchFields: SEARCH_FIELDS,
    filterSchema: FILTER_SCHEMA,
  });
  opts.query.clientId = new mongoose.Types.ObjectId(clientId);
  return opts;
}

async function listCore(req, res, listParams = {}) {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId))
      return res.status(400).json({ message: "Invalid client ID" });
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const queryInput = { ...req.query, ...listParams };
    const reqForList = { ...req, query: queryInput };
    const { query, skip, limit, sort, page } = getListOptions(reqForList, clientId);
    const [data, total] = await Promise.all([
      ClientItem.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate("itemTypeId")
        .lean(),
      ClientItem.countDocuments(query),
    ]);
    res.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

exports.list = async (req, res) => listCore(req, res);

exports.listPost = async (req, res) => listCore(req, res, req.body || {});

exports.getOne = async (req, res) => {
  try {
    const { id: clientId, itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId) || !mongoose.Types.ObjectId.isValid(itemId))
      return res.status(400).json({ message: "Invalid ID" });
    const item = await ClientItem.findOne({ _id: itemId, clientId })
      .populate("itemTypeId")
      .lean();
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId))
      return res.status(400).json({ message: "Invalid client ID" });
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const itemNumber = String(req.body.itemNumber || "").trim();
    const { actualPrice, itemTypeId } = req.body;
    if (!itemNumber) return res.status(400).json({ message: "itemNumber is required" });
    if (!itemTypeId) return res.status(400).json({ message: "itemTypeId is required" });
    if (!mongoose.Types.ObjectId.isValid(itemTypeId))
      return res.status(400).json({ message: "Invalid itemTypeId" });

    const price = Number(actualPrice);
    if (actualPrice == null || actualPrice === "" || Number.isNaN(price) || price < 0)
      return res.status(400).json({ message: "actualPrice is required and must be a non-negative number" });

    const existingItem = await ClientItem.findOne({ itemNumber })
      .collation({ locale: "en", strength: 2 })
      .lean();
    if (existingItem) {
      return res.status(409).json({ message: "itemNumber already exists" });
    }

    const oldItemName = String(req.body.oldItemName || "").trim();

    const created = await ClientItem.create({
      clientId,
      itemNumber,
      oldItemName,
      actualPrice: price,
      itemTypeId,
    });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "client item has been successfully created",
      clientItem: created,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id: clientId, itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId) || !mongoose.Types.ObjectId.isValid(itemId))
      return res.status(400).json({ message: "Invalid ID" });

    if (req.body.itemNumber !== undefined) {
      const itemNumber = String(req.body.itemNumber || "").trim();
      if (!itemNumber) return res.status(400).json({ message: "itemNumber is required" });

      const existingItem = await ClientItem.findOne({
        _id: { $ne: itemId },
        itemNumber,
      })
        .collation({ locale: "en", strength: 2 })
        .lean();
      if (existingItem) {
        return res.status(409).json({ message: "itemNumber already exists" });
      }

      req.body.itemNumber = itemNumber;
    }

    if (req.body.oldItemName !== undefined) {
      req.body.oldItemName = String(req.body.oldItemName || "").trim();
    }

    const updated = await ClientItem.findOneAndUpdate(
      { _id: itemId, clientId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Item not found" });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "client item has been successfully updated",
      clientItem: updated,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "itemNumber already exists" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id: clientId, itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId) || !mongoose.Types.ObjectId.isValid(itemId))
      return res.status(400).json({ message: "Invalid ID" });
    const item = await ClientItem.findOneAndDelete({ _id: itemId, clientId });
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "client item has been successfully deleted",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** List all client items (for customer form dropdown – select itemNumber from client item list) */
exports.listAll = async (req, res) => {
  try {
    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: ["itemNumber"],
      filterSchema: { ...FILTER_SCHEMA, clientId: "ObjectId" },
    });
    const [data, total] = await Promise.all([
      ClientItem.find(query)
        .select("-oldItemName")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate("clientId", "clientName")
        .populate("itemTypeId")
        .lean(),
      ClientItem.countDocuments(query),
    ]);
    res.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
