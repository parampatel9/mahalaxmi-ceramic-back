const ClientItem = require("../models/clientItem");
const Client = require("../models/client");
const ItemType = require("../models/itemType");
const { buildListQuery } = require("../utils/listQuery");
const mongoose = require("mongoose");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");

const SEARCH_FIELDS = ["itemNumber", "oldItemName"];
const FILTER_SCHEMA = { actualPrice: "number", itemTypeId: "ObjectId" };
const SUPPORTED_IMPORT_EXTENSIONS = new Set([".xlsx", ".csv"]);
const REQUIRED_IMPORT_COLUMNS = ["itemNumber", "oldItemName", "actualPrice", "itemTypeId"];

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseImportFile(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (!SUPPORTED_IMPORT_EXTENSIONS.has(extension)) {
    return { errors: [{ row: 1, field: "file", message: "Only .xlsx and .csv files are supported" }] };
  }

  let workbook;
  try {
    workbook = XLSX.read(file.buffer, { type: "buffer", raw: false });
  } catch (error) {
    return { errors: [{ row: 1, field: "file", message: "Failed to parse uploaded file" }] };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { errors: [{ row: 1, field: "file", message: "Uploaded file has no sheets" }] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
  if (!rows.length) {
    return { errors: [{ row: 1, field: "file", message: "Uploaded file is empty" }] };
  }

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const headerIndex = new Map();
  headerRow.forEach((headerCell, idx) => {
    const key = normalizeHeader(headerCell);
    if (key && !headerIndex.has(key)) headerIndex.set(key, idx);
  });

  const missingColumns = REQUIRED_IMPORT_COLUMNS.filter((column) => !headerIndex.has(normalizeHeader(column)));
  if (missingColumns.length) {
    return {
      errors: missingColumns.map((column) => ({
        row: 1,
        field: column,
        message: `Missing required column: ${column}`,
      })),
    };
  }

  const parsedRows = [];
  for (let i = 1; i < rows.length; i += 1) {
    const rowValues = Array.isArray(rows[i]) ? rows[i] : [];
    const isCompletelyEmpty = rowValues.every(
      (value) => value == null || String(value).trim() === ""
    );
    if (isCompletelyEmpty) continue;

    parsedRows.push({
      row: i + 1,
      itemNumber: rowValues[headerIndex.get("itemnumber")],
      oldItemName: rowValues[headerIndex.get("olditemname")],
      actualPrice: rowValues[headerIndex.get("actualprice")],
      itemTypeId: rowValues[headerIndex.get("itemtypeid")],
    });
  }

  if (!parsedRows.length) {
    return { errors: [{ row: 2, field: "file", message: "No data rows found to import" }] };
  }

  return { rows: parsedRows };
}

async function resolveItemTypeMappings(values) {
  const uniqueValues = [...new Set(values.filter((v) => String(v || "").trim() !== ""))];
  const objectIdInputs = uniqueValues.filter((value) => mongoose.Types.ObjectId.isValid(String(value)));
  const nameInputs = uniqueValues.filter((value) => !mongoose.Types.ObjectId.isValid(String(value)));

  const [typeByIdRows, typeByNameRows] = await Promise.all([
    objectIdInputs.length
      ? ItemType.find({ _id: { $in: objectIdInputs } }).select("_id").lean()
      : [],
    nameInputs.length
      ? ItemType.find({ itemType: { $in: nameInputs } })
          .select("_id itemType")
          .collation({ locale: "en", strength: 2 })
          .lean()
      : [],
  ]);

  const byId = new Map(typeByIdRows.map((row) => [String(row._id), String(row._id)]));
  const byName = new Map(typeByNameRows.map((row) => [String(row.itemType).toLowerCase(), String(row._id)]));
  return { byId, byName };
}

async function validateImportRows(clientId, parsedRows) {
  const errors = [];
  const seenItemNumbers = new Map();
  const seenOldItemNames = new Map();
  const normalizedRows = [];

  parsedRows.forEach((row) => {
    const itemNumber = String(row.itemNumber || "").trim();
    const oldItemName = String(row.oldItemName || "").trim();
    const itemTypeIdInput = String(row.itemTypeId || "").trim();
    const actualPriceRaw = row.actualPrice;
    const actualPrice = Number(actualPriceRaw);

    if (!itemNumber) {
      errors.push({ row: row.row, field: "itemNumber", message: "itemNumber is required" });
    }
    if (!oldItemName) {
      errors.push({ row: row.row, field: "oldItemName", message: "oldItemName is required" });
    }
    if (actualPriceRaw == null || String(actualPriceRaw).trim() === "" || Number.isNaN(actualPrice)) {
      errors.push({ row: row.row, field: "actualPrice", message: "Actual price must be a number" });
    } else if (actualPrice < 0) {
      errors.push({ row: row.row, field: "actualPrice", message: "Actual price must be non-negative" });
    }
    if (!itemTypeIdInput) {
      errors.push({ row: row.row, field: "itemTypeId", message: "itemTypeId is required" });
    }

    const normalizedItemNumber = itemNumber.toLowerCase();
    const normalizedOldItemName = oldItemName.toLowerCase();

    if (itemNumber) {
      if (seenItemNumbers.has(normalizedItemNumber)) {
        errors.push({
          row: row.row,
          field: "itemNumber",
          message: `Duplicate itemNumber in file (first seen at row ${seenItemNumbers.get(normalizedItemNumber)})`,
        });
      } else {
        seenItemNumbers.set(normalizedItemNumber, row.row);
      }
    }

    if (oldItemName) {
      if (seenOldItemNames.has(normalizedOldItemName)) {
        errors.push({
          row: row.row,
          field: "oldItemName",
          message: `Duplicate oldItemName in file (first seen at row ${seenOldItemNames.get(normalizedOldItemName)})`,
        });
      } else {
        seenOldItemNames.set(normalizedOldItemName, row.row);
      }
    }

    normalizedRows.push({
      row: row.row,
      itemNumber,
      oldItemName,
      actualPrice,
      itemTypeIdInput,
      normalizedItemNumber,
      normalizedOldItemName,
      clientId,
    });
  });

  const { byId, byName } = await resolveItemTypeMappings(normalizedRows.map((row) => row.itemTypeIdInput));
  normalizedRows.forEach((row) => {
    const itemTypeIdRaw = row.itemTypeIdInput;
    const asObjectIdKey = mongoose.Types.ObjectId.isValid(itemTypeIdRaw) ? String(itemTypeIdRaw) : null;
    const asNameKey = String(itemTypeIdRaw).toLowerCase();
    const resolvedItemTypeId = (asObjectIdKey && byId.get(asObjectIdKey)) || byName.get(asNameKey);
    if (!resolvedItemTypeId) {
      errors.push({
        row: row.row,
        field: "itemTypeId",
        message: "itemTypeId not found",
      });
      return;
    }
    row.itemTypeId = resolvedItemTypeId;
  });

  const uniqueItemNumbers = [...new Set(normalizedRows.map((row) => row.itemNumber).filter(Boolean))];
  const uniqueOldItemNames = [...new Set(normalizedRows.map((row) => row.oldItemName).filter(Boolean))];

  const [existingItemNumberDocs, existingOldItemNameDocs] = await Promise.all([
    uniqueItemNumbers.length
      ? ClientItem.find({ itemNumber: { $in: uniqueItemNumbers } })
          .select("itemNumber")
          .collation({ locale: "en", strength: 2 })
          .lean()
      : [],
    uniqueOldItemNames.length
      ? ClientItem.find({ oldItemName: { $in: uniqueOldItemNames } })
          .select("oldItemName")
          .collation({ locale: "en", strength: 2 })
          .lean()
      : [],
  ]);

  const existingItemNumbers = new Set(
    existingItemNumberDocs.map((doc) => String(doc.itemNumber || "").toLowerCase())
  );
  const existingOldItemNames = new Set(
    existingOldItemNameDocs.map((doc) => String(doc.oldItemName || "").toLowerCase())
  );

  normalizedRows.forEach((row) => {
    if (row.itemNumber && existingItemNumbers.has(row.normalizedItemNumber)) {
      errors.push({
        row: row.row,
        field: "itemNumber",
        message: "Item number already exists",
      });
    }
    if (row.oldItemName && existingOldItemNames.has(row.normalizedOldItemName)) {
      errors.push({
        row: row.row,
        field: "oldItemName",
        message: "Old item name already exists",
      });
    }
  });

  const sortedErrors = errors.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return String(a.field).localeCompare(String(b.field));
  });

  const docs = normalizedRows.map((row) => ({
    clientId: row.clientId,
    itemNumber: row.itemNumber,
    oldItemName: row.oldItemName,
    actualPrice: row.actualPrice,
    itemTypeId: row.itemTypeId,
  }));

  return { errors: sortedErrors, docs };
}

