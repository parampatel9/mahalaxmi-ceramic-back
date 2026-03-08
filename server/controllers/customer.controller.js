const Customer = require("../models/customer");
const ClientItem = require("../models/clientItem");
const ClientHistory = require("../models/clientHistory");
const { buildListQuery } = require("../utils/listQuery");

const SEARCH_FIELDS = [];
const FILTER_SCHEMA = { billNumber: "number", grandTotal: "number" };

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeCustomerFields(payload) {
  const customerName = String(payload.customerName || "").trim();
  const address = String(payload.address || "").trim();
  const mobileNumber = String(payload.mobileNumber || "").trim();

  if (!customerName) throw new ValidationError("customerName is required");
  if (!address) throw new ValidationError("address is required");
  if (!mobileNumber) throw new ValidationError("mobileNumber is required");
  if (payload.date == null || payload.date === "") throw new ValidationError("date is required");

  const date = new Date(payload.date);
  if (Number.isNaN(date.getTime())) throw new ValidationError("date must be a valid date");

  return { customerName, address, mobileNumber, date };
}

function normalizeItems(payload) {
  if (Array.isArray(payload.items)) return payload.items;

  const toArray = (value) => (Array.isArray(value) ? value : value != null ? [value] : []);
  const itemNumbers = toArray(payload.itemNumber);
  const boxQuantities = toArray(payload.boxQuantity);
  const returnBoxQuantities = toArray(payload.returnBoxQuantity);
  const sellPrices = toArray(payload.sellPrice);
  const sizes = toArray(payload.size);

  const length = Math.max(
    itemNumbers.length,
    boxQuantities.length,
    returnBoxQuantities.length,
    sellPrices.length,
    sizes.length
  );

  if (!length) return [];

  return Array.from({ length }).map((_, index) => ({
    itemNumber: itemNumbers[index],
    boxQuantity: boxQuantities[index],
    returnBoxQuantity: returnBoxQuantities[index],
    sellPrice: sellPrices[index],
    size: sizes[index],
  }));
}

function sanitizeItems(rawItems) {
  if (!rawItems.length) throw new ValidationError("items are required");

  return rawItems.map((row, index) => {
    const rowNumber = index + 1;
    const current = row || {};

    const itemNumber = String(current.itemNumber || "").trim();
    const boxQuantity = Number(current.boxQuantity);
    const returnBoxQuantity =
      current.returnBoxQuantity == null || current.returnBoxQuantity === ""
        ? 0
        : Number(current.returnBoxQuantity);
    const sellPrice = Number(current.sellPrice);
    const size = current.size != null ? String(current.size).trim() : "";

    if (!itemNumber) {
      throw new ValidationError(`itemNumber is required at row ${rowNumber}`);
    }
    if (current.boxQuantity == null || current.boxQuantity === "" || Number.isNaN(boxQuantity) || boxQuantity < 0) {
      throw new ValidationError(`boxQuantity must be a non-negative number at row ${rowNumber}`);
    }
    if (current.sellPrice == null || current.sellPrice === "" || Number.isNaN(sellPrice) || sellPrice < 0) {
      throw new ValidationError(`sellPrice must be a non-negative number at row ${rowNumber}`);
    }
    if (Number.isNaN(returnBoxQuantity) || returnBoxQuantity < 0) {
      throw new ValidationError(`returnBoxQuantity must be a non-negative number at row ${rowNumber}`);
    }
    if (returnBoxQuantity > boxQuantity) {
      throw new ValidationError(`returnBoxQuantity cannot be greater than boxQuantity at row ${rowNumber}`);
    }

    const total = boxQuantity * sellPrice;
    const returnTotal = returnBoxQuantity * sellPrice;

    return {
      itemNumber,
      boxQuantity,
      returnBoxQuantity,
      size,
      sellPrice,
      total,
      returnTotal,
    };
  });
}

function calculateBillTotals(items) {
  const grossTotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const grandReturnTotal = items.reduce((sum, item) => sum + Number(item.returnTotal || 0), 0);
  const grandTotal = grossTotal - grandReturnTotal;

  return { grossTotal, grandReturnTotal, grandTotal };
}

