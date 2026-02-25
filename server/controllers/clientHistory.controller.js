const ClientHistory = require("../models/clientHistory");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["itemNumber"];
const FILTER_SCHEMA = { billNumber: "number" };

/**
 * Client history is auto-generated on customer create. Only list, getOne, delete are exposed.
 */
exports.list = async (req, res) => {
  try {
    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });
    const [data, total] = await Promise.all([
      ClientHistory.find(query).sort(sort).skip(skip).limit(limit).lean(),
      ClientHistory.countDocuments(query),
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
    const doc = await ClientHistory.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Client history not found" });
    res.json(doc);
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
