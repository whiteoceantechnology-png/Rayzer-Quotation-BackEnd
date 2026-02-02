import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Colors
const TEAL = '#1a3a3a';       // Dark teal (close to black) for text/borders
const LIGHT_TEAL = '#f8f8f8'; // Very light gray (close to white) for backgrounds
const ROOM_BG = '#e8f4f4';    // Light teal-blue for room name header
const WHITE = '#ffffff';
const BLACK = '#000000';
const RED = '#cc0000';        // Darker red for terms
const BLUE = '#004466';       // Dark teal-blue for terms

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

      // Transform sections if not present - GROUP BY ROOM NAME
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
            // wattage: String(p.wattage || p.watt || ''),
            ct: String(p.ct || ''),
            color: String(p.color || ''),
            pcs: item.quantity || 0,
            rate: item.unit_price || 0,
            amount: item.total_price || 0,
            image: String(p.image || ''),
            warranty: String(p.warranty || "NA"),
            room_name: String(item.room_name || 'General')
          };
        });

        // Group items by room_name
        const roomGroups = {};
        items.forEach(item => {
          const roomName = item.room_name || 'General';
          if (!roomGroups[roomName]) {
            roomGroups[roomName] = [];
          }
          roomGroups[roomName].push(item);
        });

        // Convert to sections array, sorted by room name
        sections = Object.keys(roomGroups)
          .sort((a, b) => {
            // Put "General" at the end
            if (a === 'General') return 1;
            if (b === 'General') return -1;
            return a.localeCompare(b);
          })
          .map(roomName => ({
            name: roomName,
            items: roomGroups[roomName]
          }));
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

      // Column widths for the table (adjusted to fit page width)
      // 13 columns: No, Product, CRI, Driver Details, Chipset, Power Factor, Warranty, CT, Color, Pcs, Rate, Amount, Image
      // Total width ~785 for landscape A4 (page width 842 - margins 40 = 802 available)
      const colWidths = [30, 70, 40, 80, 70, 55, 55, 50, 50, 40, 70, 75, 100];
      const headers = ['No', 'Product', 'CRI', 'Driver Details', 'Chipset', 'Power Factor', 'Warranty', 'CT', 'Color', 'Pcs', 'Rate', 'Amount', 'Image'];

      // Helper function to draw a cell with border (text stays within bounds)
      function drawCell(x, y, w, h, text, options = {}) {
        const { fill = WHITE, textColor = BLACK, fontSize = 7, align = 'center', bold = false, border = true } = options;

        // Fill background
        doc.fillColor(fill).rect(x, y, w, h).fill();

        // Draw border
        if (border) {
          doc.strokeColor(TEAL).lineWidth(0.5).rect(x, y, w, h).stroke();
        }

        // Draw text with clipping to stay within cell bounds
        if (text !== undefined && text !== null) {
          const textStr = String(text);
          const padding = 2;
          const maxWidth = w - (padding * 2);
          const maxHeight = h - (padding * 2);

          doc.save(); // Save graphics state

          // Create clipping region to prevent overflow
          doc.rect(x + padding, y + padding, maxWidth, maxHeight).clip();

          doc.fillColor(textColor)
            .font(bold ? boldFont : regularFont)
            .fontSize(fontSize);

          // Calculate text height for vertical centering
          const textHeight = doc.heightOfString(textStr, { width: maxWidth, lineGap: 1 });
          const lines = Math.ceil(textHeight / (fontSize + 1));
          const actualHeight = Math.min(textHeight, maxHeight);
          const yOffset = Math.max(padding, (h - actualHeight) / 2);

          doc.text(textStr, x + padding, y + yOffset, {
            width: maxWidth,
            height: maxHeight,
            align,
            lineBreak: true,
            lineGap: 1,
            ellipsis: true // Add ellipsis if text is too long
          });

          doc.restore(); // Restore graphics state (removes clipping)
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

      // Track content boundaries for outer border
      const actualTableWidth = colWidths.reduce((a, b) => a + b, 0);
      const contentStartY = yPos;
      let contentEndY = yPos;

      // Helper to draw outer border on current page
      function drawOuterBorder(startY, endY) {
        doc.strokeColor(TEAL).lineWidth(2)
          .rect(margin - 5, startY - 5, actualTableWidth + 10, endY - startY + 10)
          .stroke();
      }

      // ==================== HEADER SECTION ====================
      // Calculate header widths based on total table width
      const headerHeight = 50;
      const tableEndX = margin + actualTableWidth;

      // Client box (left side)
      drawCell(margin, yPos, 60, 25, 'Client', { fill: LIGHT_TEAL, textColor: TEAL, bold: true });
      drawCell(margin + 60, yPos, 120, 25, customer_details.name || '', { textColor: TEAL });

      // Logo area (center)
      const logoPath = path.join(process.cwd(), 'src', 'assets', 'Rayzer_Lights_logo-2-300x95.png');
      const logoX = margin + 190;
      const logoWidth = 180;
      doc.strokeColor(TEAL).lineWidth(0.5).rect(logoX, yPos, logoWidth, headerHeight).stroke();
      if (fs.existsSync(logoPath)) {
        // Center the logo in the box
        doc.image(logoPath, logoX + 10, yPos + 5, { height: 40, fit: [logoWidth - 20, 40] });
      } else {
        // Fallback to text if logo not found
        doc.fillColor(TEAL).font(boldFont).fontSize(14).text('RAYZER', logoX + 40, yPos + 12, { width: logoWidth - 80, align: 'center' });
        doc.font(regularFont).fontSize(9).text('architectural lighting', logoX + 40, yPos + 28, { width: logoWidth - 80, align: 'center' });
      }

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
      contentEndY = yPos;

      // ==================== RENDER SECTIONS (GROUPED BY ROOM) ====================
      function renderSectionTable(sectionName, items, startY) {
        let y = startY;
        const rowHeight = 40;
        const headerRowHeight = 20;
        const sectionTitleHeight = 25; // Taller for room name

        // Check if we need a new page
        if (y + sectionTitleHeight + headerRowHeight + rowHeight > pageHeight - 100) {
          // Draw border for current page content before adding new page
          drawOuterBorder(contentStartY, contentEndY);
          doc.addPage();
          y = margin;
          contentEndY = margin; // Reset for new page
        }

        // Section/Room title row - prominent styling
        const actualTableWidth = colWidths.reduce((a, b) => a + b, 0);

        // Room name header with light teal-blue background
        doc.fillColor(ROOM_BG).rect(margin, y, actualTableWidth, sectionTitleHeight).fill();
        doc.strokeColor(TEAL).lineWidth(0.5).rect(margin, y, actualTableWidth, sectionTitleHeight).stroke();
        doc.fillColor(TEAL).font(boldFont).fontSize(12).text(sectionName.toUpperCase(), margin, y + 6, { width: actualTableWidth, align: 'center' });
        y += sectionTitleHeight;

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
            // Draw border for current page content before adding new page
            contentEndY = y;
            drawOuterBorder(contentStartY, contentEndY);
            doc.addPage();
            y = margin;
            contentEndY = margin; // Reset for new page
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
          drawCell(x, y, colWidths[3], rowHeight, item.driver_details || '', { textColor: TEAL, fontSize: 6, align: 'left' }); x += colWidths[3];
          drawCell(x, y, colWidths[4], rowHeight, item.chipset || '', { textColor: TEAL, fontSize: 6 }); x += colWidths[4];
          drawCell(x, y, colWidths[5], rowHeight, item.power_factor || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[5];
          // drawCell(x, y, colWidths[6], rowHeight, item.wattage || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[6];
          drawCell(x, y, colWidths[6], rowHeight, item.warranty || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[6];
          drawCell(x, y, colWidths[7], rowHeight, item.ct || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[7];
          drawCell(x, y, colWidths[8], rowHeight, item.color || '', { textColor: TEAL, fontSize: 7 }); x += colWidths[8];
          drawCell(x, y, colWidths[9], rowHeight, item.pcs || '', { textColor: TEAL, fontSize: 8 }); x += colWidths[9];
          drawCell(x, y, colWidths[10], rowHeight, item.rate ? `₹ ${safeFixed(item.rate)}` : '', { textColor: TEAL, fontSize: 7 }); x += colWidths[10];
          drawCell(x, y, colWidths[11], rowHeight, item.amount ? `₹ ${safeFixed(item.amount)}` : '', { textColor: TEAL, fontSize: 7 }); x += colWidths[11];
          drawImageCell(x, y, colWidths[12], rowHeight, item.image);

          y += rowHeight;
          contentEndY = y; // Track content end
        });

        return y;
      }

      // Render all sections (grouped by room)
      if (sections && Array.isArray(sections)) {
        sections.forEach((section, sectionIndex) => {
          // Add spacing between room tables (except before first)
          const sectionSpacing = sectionIndex > 0 ? 15 : 5;
          yPos = renderSectionTable(section.name, section.items, yPos + sectionSpacing);
        });
      }

      // ==================== TOTALS BOX ====================
      yPos += 10;
      const totalsBoxEndX = margin + actualTableWidth;
      const totalsWidth = 60;
      const totalsValueWidth = 80;
      const totalsRowHeight = 18;
      const totalsX = totalsBoxEndX - totalsWidth - totalsValueWidth; // Align to right edge of table

      // Check for page break before totals
      if (yPos + 120 > pageHeight - 50) {
        // Draw border for current page before adding new page
        drawOuterBorder(contentStartY, contentEndY);
        doc.addPage();
        yPos = margin;
        contentEndY = margin;
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
      yPos += totalsRowHeight;

      // Draw outer border wrapping header, tables, and totals
      contentEndY = yPos;
      drawOuterBorder(contentStartY, contentEndY);

      // ==================== TERMS AND CONDITIONS ====================
      // Start new page for terms if needed
      doc.addPage();
      yPos = margin;

      // Terms box - use wider width to fit content
      const termsBoxWidth = actualTableWidth; // Use same width as table
      const termsBoxHeight = 240;

      // Draw terms box border
      doc.strokeColor(BLACK).lineWidth(1).rect(margin, yPos, termsBoxWidth, termsBoxHeight).stroke();

      const termsContentWidth = termsBoxWidth - 30; // Padding for text
      const termsStartY = yPos;
      yPos += 15;

      doc.fillColor(BLACK).font(boldFont).fontSize(12).text('Terms and Conditions', margin + 15, yPos);
      yPos += 25;

      const terms = [
        { text: '1. 100% Payment paid upon delivery.', color: RED, bold: true, underline: true },
        { text: '2. Quotation Validity 15 Working days.', color: RED, bold: true, underline: true },
        { text: '3. Prices and specifications may change without prior notice.', color: BLUE },
        { text: '4. Goods once sold will not be taken back or exchanged.', color: BLUE },
        { text: '5. Warranty terms would be void if goods are used under improper conditions like abnormal surge, continuous voltage fluctuations, wrong installation, operations with heavy equipments, use by D.G sets, etc.', color: BLUE },
        { text: '6. Any damage to the fixture due to physical fall, painting operations at site, etc shall not be covered under warranty.', color: BLUE },
        { text: '7. The pricing for customised products is subject to adjustment based on specific project requirements.', color: BLUE },
        { text: '8. The Payment must be done in advance prior to the delivery of the said goods.', color: BLUE },
        { text: '9. All spotlights come with a warranty period of 36 months.', color: BLUE },
        { text: '10. Strip Lights come with a warranty period of 24 months.', color: BLUE },
      ];

      terms.forEach(term => {
        doc.fillColor(term.color || BLUE)
          .font(term.bold ? boldFont : regularFont)
          .fontSize(9);

        const textOptions = {
          width: termsContentWidth,
          lineBreak: true,
          lineGap: 2
        };

        if (term.underline) {
          textOptions.underline = true;
        }

        // Calculate height of this term for proper spacing
        const textHeight = doc.heightOfString(term.text, textOptions);

        doc.text(term.text, margin + 15, yPos, textOptions);
        yPos += textHeight + 5;
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