const ItemType = require("../models/itemType");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["itemType"];
const FILTER_SCHEMA = {};

async function listCore(req, res, listParams = {}) {
  try {
    const queryInput = { ...req.query, ...listParams };
    const reqForList = { ...req, query: queryInput };
    const { query, skip, limit, sort, page } = buildListQuery(reqForList, {
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
}

exports.list = async (req, res) => listCore(req, res);

exports.listPost = async (req, res) => listCore(req, res, req.body || {});

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
    const itemType = String(req.body.itemType || "").trim();
    if (!itemType)
      return res.status(400).json({ message: "itemType is required" });

    const existingType = await ItemType.findOne({ itemType })
      .collation({ locale: "en", strength: 2 })
      .lean();
    if (existingType) {
      return res.status(409).json({ message: "itemType already exists" });
    }

    await ItemType.create({ itemType });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "type has been successfully created",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    if (req.body.itemType !== undefined) {
      const itemType = String(req.body.itemType || "").trim();
      if (!itemType) return res.status(400).json({ message: "itemType is required" });

      const existingType = await ItemType.findOne({
        _id: { $ne: req.params.id },
        itemType,
      })
        .collation({ locale: "en", strength: 2 })
        .lean();
      if (existingType) {
        return res.status(409).json({ message: "itemType already exists" });
      }

      req.body.itemType = itemType;
    }

    const doc = await ItemType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Item type not found" });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "type has been successfully updated",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await ItemType.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Item type not found" });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "type has been successfully deleted",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