function normalizePaymentFields(payload, grandTotal) {
  const paymentStatus = String(payload.paymentStatus || "").trim().toLowerCase();
  if (!paymentStatus) throw new ValidationError("paymentStatus is required");
  if (!["paid", "unpaid"].includes(paymentStatus)) {
    throw new ValidationError("paymentStatus must be either paid or unpaid");
  }

  if (paymentStatus === "paid") {
    return {
      paymentStatus: "paid",
      paidAmount: grandTotal,
      unpaidAmount: 0,
    };
  }

  const paidAmount = Number(payload.paidAmount);
  if (payload.paidAmount == null || payload.paidAmount === "" || Number.isNaN(paidAmount) || paidAmount < 0) {
    throw new ValidationError("paidAmount must be a non-negative number when paymentStatus is unpaid");
  }
  if (paidAmount > grandTotal) {
    throw new ValidationError("paidAmount cannot be greater than grandTotal");
  }

  return {
    paymentStatus: "unpaid",
    paidAmount,
    unpaidAmount: grandTotal - paidAmount,
  };
}

function withCalculatedItemFields(items = []) {
  return items.map((item) => {
    const boxQuantity = Number(item.boxQuantity || 0);
    const returnBoxQuantity = Number(item.returnBoxQuantity || 0);
    const sellPrice = Number(item.sellPrice || 0);

    return {
      ...item,
      boxQuantity,
      returnBoxQuantity,
      sellPrice,
      total: boxQuantity * sellPrice,
      returnTotal: returnBoxQuantity * sellPrice,
    };
  });
}

function toCustomerResponse(row) {
  const items = withCalculatedItemFields(row.items || []);
  const { grandReturnTotal, grandTotal } = calculateBillTotals(items);

  let paymentStatus = String(row.paymentStatus || "").toLowerCase();
  if (!["paid", "unpaid"].includes(paymentStatus)) paymentStatus = "unpaid";

  const paidAmount = paymentStatus === "paid" ? grandTotal : Math.max(0, Number(row.paidAmount || 0));
  const safePaidAmount = Math.min(paidAmount, grandTotal);
  const unpaidAmount = grandTotal - safePaidAmount;

  return {
    ...row,
    items,
    grandTotal,
    grandReturnTotal,
    paidAmount: safePaidAmount,
    unpaidAmount,
    paymentStatus: unpaidAmount === 0 ? "paid" : paymentStatus,
  };
}

