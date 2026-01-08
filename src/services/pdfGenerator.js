import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Colors
const TEAL = '#008080';
const LIGHT_TEAL = '#e0f0f0';
const WHITE = '#ffffff';
const BLACK = '#000000';
const RED = '#ff0000';
const BLUE = '#0066cc';

// Safe number formatting helper
function safeFixed(value, decimals = 2) {
  const num = Number(value);
  if (isNaN(num) || value === null || value === undefined) {
    return '0.00';
  }
  return num.toFixed(decimals);
}

export function generateBillPDF(billData, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // --- Transform input to expected format ---
      const customer_details = billData.customer_details || billData.customer_id || {};
      
      // Transform sections if not present
      let sections = billData.sections;
      if (!sections) {
        const items = (billData.items || []).map(item => {
          const p = item.product_id || {};
          return {
            product_name: String(p.product || p.name || ''),
            cri: String(p.cri || ''),
            driver_details: String(p.driver_details || p.drive_details || ''),
            chipset: String(p.chipset || ''),
            power_factor: String(p.power_factor || ''),
            wattage: String(p.wattage || p.watt || ''),
            ct: String(p.ct || ''),
            color: String(p.color || ''),
            pcs: item.quantity || 0,
            rate: item.unit_price || 0,
            amount: item.total_price || 0,
            image: String(p.image || ''),
            room_name: String(item.room_name || 'Products')
          };
        });
        sections = [{ name: 'Products', items }];
      }

      // Use landscape A4 for wider tables
      const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Register custom fonts for rupee symbol support
      const fontsDir = path.join(process.cwd(), 'uploads', 'fonts');
      const notoRegularPath = path.join(fontsDir, 'NotoSans-Regular.ttf');
      const notoBoldPath = path.join(fontsDir, 'NotoSans-Bold.ttf');
      
      if (fs.existsSync(notoRegularPath)) {
        doc.registerFont('NotoSans', notoRegularPath);
      }
      if (fs.existsSync(notoBoldPath)) {
        doc.registerFont('NotoSans-Bold', notoBoldPath);
      }
      
      // Check if custom fonts are available
      const hasCustomFonts = fs.existsSync(notoRegularPath) && fs.existsSync(notoBoldPath);
      const regularFont = hasCustomFonts ? 'NotoSans' : 'Helvetica';
      const boldFont = hasCustomFonts ? 'NotoSans-Bold' : 'Helvetica-Bold';

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 20;

      // Calculate total table width to fit page
      const totalTableWidth = pageWidth - 2 * margin;

      // Column widths for the table (adjusted to fit page width)
      // Total should equal totalTableWidth (~802 for landscape A4)
      const colWidths = [30, 65, 35, 75, 65, 55, 55, 50, 45, 35, 65, 70, 60];
      const headers = ['No', 'Product', 'CRI', 'Driver Details', 'Chipset', 'Power Factor', 'Wattage', 'CT', 'Color', 'Pcs', 'Rate', 'Amount', 'Image'];

      // Helper function to draw a cell with border
      function drawCell(x, y, w, h, text, options = {}) {
        const { fill = WHITE, textColor = BLACK, fontSize = 7, align = 'center', bold = false, border = true } = options;

        // Fill background
        doc.fillColor(fill).rect(x, y, w, h).fill();

        // Draw border
        if (border) {
          doc.strokeColor(TEAL).lineWidth(0.5).rect(x, y, w, h).stroke();
        }

        // Draw text
        if (text !== undefined && text !== null) {
          doc.fillColor(textColor)
            .font(bold ? boldFont : regularFont)
            .fontSize(fontSize)
            .text(String(text), x + 2, y + (h - fontSize) / 2, { width: w - 4, align, lineBreak: false });
        }
      }

      // Helper to draw image in cell
      function drawImageCell(x, y, w, h, imageData) {
        doc.strokeColor(TEAL).lineWidth(0.5).rect(x, y, w, h).stroke();
        if (imageData) {
          try {
            // Check if imageData is base64 encoded
            if (imageData.startsWith('data:image/')) {
              // Extract base64 data after the comma (e.g., "data:image/jpeg;base64,...")
              const base64Data = imageData.split(',')[1];
              const imageBuffer = Buffer.from(base64Data, 'base64');
              doc.image(imageBuffer, x + 2, y + 2, { width: w - 4, height: h - 4, fit: [w - 4, h - 4] });
            } else if (/^[A-Za-z0-9+/=]+$/.test(imageData) && imageData.length > 100) {
              // Raw base64 string without data URI prefix
              const imageBuffer = Buffer.from(imageData, 'base64');
              doc.image(imageBuffer, x + 2, y + 2, { width: w - 4, height: h - 4, fit: [w - 4, h - 4] });
            } else {
              // Treat as file path
              const fullPath = imageData.startsWith('/') || imageData.startsWith('http')
                ? path.join(process.cwd(), 'uploads', imageData.replace(/^\/uploads\//, ''))
                : path.join(process.cwd(), 'uploads', imageData);
              if (fs.existsSync(fullPath)) {
                doc.image(fullPath, x + 2, y + 2, { width: w - 4, height: h - 4, fit: [w - 4, h - 4] });
              }
            }
          } catch (e) {
            // Image load failed, skip
          }
        }
      }

      let yPos = margin;

      // ==================== HEADER SECTION ====================
      // Calculate header widths based on total table width
      const headerHeight = 50;
      const tableEndX = margin + colWidths.reduce((a, b) => a + b, 0);

      // Client box (left side)
      drawCell(margin, yPos, 60, 25, 'Client', { fill: LIGHT_TEAL, textColor: TEAL, bold: true });
      drawCell(margin + 60, yPos, 120, 25, customer_details.name || '', { textColor: TEAL });

      // Logo area (center)
      const logoPath = path.join(process.cwd(), 'uploads', 'logo.png');
      const logoX = margin + 190;
      const logoWidth = 180;
      doc.strokeColor(TEAL).lineWidth(0.5).rect(logoX, yPos, logoWidth, headerHeight).stroke();
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX + 10, yPos + 5, { height: 40 });
      }
      doc.fillColor(TEAL).font(boldFont).fontSize(14).text('RAYZER', logoX + 70, yPos + 8);
      doc.font(regularFont).fontSize(9).text('architectural lighting', logoX + 70, yPos + 24);

      // Address box (right side) - aligned to table end
      const addressStartX = logoX + logoWidth + 10;
      const addressWidth = tableEndX - addressStartX;
      drawCell(addressStartX, yPos, 70, 25, 'Address', { fill: LIGHT_TEAL, textColor: TEAL, bold: true });
      drawCell(addressStartX + 70, yPos, addressWidth - 70, 25, '#552, Lakshmi Nagar, Vasavi College Post, Bhavani, Erode 638316', { textColor: TEAL, fontSize: 7 });

      // Second row of header
      yPos += 25;
      drawCell(margin, yPos, 60, 25, 'Architect', { fill: LIGHT_TEAL, textColor: TEAL, bold: true });
      drawCell(margin + 60, yPos, 120, 25, billData.customer.company_name || "RAYZER", { textColor: TEAL });

      const creatorName = billData.creator
        ? `${billData.creator.first_name || ''} ${billData.creator.last_name || ''}`.trim() || '-'
        : '-';
      const creatorPhone = billData.creator?.mobile_number || '-';

      drawCell(addressStartX, yPos, 70, 25, 'Rep & Phno', { fill: LIGHT_TEAL, textColor: TEAL, bold: true });
      drawCell(addressStartX + 70, yPos, 80, 25, creatorName, { textColor: TEAL });
      drawCell(addressStartX + 150, yPos, addressWidth - 150, 25, creatorPhone, { textColor: TEAL });

      yPos += 35;

      // ==================== RENDER SECTIONS ====================
      function renderSectionTable(sectionName, items, startY) {
        let y = startY;
        const rowHeight = 40;
        const headerRowHeight = 20;

        // Check if we need a new page
        if (y + headerRowHeight + rowHeight > pageHeight - 100) {
          doc.addPage();
          y = margin;
        }

        // Section title row - use actual sum of column widths
        const actualTableWidth = colWidths.reduce((a, b) => a + b, 0);
        doc.fillColor(LIGHT_TEAL).rect(margin, y, actualTableWidth, headerRowHeight).fill();
        doc.strokeColor(TEAL).lineWidth(0.5).rect(margin, y, actualTableWidth, headerRowHeight).stroke();
        doc.fillColor(TEAL).font(boldFont).fontSize(10).text(sectionName, margin, y + 5, { width: actualTableWidth, align: 'center' });
        y += headerRowHeight;

        // Header row
        let x = margin;
        headers.forEach((header, i) => {
          drawCell(x, y, colWidths[i], headerRowHeight, header, { fill: LIGHT_TEAL, textColor: TEAL, bold: true, fontSize: 7 });
          x += colWidths[i];
        });
        y += headerRowHeight;

        // Data rows
        items.forEach((item, idx) => {
          // Check for page break
          if (y + rowHeight > pageHeight - 100) {
            doc.addPage();
            y = margin;
            // Redraw header on new page
            x = margin;
            headers.forEach((header, i) => {
              drawCell(x, y, colWidths[i], headerRowHeight, header, { fill: LIGHT_TEAL, textColor: TEAL, bold: true, fontSize: 7 });
              x += colWidths[i];
            });
            y += headerRowHeight;
          }

          x = margin;
          drawCell(x, y, colWidths[0], rowHeight, idx + 1, { textColor: TEAL, fontSize: 8 }); x += colWidths[0];
          drawCell(x, y, colWidths[1], rowHeight, item.product_name || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[1];
          drawCell(x, y, colWidths[2], rowHeight, item.cri || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[2];
          drawCell(x, y, colWidths[3], rowHeight, item.driver_details || '', { textColor: TEAL, fontSize: 6 }); x += colWidths[3];
          drawCell(x, y, colWidths[4], rowHeight, item.chipset || '', { textColor: TEAL, fontSize: 6 }); x += colWidths[4];
          drawCell(x, y, colWidths[5], rowHeight, item.power_factor || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[5];
          drawCell(x, y, colWidths[6], rowHeight, item.wattage || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[6];
          drawCell(x, y, colWidths[7], rowHeight, item.ct || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[7];
          drawCell(x, y, colWidths[8], rowHeight, item.color || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[8];
          drawCell(x, y, colWidths[9], rowHeight, item.pcs || '', { textColor: TEAL, fontSize: 8 }); x += colWidths[9];
          drawCell(x, y, colWidths[10], rowHeight, item.rate ? `₹ ${safeFixed(item.rate)}` : '', { textColor: TEAL, fontSize: 7 }); x += colWidths[10];
          drawCell(x, y, colWidths[11], rowHeight, item.amount ? `₹ ${safeFixed(item.amount)}` : '', { textColor: TEAL, fontSize: 7 }); x += colWidths[11];
          drawImageCell(x, y, colWidths[12], rowHeight, item.image);

          y += rowHeight;
        });

        return y;
      }

      // Render all sections
      if (sections && Array.isArray(sections)) {
        sections.forEach(section => {
          yPos = renderSectionTable(section.name, section.items, yPos + 5);
        });
      }

      // ==================== TOTALS BOX ====================
      yPos += 10;
      const actualTableWidth = colWidths.reduce((a, b) => a + b, 0);
      const totalsBoxEndX = margin + actualTableWidth;
      const totalsWidth = 60;
      const totalsValueWidth = 80;
      const totalsRowHeight = 18;
      const totalsX = totalsBoxEndX - totalsWidth - totalsValueWidth; // Align to right edge of table

      // Check for page break before totals
      if (yPos + 120 > pageHeight - 50) {
        doc.addPage();
        yPos = margin;
      }

      const subtotal = Number(billData.subtotal) || 0;
      const discount = Number(billData.discount) || 0;
      const taxAmount = Number(billData.tax_amount) || 0;
      const totalAmount = Number(billData.total_amount) || 0;
      const discountPercent = billData.discount_percent || (subtotal > 0 ? Math.round((discount / subtotal) * 100) : 0);

      const totalsData = [
        ['Amount', `₹${safeFixed(subtotal)}`],
        [`Disc ${discountPercent}%`, `₹${safeFixed(discount)}`],
        ['Sub Total', `₹${safeFixed(subtotal - discount)}`],
        ['GST', `₹${safeFixed(taxAmount)}`],
        ['Total', `₹${safeFixed(totalAmount)}`],
      ];

      totalsData.forEach((row, i) => {
        drawCell(totalsX, yPos + i * totalsRowHeight, totalsWidth, totalsRowHeight, row[0], { fill: LIGHT_TEAL, textColor: TEAL, bold: true, align: 'center' });
        drawCell(totalsX + totalsWidth, yPos + i * totalsRowHeight, totalsValueWidth, totalsRowHeight, row[1], { textColor: TEAL, align: 'center' });
      });

      yPos += totalsData.length * totalsRowHeight + 10;

      // Payment details
      drawCell(totalsX, yPos, totalsWidth, totalsRowHeight, 'Cash', { fill: LIGHT_TEAL, textColor: TEAL, bold: true, align: 'center' });
      drawCell(totalsX + totalsWidth, yPos, totalsValueWidth, totalsRowHeight, `₹${safeFixed(billData.cash)}`, { textColor: TEAL, align: 'center' });
      yPos += totalsRowHeight;
      drawCell(totalsX, yPos, totalsWidth, totalsRowHeight, 'A/C', { fill: LIGHT_TEAL, textColor: TEAL, bold: true, align: 'center' });
      drawCell(totalsX + totalsWidth, yPos, totalsValueWidth, totalsRowHeight, `₹${safeFixed(billData.account)}`, { textColor: TEAL, align: 'center' });
      // ==================== TERMS AND CONDITIONS ====================
      // Start new page for terms if needed
      doc.addPage();
      yPos = margin;

      // Terms box border
      doc.strokeColor(BLACK).lineWidth(1).rect(margin, yPos, 400, 220).stroke();
      yPos += 10;

      doc.fillColor(BLACK).font(boldFont).fontSize(11).text('Terms and Conditions', margin + 10, yPos);
      yPos += 20;

      const terms = [
        { text: '1. 100% Payment paid upon delivery.', color: RED, bold: true, underline: true },
        { text: '2. Quotation Validity 15 Working days.', color: RED, bold: true, underline: true },
        { text: '3. Prices and specifications may change without prior notice.', color: BLUE },
        { text: '4. Goods once sold will not be taken back or exchanged.', color: BLUE },
        { text: '5. Warranty terms would be void if goods are used under', color: BLUE },
        { text: '   a) Improper conditions like abnormal surge, continuous voltage fluctuations, wrong installation,', color: BLUE, indent: true },
        { text: '      operations with heavy equipments, use by D.G sets, etc.', color: BLUE, indent: true },
        { text: '   b) Any damage to the fixture due to physical fall, painting operations at site, etc', color: BLUE, indent: true },
        { text: '      shall not be covered under warranty.', color: BLUE, indent: true },
        { text: '6. The pricing for customised products is subject to adjustment based on specific', color: BLUE },
        { text: '   project requirements.', color: BLUE, indent: true },
        { text: '7. The Payment must be done in advance prior to the delivery of the said', color: BLUE },
        { text: '   goods.', color: BLUE, indent: true },
        { text: '8. All spotlights come with a warranty period of 36 months.', color: BLUE, boldPart: '36 months' },
        { text: '9. Strip Lights come with a warranty period of 24 months', color: BLUE, boldPart: '24 months' },
      ];

      terms.forEach(term => {
        doc.fillColor(term.color || BLUE)
          .font(term.bold ? boldFont : regularFont)
          .fontSize(9);

        if (term.underline) {
          doc.text(term.text, margin + 15, yPos, { underline: true });
        } else {
          doc.text(term.text, margin + 15, yPos);
        }
        yPos += 13;
      });

      // Handle stream errors before ending
      stream.on('error', (err) => {
        doc.end();
        reject(err);
      });

      doc.on('error', (err) => {
        stream.end();
        reject(err);
      });

      stream.on('finish', () => {
        console.log('PDF generated:', outputPath);
        resolve(outputPath);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}