const Customer = require("../models/customer");
const ClientItem = require("../models/clientItem");
const ClientHistory = require("../models/clientHistory");
const { buildListQuery } = require("../utils/listQuery");
const mongoose = require("mongoose");

const SEARCH_FIELDS = ["customerName", "itemNumber"];
const FILTER_SCHEMA = { billNumber: "number", sellPrice: "number", boxQuantity: "number" };

exports.list = async (req, res) => {
  try {
    const { query, skip, limit, sort, page } = buildListQuery(req, {
      searchFields: SEARCH_FIELDS,
      filterSchema: FILTER_SCHEMA,
    });
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
};

exports.getOne = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
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
    const { customerName, billNumber, itemNumber, boxQuantity, size, sellPrice } = req.body;
    if (!customerName || !String(customerName).trim())
      return res.status(400).json({ message: "customerName is required" });
    if (billNumber == null || billNumber === "")
      return res.status(400).json({ message: "billNumber is required" });
    if (!itemNumber || !String(itemNumber).trim())
      return res.status(400).json({ message: "itemNumber is required" });
    if (boxQuantity == null || boxQuantity === "")
      return res.status(400).json({ message: "boxQuantity is required" });
    if (sellPrice == null || sellPrice === "")
      return res.status(400).json({ message: "sellPrice is required" });

    const billNum = Number(billNumber);
    const qty = Number(boxQuantity);
    const price = Number(sellPrice);
    if (Number.isNaN(billNum) || billNum < 0)
      return res.status(400).json({ message: "billNumber must be a non-negative number" });
    if (Number.isNaN(qty) || qty < 0)
      return res.status(400).json({ message: "boxQuantity must be a non-negative number" });
    if (Number.isNaN(price) || price < 0)
      return res.status(400).json({ message: "sellPrice must be a non-negative number" });

    const clientItem = await ClientItem.findOne({ itemNumber: String(itemNumber).trim() }).lean();
    if (!clientItem)
      return res.status(400).json({
        message: "itemNumber not found in client items. Select a valid item from client item list.",
      });

    const actualPrice = clientItem.actualPrice;
    const totalPrice = actualPrice * qty;

    const customer = await Customer.create({
      customerName: String(customerName).trim(),
      billNumber: billNum,
      itemNumber: String(itemNumber).trim(),
      boxQuantity: qty,
      size: size != null ? String(size).trim() : "",
      sellPrice: price,
    });

    await ClientHistory.create({
      billNumber: customer.billNumber,
      itemNumber: customer.itemNumber,
      boxQuantity: customer.boxQuantity,
      actualPrice,
      totalPrice,
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Customer not found" });
    res.json(updated);
  } catch (error) {
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