function buildListOptions(source) {
  const fakeReq = { query: source };
  return buildListQuery(fakeReq, {
    searchFields: SEARCH_FIELDS,
    filterSchema: FILTER_SCHEMA,
  });
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

function applyCustomerSearch(query, searchText) {
  if (!searchText) return;

  const searchOr = [
    { customerName: new RegExp(searchText, "i") },
    { mobileNumber: new RegExp(searchText, "i") },
  ];

  if (/^\d+$/.test(searchText)) {
    searchOr.push({ grandTotal: Number(searchText) });
  }

  query.$or = searchOr;
}

async function sendListResponse(req, res, source) {
  try {
    const queryInput = source ?? req.query;
    const { query, skip, limit, sort, page } = buildListOptions(queryInput);
    applyCustomerSearch(query, extractSearchText(queryInput));

    const [rows, total] = await Promise.all([
      Customer.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Customer.countDocuments(query),
    ]);

    const data = rows.map((row) => toCustomerResponse(row));

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

exports.checkMobile = async (req, res) => {
  try {
    const mobile = String(req.query.mobile || "").trim();
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ message: "mobile must be exactly 10 digits" });
    }

    const rawLimit = req.query.limit;
    const parsedLimit =
      rawLimit == null || rawLimit === ""
        ? 5
        : Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ message: "limit must be a positive integer" });
    }
    const recentLimit = Math.min(50, parsedLimit);

    const [count, recentBills] = await Promise.all([
      Customer.countDocuments({ mobileNumber: mobile }),
      Customer.find({ mobileNumber: mobile })
        .select({ billNumber: 1, date: 1, customerName: 1 })
        .sort({ billNumber: -1, createdAt: -1 })
        .limit(recentLimit)
        .lean(),
    ]);

    return res.json({
      exists: count > 0,
      mobile,
      count,
      recentBills: recentBills.map((row) => ({
        _id: row._id,
        billNumber: row.billNumber,
        date: row.date,
        customerName: row.customerName,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(toCustomerResponse(customer));
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

exports.create = async (req, res) => {
  try {
    let customerFields;
    try {
      customerFields = normalizeCustomerFields(req.body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }

    const { billNumber } = req.body;
    if (billNumber == null || billNumber === "") return res.status(400).json({ message: "billNumber is required" });

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

    const { grandReturnTotal, grandTotal } = calculateBillTotals(sanitizedItems);

    let paymentFields;
    try {
      paymentFields = normalizePaymentFields(req.body, grandTotal);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }

    const customer = await Customer.create({
      ...customerFields,
      billNumber: billNum,
      items: sanitizedItems,
      grandTotal,
      grandReturnTotal,
      ...paymentFields,
      paymentHistory:
        Number(paymentFields.paidAmount || 0) > 0
          ? [
              {
                amount: Number(paymentFields.paidAmount),
                date: customerFields.date,
              },
            ]
          : [],
    });

    const clientItemByNumber = new Map(clientItems.map((item) => [item.itemNumber, item]));
    const historyRows = sanitizedItems.flatMap((item) => {
      const clientItem = clientItemByNumber.get(item.itemNumber);
      const actualPrice = Number(clientItem.actualPrice || 0);
      const rows = [];

      rows.push({
        clientId: clientItem.clientId,
        billNumber: customer.billNumber,
        itemNumber: item.itemNumber,
        size: item.size || "",
        boxQuantity: item.boxQuantity,
        actualPrice,
        totalPrice: actualPrice * item.boxQuantity,
        entryType: "sale",
        date: customerFields.date,
      });

      if (item.returnBoxQuantity > 0) {
        rows.push({
          clientId: clientItem.clientId,
          billNumber: customer.billNumber,
          itemNumber: item.itemNumber,
          size: item.size || "",
          boxQuantity: item.returnBoxQuantity,
          actualPrice,
          totalPrice: -(actualPrice * item.returnBoxQuantity),
          entryType: "return",
          date: customerFields.date,
        });
      }

      return rows;
    });

    if (historyRows.length) await ClientHistory.insertMany(historyRows);

    res.status(201).json({ message: "create sucessfully", customer: toCustomerResponse(customer.toObject()) });
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
    const existingCustomer = await Customer.findById(req.params.id).lean();
    if (!existingCustomer) return res.status(404).json({ message: "Customer not found" });

    let customerFields;
    try {
      customerFields = normalizeCustomerFields(payload);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }

    payload.customerName = customerFields.customerName;
    payload.address = customerFields.address;
    payload.mobileNumber = customerFields.mobileNumber;
    payload.date = customerFields.date;

    if (payload.billNumber != null && payload.billNumber !== "") {
      const billNum = Number(payload.billNumber);
      if (Number.isNaN(billNum) || billNum < 0) {
        return res.status(400).json({ message: "billNumber must be a non-negative number" });
      }

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
    } else {
      return res.status(400).json({ message: "billNumber is required" });
    }

    const itemFields = ["items", "itemNumber", "boxQuantity", "returnBoxQuantity", "sellPrice", "size"];
    const hasItemPayload = itemFields.some((field) => payload[field] != null);

    let finalItems;
    if (hasItemPayload) {
      const rawItems = normalizeItems(payload);
      try {
        finalItems = sanitizeItems(rawItems);
      } catch (error) {
        if (error instanceof ValidationError) {
          return res.status(error.status).json({ message: error.message });
        }
        throw error;
      }
    } else {
      finalItems = withCalculatedItemFields(existingCustomer.items || []);
    }

    const { grandReturnTotal, grandTotal } = calculateBillTotals(finalItems);
    payload.items = finalItems;
    payload.grandTotal = grandTotal;
    payload.grandReturnTotal = grandReturnTotal;

    let paymentFields;
    try {
      paymentFields = normalizePaymentFields(payload, grandTotal);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }

    payload.paymentStatus = paymentFields.paymentStatus;
    payload.paidAmount = paymentFields.paidAmount;
    payload.unpaidAmount = paymentFields.unpaidAmount;

    const previousPaidAmount = Math.max(0, Number(existingCustomer.paidAmount || 0));
    const nextPaidAmount = Math.max(0, Number(paymentFields.paidAmount || 0));
    const paidDiff = nextPaidAmount - previousPaidAmount;
    const existingPaymentHistory = Array.isArray(existingCustomer.paymentHistory)
      ? [...existingCustomer.paymentHistory]
      : [];
    if (existingPaymentHistory.length === 0 && previousPaidAmount > 0) {
      existingPaymentHistory.push({
        amount: previousPaidAmount,
        date: existingCustomer.date || new Date(),
      });
    }
    if (paidDiff > 0) {
      existingPaymentHistory.push({
        amount: paidDiff,
        date: payload.date || new Date(),
      });
    }
    payload.paymentHistory = existingPaymentHistory;

    const uniqueItemNumbers = [...new Set(finalItems.map((item) => item.itemNumber))];
    const clientItems = await ClientItem.find({ itemNumber: { $in: uniqueItemNumbers } }).lean();
    if (clientItems.length !== uniqueItemNumbers.length) {
      const existing = new Set(clientItems.map((item) => item.itemNumber));
      const missing = uniqueItemNumbers.find((itemNumber) => !existing.has(itemNumber));
      return res.status(400).json({
        message: `itemNumber not found in client items: ${missing}. Select valid items from client item list.`,
      });
    }

    const clientItemByNumber = new Map(clientItems.map((item) => [item.itemNumber, item]));
    const historyRows = finalItems.flatMap((item) => {
      const clientItem = clientItemByNumber.get(item.itemNumber);
      const actualPrice = Number(clientItem.actualPrice || 0);
      const rows = [];

      rows.push({
        clientId: clientItem.clientId,
        billNumber: payload.billNumber,
        itemNumber: item.itemNumber,
        size: item.size || "",
        boxQuantity: item.boxQuantity,
        actualPrice,
        totalPrice: actualPrice * item.boxQuantity,
        entryType: "sale",
        date: payload.date,
      });

      if (item.returnBoxQuantity > 0) {
        rows.push({
          clientId: clientItem.clientId,
          billNumber: payload.billNumber,
          itemNumber: item.itemNumber,
          size: item.size || "",
          boxQuantity: item.returnBoxQuantity,
          actualPrice,
          totalPrice: -(actualPrice * item.returnBoxQuantity),
          entryType: "return",
          date: payload.date,
        });
      }

      return rows;
    });

    const updated = await Customer.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    await ClientHistory.deleteMany({ billNumber: existingCustomer.billNumber });
    if (historyRows.length) await ClientHistory.insertMany(historyRows);

    res.json({ message: "update successfully", customer: toCustomerResponse(updated.toObject()) });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.billNumber) {
      return res.status(400).json({ message: "billNumber already exists" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const amount = Number(req.body.amount);
    if (req.body.amount == null || req.body.amount === "" || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const grandTotal = Number(customer.grandTotal || 0);
    const currentPaidAmount = Math.max(0, Number(customer.paidAmount || 0));
    const totalPaid = currentPaidAmount + amount;
    const unpaidAmount = Math.max(0, grandTotal - totalPaid);
    const paymentStatus = unpaidAmount === 0 ? "paid" : "unpaid";

    const paymentDate = req.body.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(paymentDate.getTime())) {
      return res.status(400).json({ message: "date must be a valid date" });
    }

    if (!Array.isArray(customer.paymentHistory)) {
      customer.paymentHistory = [];
    }
    // Backfill old records where paidAmount existed but payment history was never stored.
    if (customer.paymentHistory.length === 0 && currentPaidAmount > 0) {
      customer.paymentHistory.push({
        amount: currentPaidAmount,
        date: customer.date || new Date(),
      });
    }

    customer.paymentHistory.push({
      amount,
      date: paymentDate,
    });
    customer.paidAmount = totalPaid;
    customer.unpaidAmount = unpaidAmount;
    customer.paymentStatus = paymentStatus;

    await customer.save();

    return res.status(201).json({
      message: "payment added successfully",
      customer: toCustomerResponse(customer.toObject()),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .select({ billNumber: 1, grandTotal: 1, paidAmount: 1, unpaidAmount: 1, paymentHistory: 1 })
      .lean();

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    let payments = Array.isArray(customer.paymentHistory) ? [...customer.paymentHistory] : [];
    if (payments.length === 0 && Number(customer.paidAmount || 0) > 0) {
      payments = [{ amount: Number(customer.paidAmount || 0), date: new Date() }];
      await Customer.updateOne(
        { _id: customer._id },
        {
          $set: {
            paymentHistory: payments,
          },
        }
      );
    }
    payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return res.json({
      billNumber: customer.billNumber,
      grandTotal: Number(customer.grandTotal || 0),
      paidAmount: Number(customer.paidAmount || 0),
      unpaidAmount: Number(customer.unpaidAmount || 0),
      payments: payments.map((row) => ({
        amount: Number(row.amount || 0),
        date: row.date,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).select({ _id: 1, billNumber: 1 }).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    await Promise.all([
      Customer.deleteOne({ _id: customer._id }),
      ClientHistory.deleteMany({ billNumber: customer.billNumber }),
    ]);

    res.json({ message: "Customer deleted", id: customer._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
