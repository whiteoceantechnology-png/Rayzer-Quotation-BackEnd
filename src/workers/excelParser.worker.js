/**
 * Excel Parser Worker Thread
 * Offloads CPU-intensive Excel parsing from main event loop
 */

import { parentPort, workerData } from 'worker_threads';
import Excel from 'exceljs';

function parseNumber(val) {
  if (val == null) return null;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function clean(text) {
  if (text == null) return '';
  return String(text).trim();
}

function getHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const headers = {};
  headerRow.values.forEach((val, idx) => {
    if (!val) return;
    headers[clean(val).toLowerCase()] = idx;
  });
  return headers;
}

function getCell(row, headers, name) {
  const index = headers[name.toLowerCase()];
  if (!index) return '';
  const cell = row.getCell(index);
  return cell.text?.trim?.() ?? cell.value ?? '';
}

async function parseExcel(buffer) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheet = workbook.getWorksheet('products') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No sheet found in workbook');
  }

  const headers = getHeaderMap(sheet);
  
  if (!headers['product']) {
    throw new Error('Missing required column: product');
  }

  const totalRows = sheet.rowCount - 1;
  const products = [];
  let skipped = 0;

  // Parse all rows
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const productVal = clean(getCell(row, headers, 'product'));
    
    if (!productVal) {
      skipped++;
      continue;
    }

    const imageValue = clean(getCell(row, headers, 'image')) || null;

    products.push({
      product: productVal,
      color: clean(getCell(row, headers, 'color')),
      chipset: clean(getCell(row, headers, 'chipset')),
      type: clean(getCell(row, headers, 'type')),
      beam_angle: clean(getCell(row, headers, 'beam_angle')),
      ct: clean(getCell(row, headers, 'ct')),
      cri: clean(getCell(row, headers, 'cri')),
      drive: clean(getCell(row, headers, 'drive')),
      power_factor: clean(getCell(row, headers, 'power_factor')),
      drive_details: clean(getCell(row, headers, 'drive_details')),
      warranty: clean(getCell(row, headers, 'warranty')),
      dlp: parseNumber(getCell(row, headers, 'dlp')),
      mrp: parseNumber(getCell(row, headers, 'mrp')),
      image: imageValue,
    });

    // Report progress every 1000 rows
    if (products.length % 1000 === 0) {
      parentPort.postMessage({
        type: 'progress',
        phase: 'parsing',
        count: products.length,
        total: totalRows
      });
    }
  }

  return { products, totalRows, skipped };
}

// Main worker execution
(async () => {
  try {
    const { buffer } = workerData;
    
    parentPort.postMessage({ type: 'status', message: 'Parsing Excel file...' });
    
    const result = await parseExcel(Buffer.from(buffer));
    
    parentPort.postMessage({ 
      type: 'complete', 
      data: result 
    });
  } catch (error) {
    parentPort.postMessage({ 
      type: 'error', 
      message: error.message 
    });
  }
})();
