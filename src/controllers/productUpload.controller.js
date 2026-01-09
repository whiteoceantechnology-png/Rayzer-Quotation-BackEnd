/**
 * Product Upload Controller
 * Optimized for high-volume Excel uploads with batched transactions
 * Handles Cloudflare 100s timeout by streaming progress
 */

import HTTPStatus from 'http-status';
import Excel from 'exceljs';
import Product from '../models/product.model.js';
import logger from '../utils/logger.js';
import CacheService from '../services/cache.js';

const BATCH_SIZE = 500; // Smaller batches for faster commits

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
 * Returns a map of row number -> base64 image data
 */
function extractEmbeddedImages(workbook, worksheet) {
  const imageMap = {};
  
  try {
    // Get all images from the workbook
    const images = workbook.model?.media || [];
    
    // Get image positions from worksheet drawings
    if (worksheet.getImages && typeof worksheet.getImages === 'function') {
      const wsImages = worksheet.getImages();
      
      wsImages.forEach((img) => {
        try {
          const imageId = img.imageId;
          const imageData = images[imageId];
          
          if (imageData && imageData.buffer) {
            // Get the row number from the image anchor
            const row = img.range?.tl?.nativeRow ?? img.range?.tl?.row;
            if (row !== undefined) {
              // Convert to 1-based row number (add 1 since rows are 0-indexed in range)
              const rowNum = row + 1;
              
              // Convert buffer to base64 with data URI prefix
              const extension = imageData.extension || 'png';
              const mimeType = extension === 'jpg' || extension === 'jpeg' 
                ? 'image/jpeg' 
                : `image/${extension}`;
              const base64 = imageData.buffer.toString('base64');
              imageMap[rowNum] = `data:${mimeType};base64,${base64}`;
            }
          }
        } catch (imgErr) {
          // Skip this image on error
        }
      });
    }
  } catch (err) {
    // Return empty map on error
  }
  
  return imageMap;
}

export async function uploadExcel(req, res, next) {
  const requestLogger = req.log || logger;
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'File required', status: 0 });
    }

    requestLogger.info({ fileSize: req.file.size, fileName: req.file.originalname }, 'Starting Excel upload');

    // Disable request timeout for this endpoint
    req.setTimeout(0);
    res.setTimeout(0);

    // Set headers for SSE-style streaming (Cloudflare compatible)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    
    // Helper to send SSE events
    const sendEvent = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        // Response might be closed
      }
    };

    // Send initial event
    sendEvent({ type: 'start', message: 'Processing file...' });

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    
    let sheet = workbook.getWorksheet('products') || workbook.worksheets[0];
    if (!sheet) {
      sendEvent({ type: 'error', message: 'No sheet found' });
      return res.end();
    }

    const headers = getHeaderMap(sheet);

    if (!headers['product']) {
      sendEvent({ type: 'error', message: 'Missing required column: product' });
      return res.end();
    }

    // Extract embedded images from Excel (row number -> base64)
    const embeddedImages = extractEmbeddedImages(workbook, sheet);
    const embeddedImageCount = Object.keys(embeddedImages).length;
    
    const totalRows = sheet.rowCount - 1;
    sendEvent({ 
      type: 'info', 
      message: `Found ${totalRows} rows, ${embeddedImageCount} embedded images`, 
      total: totalRows,
      images: embeddedImageCount
    });

    let batch = [];
    let processed = 0;
    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    let lastProgressUpdate = 0;

    const sequelize = Product.sequelize;

    async function flushBatch(transaction) {
      if (!batch.length) return;
      try {
        const result = await Product.bulkCreate(batch, {
          ignoreDuplicates: true,
          validate: false,
          hooks: false,
          transaction,
          returning: false,
          logging: false, // Disable SQL logging for performance
        });
        inserted += result.length;
      } catch (err) {
        requestLogger.error({ err: err.message, batchSize: batch.length }, 'Batch insert error');
        errors += batch.length;
      }
      processed += batch.length;
      batch = [];
      
      // Send progress update every 10%
      const progressPercent = Math.floor((processed / totalRows) * 100);
      if (progressPercent >= lastProgressUpdate + 10) {
        lastProgressUpdate = progressPercent;
        sendEvent({ type: 'progress', percent: progressPercent, processed, total: totalRows });
      }
    }

    let currentTransaction = await sequelize.transaction();

    try {
      for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const productVal = clean(getCell(row, headers, 'product'));
        
        if (!productVal) {
          skipped++;
          continue;
        }

        // Get image: prefer embedded image, fall back to cell value (URL or base64 text)
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

        if (batch.length >= BATCH_SIZE) {
          await flushBatch(currentTransaction);
          await currentTransaction.commit();
          currentTransaction = await sequelize.transaction();
        }
      }

      await flushBatch(currentTransaction);
      await currentTransaction.commit();

    } catch (err) {
      await currentTransaction.rollback();
      throw err;
    }

    // Clear cache
    try {
      CacheService.clear();
    } catch (cacheErr) {
      // Ignore
    }

    const duration = Date.now() - startTime;
    requestLogger.info({ processed, inserted, skipped, errors, duration }, 'Upload complete');

    // Send final result
    sendEvent({
      type: 'complete',
      status: 1,
      message: 'Upload complete',
      data: { processed, inserted, skipped, errors, total_rows: totalRows, duration_ms: duration }
    });
    
    return res.end();

  } catch (e) {
    requestLogger.error({ err: e }, 'Upload error');
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message || 'Upload error' })}\n\n`);
      res.end();
    } catch (writeErr) {
      e.status = HTTPStatus.BAD_REQUEST;
      return next(e);
    }
  }
}