function extractSearchText(query = {}) {
  const rawSearch =
    typeof query.search === "string"
      ? query.search
      : typeof query.searchFields === "string"
      ? query.searchFields
      : "";
  return rawSearch.trim();
}

async function includeItemTypeSearch(query, searchText) {
  if (!searchText) return;

  const matchingTypes = await ItemType.find({
    itemType: new RegExp(searchText, "i"),
  })
    .select("_id")
    .lean();

  if (!matchingTypes.length) return;

  const typeFilter = { itemTypeId: { $in: matchingTypes.map((doc) => doc._id) } };
  if (Array.isArray(query.$or) && query.$or.length) {
    query.$or.push(typeFilter);
  } else {
    query.$or = [typeFilter];
  }
}

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

    await includeItemTypeSearch(query, extractSearchText(queryInput));
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
    const oldItemName = String(req.body.oldItemName || "").trim();
    if (!itemNumber) return res.status(400).json({ message: "itemNumber is required" });
    if (!oldItemName) return res.status(400).json({ message: "oldItemName is required" });
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

    const existingOldItemName = await ClientItem.findOne({ oldItemName })
      .collation({ locale: "en", strength: 2 })
      .lean();
    if (existingOldItemName) {
      return res.status(409).json({ message: "oldItemName already exists" });
    }

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
      const oldItemName = String(req.body.oldItemName || "").trim();
      if (!oldItemName) return res.status(400).json({ message: "oldItemName is required" });

      const existingName = await ClientItem.findOne({
        _id: { $ne: itemId },
        oldItemName,
      })
        .collation({ locale: "en", strength: 2 })
        .lean();
      if (existingName) {
        return res.status(409).json({ message: "oldItemName already exists" });
      }

      req.body.oldItemName = oldItemName;
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
      const duplicateField = Object.keys(error?.keyPattern || {})[0];
      return res.status(409).json({ message: `${duplicateField || "field"} already exists` });
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

