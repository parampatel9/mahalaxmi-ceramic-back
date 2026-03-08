const PDFDocument = require("pdfkit");

/**
 * Generates a customer bill PDF.
 * @param {Object} customer - The customer object from the database.
 * @param {express.Response} res - The express response object to pipe the PDF to.
 */
exports.generateCustomerBillPDF = (customer, res) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Pipe the PDF to the response
    doc.pipe(res);

    // --- Colors & Styling ---
    const primaryColor = "#1a237e"; // Deep indigo
    const secondaryColor = "#455a64"; // Blue grey
    const accentColor = "#0288d1"; // Light blue
    const tableHeaderBg = "#f5f5f5";

    // --- Header ---
    doc
        .fillColor(primaryColor)
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("MAHALAXMI CERAMIC", 50, 45)
        .fontSize(10)
        .font("Helvetica")
        .fillColor(secondaryColor)
        .text("123, Ceramic Plaza, Main Road, City, State, PIN-000000", 50, 75, { align: "right" })
        .text("Phone: +91 98765 43210 | Email: contact@mahalaxmiceramic.com", 50, 90, { align: "right" })
        .moveDown();

    // --- Horizontal Line ---
    doc.moveTo(50, 110).lineTo(550, 110).strokeColor("#eee").lineWidth(1).stroke();

    // --- Bill & Customer Meta ---
    doc
        .fillColor(primaryColor)
        .fontSize(16)
        .font("Helvetica-Bold")
        .text("INVOICE", 50, 130)
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#000")
        .text(`Bill No: #${customer.billNumber}`, 50, 155)
        .text(`Date: ${new Date(customer.date).toLocaleDateString("en-IN")}`, 50, 170);

    // Bill To
    doc
        .fillColor(primaryColor)
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("BILL TO:", 350, 130)
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#000")
        .text(customer.customerName.toUpperCase(), 350, 150)
        .fontSize(10)
        .fillColor(secondaryColor)
        .text(customer.address, 350, 165, { width: 200 })
        .text(`Mobile: +91 ${customer.mobileNumber}`, 350, 195);

    // --- Table Header ---
    const tableTop = 230;
    const itemNoX = 50;
    const sizeX = 180;
    const qtyX = 280;
    const priceX = 380;
    const totalX = 480;

    // Background for header
    doc.rect(50, tableTop - 5, 500, 25).fill(tableHeaderBg);

    doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(10);
    doc.text("ITEM DESCRIPTION", itemNoX, tableTop);
    doc.text("SIZE", sizeX, tableTop);
    doc.text("BOX QTY", qtyX, tableTop);
    doc.text("PRICE (₹)", priceX, tableTop);
    doc.text("TOTAL (₹)", totalX, tableTop, { width: 70, align: "right" });

    doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).strokeColor("#ddd").stroke();

    // --- Items ---
    let currentY = tableTop + 30;
    doc.font("Helvetica").fillColor("#333");

    customer.items.forEach((item, index) => {
        // Alternating background for rows (optional, but subtle is better)
        if (index % 2 === 1) {
            // doc.rect(50, currentY - 5, 500, 20).fill("#fafafa");
        }

        doc.fillColor("#333").text(item.itemNumber, itemNoX, currentY);
        doc.text(item.size || "-", sizeX, currentY);
        doc.text(item.boxQuantity.toString(), qtyX, currentY);
        doc.text(item.sellPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 }), priceX, currentY);
        doc.text(item.total.toLocaleString("en-IN", { minimumFractionDigits: 2 }), totalX, currentY, { width: 70, align: "right" });

        currentY += 25;

        // Check if we need a new page (rough check)
        if (currentY > 700) {
            doc.addPage();
            currentY = 50;
        }
    });

    // --- Summary Section ---
    const summaryY = currentY + 20;
    doc.moveTo(350, summaryY).lineTo(550, summaryY).strokeColor(primaryColor).lineWidth(2).stroke();

    doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("GRAND TOTAL:", 350, summaryY + 15)
        .text(`₹ ${customer.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, totalX - 30, summaryY + 15, { width: 100, align: "right" });

    // --- Footer ---
    const footerTop = 750;
    doc.moveTo(50, footerTop).lineTo(550, footerTop).strokeColor("#eee").lineWidth(1).stroke();

    doc
        .fontSize(9)
        .font("Helvetica-Oblique")
        .fillColor(secondaryColor)
        .text("This is a computer generated invoice and does not require a signature.", 50, footerTop + 15, { align: "center", width: 500 })
        .font("Helvetica-Bold")
        .text("Thank you for choosing Mahalaxmi Ceramic!", 50, footerTop + 30, { align: "center", width: 500 });

    // Finalize the PDF
    doc.end();
};

