const Client = require("../models/client");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["clientName"];
const FILTER_SCHEMA = {};

async function listCore(req, res, listParams = {}) {
  try {
    const queryInput = { ...req.query, ...listParams };
    const reqForList = { ...req, query: queryInput };
    const { query, skip, limit, sort, page } = buildListQuery(reqForList, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });
    const totalItemFilterRaw = queryInput.totalItem ?? queryInput["filter[totalItem]"];
    const totalItemFilter =
      totalItemFilterRaw !== undefined && totalItemFilterRaw !== ""
        ? Number(totalItemFilterRaw)
        : null;
    if (totalItemFilterRaw !== undefined && totalItemFilterRaw !== "" && Number.isNaN(totalItemFilter)) {
      return res.status(400).json({ message: "totalItem must be a number" });
    }

    const basePipeline = [
      { $match: query },
      {
        $lookup: {
          from: "clientitems",
          localField: "_id",
          foreignField: "clientId",
          as: "clientItems",
        },
      },
      {
        $addFields: {
          totalItem: { $size: "$clientItems" },
        },
      },
      { $project: { clientItems: 0 } },
    ];

    if (totalItemFilter !== null) {
      basePipeline.push({ $match: { totalItem: totalItemFilter } });
    }

    const [data, totalRows] = await Promise.all([
      Client.aggregate([...basePipeline, { $sort: sort }, { $skip: skip }, { $limit: limit }]),
      Client.aggregate([...basePipeline, { $count: "count" }]),
    ]);
    const total = totalRows[0]?.count || 0;

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
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { totalItem } = req.body;
    const clientName = String(req.body.clientName || "").trim();
    if (!clientName) return res.status(400).json({ message: "clientName is required" });

    const existingClient = await Client.findOne({ clientName })
      .collation({ locale: "en", strength: 2 })
      .lean();
    if (existingClient) {
      return res.status(409).json({ message: "clientName already exists" });
    }

    await Client.create({
      clientName,
      totalItem: totalItem != null ? Number(totalItem) : 0,
    });
    res.status(200).json({
      status: 200,
      message: "Success",
      data: "client has been successfully created",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    if (req.body.clientName !== undefined) {
      const clientName = String(req.body.clientName || "").trim();
      if (!clientName) return res.status(400).json({ message: "clientName is required" });

      const existingClient = await Client.findOne({
        _id: { $ne: req.params.id },
        clientName,
      })
        .collation({ locale: "en", strength: 2 })
        .lean();
      if (existingClient) {
        return res.status(409).json({ message: "clientName already exists" });
      }

      req.body.clientName = clientName;
    }

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
