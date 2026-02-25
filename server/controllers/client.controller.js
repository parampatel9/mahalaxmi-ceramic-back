const Client = require("../models/client");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["clientName"];
const FILTER_SCHEMA = { totalItem: "number" };

exports.list = async (req, res) => {
  try {
    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });
    const [data, total] = await Promise.all([
      Client.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Client.countDocuments(query),
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
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { clientName, totalItem } = req.body;
    if (!clientName) return res.status(400).json({ message: "clientName is required" });
    const client = await Client.create({
      clientName,
      totalItem: totalItem != null ? Number(totalItem) : 0,
    });
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json({ message: "Client deleted", id: client._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
