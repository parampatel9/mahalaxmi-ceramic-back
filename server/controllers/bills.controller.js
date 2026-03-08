const Customer = require("../models/customer");
const ClientItem = require("../models/clientItem");
const ClientHistory = require("../models/clientHistory");
const pdfGenerator = require("../utils/pdfGenerator");
const mongoose = require("mongoose");


function parseISODateOnly(rawDate) {
  if (!rawDate) return { error: "date is required" };
  const input = String(rawDate).trim();
  const date = input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be in YYYY-MM-DD format" };
  }

  const parsed = new Date(`${date}T00:00:00.000`);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "date must be a valid calendar date in YYYY-MM-DD format" };
  }

  // Day boundaries in server local timezone so day-wise UI matches stored business dates.
  const start = new Date(`${date}T00:00:00.000`);
  const end = new Date(`${date}T23:59:59.999`);
  return { date, start, end };
}

exports.byDate = async (req, res) => {
  try {
    const parsed = parseISODateOnly(req.query.date);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const clientId = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
    if (clientId) {
      if (!mongoose.Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({ message: "Invalid client ID" });
      }

      const clientObjectId = new mongoose.Types.ObjectId(clientId);
      const clientScopedOr = [{ clientId: clientObjectId }];

      // Backward compatibility for older history rows that were created without clientId.
      const itemNumbers = await ClientItem.distinct("itemNumber", { clientId: clientObjectId });
      if (itemNumbers.length) {
        clientScopedOr.push({
          clientId: { $exists: false },
          itemNumber: { $in: itemNumbers },
        });
      }

      const dateQuery = {
        $or: [
          { date: { $gte: parsed.start, $lte: parsed.end } },
          {
            $and: [
              { $or: [{ date: { $exists: false } }, { date: null }] },
              { createdAt: { $gte: parsed.start, $lte: parsed.end } },
            ],
          },
        ],
      };

      const historyRows = await ClientHistory.find({
        ...dateQuery,
        $or: clientScopedOr,
      })
        .select({ _id: 0, billNumber: 1, itemNumber: 1, totalPrice: 1, createdAt: 1 })
        .sort({ billNumber: 1, createdAt: 1 })
        .lean();

      const billMap = new Map();
      historyRows.forEach((row) => {
        const key = row.billNumber;
        if (!billMap.has(key)) {
          billMap.set(key, {
            billNumber: key,
            items: [],
            billTotal: 0,
          });
        }
        const bill = billMap.get(key);
        bill.items.push({
          itemNumber: row.itemNumber,
          price: Number(row.totalPrice || 0),
        });
        bill.billTotal += Number(row.totalPrice || 0);
      });

      const bills = Array.from(billMap.values()).sort((a, b) => a.billNumber - b.billNumber);
      const grandTotal = bills.reduce((sum, bill) => sum + bill.billTotal, 0);

      return res.json({
        date: parsed.date,
        clientId,
        totalBills: bills.length,
        grandTotal,
        bills,
      });
    }

    const rows = await Customer.find({
      $or: [
        { date: { $gte: parsed.start, $lte: parsed.end } },
        {
          $and: [
            {
              $or: [{ date: { $exists: false } }, { date: null }],
            },
            { createdAt: { $gte: parsed.start, $lte: parsed.end } },
          ],
        },
      ],
    })
      .select({ _id: 0, billNumber: 1, items: 1 })
      .sort({ billNumber: 1 })
      .lean();

    const bills = rows.map((row) => {
      const items = (row.items || []).map((item) => ({
        itemNumber: item.itemNumber,
        price: Number(item.sellPrice || 0),
      }));
      const billTotal = (row.items || []).reduce((sum, item) => {
        const itemTotal =
          item.total != null ? Number(item.total) : Number(item.boxQuantity || 0) * Number(item.sellPrice || 0);
        return sum + (Number.isNaN(itemTotal) ? 0 : itemTotal);
      }, 0);

      return {
        billNumber: row.billNumber,
        items,
        billTotal,
      };
    });

    const grandTotal = bills.reduce((sum, bill) => sum + bill.billTotal, 0);

    return res.json({
      date: parsed.date,
      totalBills: bills.length,
      grandTotal,
      bills,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.generateBillPDF = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Set response headers for PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=bill_${customer.billNumber}.pdf`
    );

    // Generate the PDF and pipe it to the response
    pdfGenerator.generateCustomerBillPDF(customer, res);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ message: "Error generating bill PDF" });
  }
};
