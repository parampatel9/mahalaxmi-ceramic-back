const Customer = require("../models/customer");

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
