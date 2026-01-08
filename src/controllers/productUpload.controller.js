/**
 * Product Upload Controller
 * Optimized for high-volume Excel uploads with batched transactions
 */

import HTTPStatus from 'http-status';
import Excel from 'exceljs';
import Product from '../models/product.model.js';
import logger from '../utils/logger.js';
import CacheService from '../services/cache.js';

const BATCH_SIZE = 2000;
const TRANSACTION_BATCH_SIZE = 10000; // Commit transaction every N rows to avoid long locks

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

function mapSheetImages(workbook, worksheet) {
  const imageMap = new Map();
  try {
    const sheetImages = worksheet.getImages?.() || [];

    sheetImages.forEach(({ imageId, range }) => {
      const media = workbook.model?.media?.find((m) => m.index === imageId);
      if (!media) return;

      const buffer =
        media.buffer ||
        (media.base64 ? Buffer.from(media.base64, 'base64') : null);
      if (!buffer) return;

      const extension =
        media.extension ||
        media.contentType?.split('/').pop() ||
        'png';

      const startRow = ((range.tl?.nativeRow ?? range.tl?.row) ?? 0) + 1;
      const endRow = ((range.br?.nativeRow ?? range.br?.row) ?? startRow - 1) + 1;

      for (let row = startRow; row <= endRow; row += 1) {
        imageMap.set(row, { buffer, extension });
      }
    });
  } catch (err) {
    // Silently handle image mapping errors - images are optional
  }
  return imageMap;
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

export async function uploadExcel(req, res, next) {
  const requestLogger = req.log || logger;
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'File required', status: 0 });
    }

    requestLogger.info({ fileSize: req.file.size, fileName: req.file.originalname }, 'Starting Excel upload');

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    
    // Try second sheet first, fall back to first sheet
    let sheet = workbook.getWorksheet('products') || workbook.getWorksheet(0);
    
    if (!sheet) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'No sheet found', status: 0 });
    }

    requestLogger.debug({ sheetName: sheet.name, rowCount: sheet.rowCount }, 'Sheet loaded');

    const headers = getHeaderMap(sheet);
    const imageMap = mapSheetImages(workbook, sheet);

    // Validate required headers
    if (!headers['product']) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ 
        message: 'Missing required column: product', 
        status: 0 
      });
    }

    let batch = [];
    let processed = 0;
    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    const totalRows = sheet.rowCount - 1; // Exclude header

    const sequelize = Product.sequelize;

    async function flushBatch(transaction) {
      if (!batch.length) return;
      try {
        const result = await Product.bulkCreate(batch, {
          ignoreDuplicates: true,
          validate: false,
          hooks: false,
          transaction,
          returning: false // Slight performance boost
        });
        inserted += result.length;
      } catch (err) {
        requestLogger.error({ err, batchSize: batch.length }, 'Batch insert error');
        errors += batch.length;
      }
      processed += batch.length;
      batch = [];
    }

    // Process in transaction chunks to avoid long-running locks
    let transactionRowCount = 0;
    let currentTransaction = await sequelize.transaction();

    try {
      for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const productVal = clean(getCell(row, headers, 'product'));
        
        if (!productVal) {
          skipped++;
          continue;
        }

        const rowImage = imageMap.get(r);
        const inlineImage = clean(getCell(row, headers, 'image'));
        const imageValue = rowImage
          ? `data:image/${rowImage.extension};base64,${rowImage.buffer.toString('base64')}`
          : inlineImage;

        const doc = {
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
          image: imageValue || null,
        };

        batch.push(doc);
        transactionRowCount++;

        if (batch.length >= BATCH_SIZE) {
          await flushBatch(currentTransaction);
        }

        // Commit transaction periodically to avoid long locks
        if (transactionRowCount >= TRANSACTION_BATCH_SIZE) {
          await flushBatch(currentTransaction);
          await currentTransaction.commit();
          currentTransaction = await sequelize.transaction();
          transactionRowCount = 0;
          requestLogger.debug({ processed, inserted, total: totalRows }, 'Transaction checkpoint');
        }
      }

      // Flush remaining batch
      await flushBatch(currentTransaction);
      await currentTransaction.commit();

    } catch (err) {
      await currentTransaction.rollback();
      throw err;
    }

    // Clear product cache after upload
    try {
      CacheService.clear();
    } catch (cacheErr) {
      requestLogger.warn({ err: cacheErr }, 'Failed to clear cache');
    }

    const duration = Date.now() - startTime;
    requestLogger.info({ processed, inserted, skipped, errors, duration }, 'Upload complete');

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Upload complete',
      data: {
        processed,
        inserted,
        skipped,
        errors,
        total_rows: totalRows,
        duration_ms: duration
      }
    });

  } catch (e) {
    requestLogger.error({ err: e }, 'Upload error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}