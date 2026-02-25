const ItemType = require("../models/itemType");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["itemType"];
const FILTER_SCHEMA = {};

exports.list = async (req, res) => {
  try {
    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });
    const [data, total] = await Promise.all([
      ItemType.find(query).sort(sort).skip(skip).limit(limit).lean(),
      ItemType.countDocuments(query),
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
    const itemType = await ItemType.findById(req.params.id).lean();
    if (!itemType) return res.status(404).json({ message: "Item type not found" });
    res.json(itemType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { itemType } = req.body;
    if (!itemType || !String(itemType).trim())
      return res.status(400).json({ message: "itemType is required" });
    const doc = await ItemType.create({ itemType: String(itemType).trim() });
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await ItemType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Item type not found" });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await ItemType.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Item type not found" });
    res.json({ message: "Item type deleted", id: doc._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
