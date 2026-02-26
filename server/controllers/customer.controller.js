const Customer = require("../models/customer");
const ClientItem = require("../models/clientItem");
const ClientHistory = require("../models/clientHistory");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = ["customerName", "items.itemNumber"];
const FILTER_SCHEMA = { billNumber: "number", grandTotal: "number" };

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeItems(payload) {
  if (Array.isArray(payload.items)) return payload.items;

  const toArray = (value) => (Array.isArray(value) ? value : value != null ? [value] : []);
  const itemNumbers = toArray(payload.itemNumber);
  const boxQuantities = toArray(payload.boxQuantity);
  const sellPrices = toArray(payload.sellPrice);
  const sizes = toArray(payload.size);
  const length = Math.max(itemNumbers.length, boxQuantities.length, sellPrices.length, sizes.length);
  if (!length) return [];

  return Array.from({ length }).map((_, index) => ({
    itemNumber: itemNumbers[index],
    boxQuantity: boxQuantities[index],
    sellPrice: sellPrices[index],
    size: sizes[index],
  }));
}

function sanitizeItems(rawItems) {
  if (!rawItems.length) throw new ValidationError("items are required");

  const sanitizedItems = [];
  rawItems.forEach((row, index) => {
    const rowNumber = index + 1;
    const current = row || {};
    const itemNumber = String(current.itemNumber || "").trim();
    const qty = Number(current.boxQuantity);
    const sellPrice = Number(current.sellPrice);
    const size = current.size != null ? String(current.size).trim() : "";

    if (!itemNumber) {
      throw new ValidationError(`itemNumber is required at row ${rowNumber}`);
    }
    if (current.boxQuantity == null || current.boxQuantity === "" || Number.isNaN(qty) || qty < 0) {
      throw new ValidationError(`boxQuantity must be a non-negative number at row ${rowNumber}`);
    }
    if (current.sellPrice == null || current.sellPrice === "" || Number.isNaN(sellPrice) || sellPrice < 0) {
      throw new ValidationError(`sellPrice must be a non-negative number at row ${rowNumber}`);
    }

    const total = qty * sellPrice;
    sanitizedItems.push({
      itemNumber,
      boxQuantity: qty,
      size,
      sellPrice,
      total,
    });
  });

  return sanitizedItems;
}

function buildListOptions(source) {
  const fakeReq = { query: source };
  return buildListQuery(fakeReq, {
    searchFields: SEARCH_FIELDS,
    filterSchema: FILTER_SCHEMA,
  });
}

async function sendListResponse(req, res, source) {
  try {
    const { query, skip, limit, sort, page } = buildListOptions(source ?? req.query);
    const [data, total] = await Promise.all([
      Customer.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Customer.countDocuments(query),
    ]);
    res.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

exports.list = async (req, res) => sendListResponse(req, res);

exports.listPost = async (req, res) => sendListResponse(req, res, req.body);

exports.getOne = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getNextBillNumber = async (req, res) => {
  try {
    const latestCustomer = await Customer.findOne({})
      .sort({ billNumber: -1 })
      .select({ billNumber: 1, _id: 0 })
      .lean();

    const maxBillNumber = latestCustomer?.billNumber ?? 0;
    const nextBillNumber = maxBillNumber + 1;

    res.json({ maxBillNumber, nextBillNumber });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Create customer (sell entry) and automatically create client history.
 * Client history uses clientitem.actualPrice × boxQuantity; sellPrice is not used for history.
 */
exports.create = async (req, res) => {
  try {
    const { customerName, billNumber } = req.body;
    if (!customerName || !String(customerName).trim())
      return res.status(400).json({ message: "customerName is required" });
    if (billNumber == null || billNumber === "")
      return res.status(400).json({ message: "billNumber is required" });

    const billNum = Number(billNumber);
    if (Number.isNaN(billNum) || billNum < 0)
      return res.status(400).json({ message: "billNumber must be a non-negative number" });

    const existingBill = await Customer.findOne({ billNumber: billNum }).select({ _id: 1 }).lean();
    if (existingBill) {
      return res.status(400).json({ message: `billNumber ${billNum} already exists` });
    }

    const rawItems = normalizeItems(req.body);
    let sanitizedItems;
    try {
      sanitizedItems = sanitizeItems(rawItems);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }

    const uniqueItemNumbers = [...new Set(sanitizedItems.map((item) => item.itemNumber))];
    const clientItems = await ClientItem.find({ itemNumber: { $in: uniqueItemNumbers } }).lean();
    if (clientItems.length !== uniqueItemNumbers.length) {
      const existing = new Set(clientItems.map((item) => item.itemNumber));
      const missing = uniqueItemNumbers.find((itemNumber) => !existing.has(itemNumber));
      return res.status(400).json({
        message: `itemNumber not found in client items: ${missing}. Select valid items from client item list.`,
      });
    }

    const clientItemByNumber = new Map(clientItems.map((item) => [item.itemNumber, item]));
    const grandTotal = sanitizedItems.reduce((sum, item) => sum + item.total, 0);

    const customer = await Customer.create({
      customerName: String(customerName).trim(),
      billNumber: billNum,
      items: sanitizedItems,
      grandTotal,
    });

    const historyRows = sanitizedItems.map((item) => {
      const clientItem = clientItemByNumber.get(item.itemNumber);
      const actualPrice = Number(clientItem.actualPrice || 0);
      return {
        clientId: clientItem.clientId,
        billNumber: customer.billNumber,
        itemNumber: item.itemNumber,
        boxQuantity: item.boxQuantity,
        actualPrice,
        totalPrice: actualPrice * item.boxQuantity,
      };
    });
    if (historyRows.length) await ClientHistory.insertMany(historyRows);

    res.status(201).json({ message: "create sucessfully" });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.billNumber) {
      return res.status(400).json({ message: "billNumber already exists" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.billNumber != null && payload.billNumber !== "") {
      const billNum = Number(payload.billNumber);
      if (Number.isNaN(billNum) || billNum < 0)
        return res.status(400).json({ message: "billNumber must be a non-negative number" });

      const existingBill = await Customer.findOne({
        billNumber: billNum,
        _id: { $ne: req.params.id },
      })
        .select({ _id: 1 })
        .lean();
      if (existingBill) {
        return res.status(400).json({ message: `billNumber ${billNum} already exists` });
      }

    payload.billNumber = billNum;
  }

  const itemFields = ["items", "itemNumber", "boxQuantity", "sellPrice", "size"];
  const hasItemPayload = itemFields.some((field) => payload[field] != null);
  if (hasItemPayload) {
    const rawItems = normalizeItems(payload);
    let sanitizedItems;
    try {
      sanitizedItems = sanitizeItems(rawItems);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }

    payload.items = sanitizedItems;
    payload.grandTotal = sanitizedItems.reduce((sum, item) => sum + item.total, 0);
  }

  const updated = await Customer.findByIdAndUpdate(
    req.params.id,
    payload,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Customer not found" });
    res.json({ message: "update successfully", customer: updated });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.billNumber) {
      return res.status(400).json({ message: "billNumber already exists" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ message: "Customer deleted", id: customer._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
