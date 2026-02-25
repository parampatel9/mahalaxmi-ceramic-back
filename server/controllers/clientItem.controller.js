const ClientItem = require("../models/clientItem");
const Client = require("../models/client");
const { buildListQuery } = require("../utils/listQuery");
const mongoose = require("mongoose");

const SEARCH_FIELDS = ["itemNumber"];
const FILTER_SCHEMA = { actualPrice: "number" };

function getListOptions(req, clientId) {
  const opts = buildListQuery(req, {
    searchFields: SEARCH_FIELDS,
    filterSchema: FILTER_SCHEMA,
  });
  opts.query.clientId = new mongoose.Types.ObjectId(clientId);
  return opts;
}

exports.list = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId))
      return res.status(400).json({ message: "Invalid client ID" });
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const { query, skip, limit, sort, page } = getListOptions(req, clientId);
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
};

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

    const { itemNumber, actualPrice, itemTypeId } = req.body;
    if (!itemNumber) return res.status(400).json({ message: "itemNumber is required" });
    if (!itemTypeId) return res.status(400).json({ message: "itemTypeId is required" });
    if (!mongoose.Types.ObjectId.isValid(itemTypeId))
      return res.status(400).json({ message: "Invalid itemTypeId" });

    const price = Number(actualPrice);
    if (actualPrice == null || actualPrice === "" || Number.isNaN(price) || price < 0)
      return res.status(400).json({ message: "actualPrice is required and must be a non-negative number" });

    const created = await ClientItem.create({
      clientId,
      itemNumber: String(itemNumber).trim(),
      actualPrice: price,
      itemTypeId,
    });
    const item = await ClientItem.findById(created._id).populate("itemTypeId").lean();
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id: clientId, itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId) || !mongoose.Types.ObjectId.isValid(itemId))
      return res.status(400).json({ message: "Invalid ID" });
    const updated = await ClientItem.findOneAndUpdate(
      { _id: itemId, clientId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Item not found" });
    const item = await ClientItem.findById(updated._id).populate("itemTypeId").lean();
    res.json(item);
  } catch (error) {
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
    res.json({ message: "Item deleted", id: item._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** List all client items (for customer form dropdown – select itemNumber from client item list) */
exports.listAll = async (req, res) => {
  try {
    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: SEARCH_FIELDS,
      filterSchema: { ...FILTER_SCHEMA, clientId: "ObjectId" },
    });
    const [data, total] = await Promise.all([
      ClientItem.find(query)
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