exports.importUpload = importUpload.single("file");

exports.bulkImport = async (req, res) => {
  try {
    const { id: clientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, errors: [{ row: 1, field: "clientId", message: "Invalid client ID" }] });
    }

    const client = await Client.findById(clientId).select("_id").lean();
    if (!client) {
      return res.status(404).json({ success: false, errors: [{ row: 1, field: "clientId", message: "Client not found" }] });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        errors: [{ row: 1, field: "file", message: "file is required" }],
      });
    }

    const parsed = parseImportFile(req.file);
    if (parsed.errors?.length) {
      return res.status(400).json({ success: false, errors: parsed.errors });
    }

    const { errors, docs } = await validateImportRows(clientId, parsed.rows);
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const inserted = await ClientItem.insertMany(docs);
    return res.status(200).json({
      success: true,
      message: "Items imported successfully",
      count: inserted.length,
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        errors: [{ row: 1, field: "file", message: error.message }],
      });
    }
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error?.keyPattern || {})[0] || "field";
      return res.status(409).json({
        success: false,
        errors: [{ row: 1, field: duplicateField, message: `${duplicateField} already exists` }],
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** List all client items (for customer form dropdown – select itemNumber from client item list) */
exports.listAll = async (req, res) => {
  try {
    const searchText = extractSearchText(req.query);
    const { query, sort } = buildListQuery(req, {
      searchFields: ["itemNumber"],
      filterSchema: { ...FILTER_SCHEMA, clientId: "ObjectId" },
    });
    await includeItemTypeSearch(query, searchText);
    const data = await ClientItem.find(query)
      .select("-oldItemName")
      .sort(sort)
      .populate("clientId", "clientName")
      .populate("itemTypeId")
      .lean();
    res.json({ data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
