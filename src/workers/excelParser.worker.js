/**
 * Excel Parser Worker Thread
 * Offloads CPU-intensive Excel parsing from main event loop
 * Streams batches to main thread for parallel DB insertion
 */

import { parentPort, workerData } from 'worker_threads';
import Excel from 'exceljs';

const BATCH_SIZE = 1000; // Larger batches for faster throughput

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

/**
 * Extract embedded images from Excel worksheet
 */
function extractEmbeddedImages(workbook, worksheet) {
  const imageMap = {};
  
  try {
    const images = workbook.model?.media || [];
    
    if (worksheet.getImages && typeof worksheet.getImages === 'function') {
      const wsImages = worksheet.getImages();
      
      wsImages.forEach((img) => {
        try {
          const imageId = img.imageId;
          const imageData = images[imageId];
          
          if (imageData && imageData.buffer) {
            const row = img.range?.tl?.nativeRow ?? img.range?.tl?.row;
            if (row !== undefined) {
              const rowNum = row + 1;
              const extension = imageData.extension || 'png';
              const mimeType = extension === 'jpg' || extension === 'jpeg' 
                ? 'image/jpeg' 
                : `image/${extension}`;
              const base64 = imageData.buffer.toString('base64');
              imageMap[rowNum] = `data:${mimeType};base64,${base64}`;
            }
          }
        } catch (imgErr) {
          // Skip
        }
      });
    }
  } catch (err) {
    // Return empty
  }
  
  return imageMap;
}

async function parseExcel(filePath) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.getWorksheet('products') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No sheet found in workbook');
  }

  const headers = getHeaderMap(sheet);
  
  if (!headers['product']) {
    throw new Error('Missing required column: product');
  }

  // Extract embedded images first
  const embeddedImages = extractEmbeddedImages(workbook, sheet);
  const embeddedImageCount = Object.keys(embeddedImages).length;
  const totalRows = sheet.rowCount - 1;

  // Send info about what we found
  parentPort.postMessage({ 
    type: 'info', 
    total: totalRows,
    images: embeddedImageCount
  });

  let batch = [];
  let skipped = 0;
  let batchNumber = 0;
  let processed = 0;

  // Stream batches to main thread
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const productVal = clean(getCell(row, headers, 'product'));
    
    if (!productVal) {
      skipped++;
      processed++;
      continue;
    }

    const cellImageValue = clean(getCell(row, headers, 'image')) || null;
    const embeddedImage = embeddedImages[r] || null;
    const imageValue = embeddedImage || cellImageValue;

    batch.push({
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

    processed++;

    // Send batch when full
    if (batch.length >= BATCH_SIZE) {
      parentPort.postMessage({ 
        type: 'batch', 
        data: batch,
        batchNumber: ++batchNumber,
        processed
      });
      batch = [];
    }
  }

  // Send remaining batch
  if (batch.length > 0) {
    parentPort.postMessage({ 
      type: 'batch', 
      data: batch,
      batchNumber: ++batchNumber,
      processed
    });
  }

  return { totalRows, skipped, totalBatches: batchNumber };
}

// Main worker execution
(async () => {
  try {
    const { filePath } = workerData;
    
    parentPort.postMessage({ type: 'status', message: 'Parsing Excel file...' });
    
    const result = await parseExcel(filePath);
    
    parentPort.postMessage({ 
      type: 'complete', 
      skipped: result.skipped,
      totalBatches: result.totalBatches,
      total: result.totalRows
    });
  } catch (error) {
    parentPort.postMessage({ 
      type: 'error', 
      message: error.message 
    });
  }
})();
