/**
 * Product Upload Controller - Production SaaS Grade
 * Handles large Excel uploads with embedded images
 */

import HTTPStatus from 'http-status';
import Excel from 'exceljs';
import fs from 'fs';
import Product from '../models/product.model.js';
import logger from '../utils/logger.js';
import CacheService from '../services/cache.js';

const BATCH_SIZE = 500;
const PROGRESS_INTERVAL = 5;

function parseNumber(val) {
  if (val == null) return null;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function clean(val) {
  if (val == null) return '';
  return String(val).trim();
}

function getHeaderMap(row) {
  const headers = {};
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = clean(cell.value).toLowerCase();
    if (name) headers[name] = colNumber;
  });
  return headers;
}

function getCellValue(row, headers, name) {
  const col = headers[name.toLowerCase()];
  if (!col) return '';
  const cell = row.getCell(col);
  return cell.text?.trim?.() ?? clean(cell.value);
}

function extractImages(workbook, worksheet) {
  const imageMap = {};
  try {
    const media = workbook.model?.media || [];
    const wsImages = worksheet.getImages?.() || [];
    for (const img of wsImages) {
      try {
        const data = media[img.imageId];
        if (data?.buffer) {
          const rowNum = (img.range?.tl?.nativeRow ?? img.range?.tl?.row) + 1;
          const ext = data.extension || 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext;
          imageMap[rowNum] = 'data:' + mime + ';base64,' + data.buffer.toString('base64');
        }
      } catch (e) {}
    }
  } catch (e) {}
  return imageMap;
}

/**
 * Insert batch - splits into smaller chunks if images present
 * MariaDB max_allowed_packet is typically 16MB, base64 images can be large
 */
async function insertBatchSQL(sequelize, batch, log) {
  if (!batch.length) return 0;
  
  // Check if batch has images - if so, use smaller chunks
  const hasImages = batch.some(r => r.image && r.image.length > 1000);
  const chunkSize = hasImages ? 20 : 500; // Small chunks for images
  
  const columns = [
    'product', 'color', 'chipset', 'type', 'beam_angle', 'ct', 'cri',
    'drive', 'power_factor', 'drive_details', 'warranty', 'dlp', 'mrp', 'image',
    'created_at', 'updated_at'
  ];
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const escape = (v) => {
    if (v === null || v === undefined || v === '') return 'NULL';
    if (typeof v === 'number') return v;
    return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
  };

  let totalInserted = 0;

  // Process in chunks
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    
    const values = chunk.map(r => '(' + [
      r.product, r.color, r.chipset, r.type, r.beam_angle, r.ct, r.cri,
      r.drive, r.power_factor, r.drive_details, r.warranty, r.dlp, r.mrp, r.image,
      now, now
    ].map(escape).join(',') + ')').join(',');

    const sql = 'INSERT IGNORE INTO products (' + columns.join(',') + ') VALUES ' + values;

    try {
      await sequelize.query(sql, { type: sequelize.QueryTypes.INSERT, logging: false });
      totalInserted += chunk.length;
    } catch (err) {
      // If chunk still too big, try one by one
      if (err.message.includes('max_allowed_packet')) {
        for (const row of chunk) {
          try {
            const singleValue = '(' + [
              row.product, row.color, row.chipset, row.type, row.beam_angle, row.ct, row.cri,
              row.drive, row.power_factor, row.drive_details, row.warranty, row.dlp, row.mrp, row.image,
              now, now
            ].map(escape).join(',') + ')';
            const singleSql = 'INSERT IGNORE INTO products (' + columns.join(',') + ') VALUES ' + singleValue;
            await sequelize.query(singleSql, { type: sequelize.QueryTypes.INSERT, logging: false });
            totalInserted++;
          } catch (singleErr) {
            log.error({ err: singleErr.message, product: row.product }, 'Single row insert error');
          }
        }
      } else {
        log.error({ err: err.message, chunkSize: chunk.length }, 'Chunk insert error');
      }
    }
  }

  return totalInserted;
}

export async function uploadExcel(req, res, next) {
  const log = req.log || logger;
  const startTime = Date.now();
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'File required', status: 0 });
    }

    filePath = req.file.path;
    log.info({ fileSize: req.file.size, fileName: req.file.originalname, path: filePath }, 'Excel upload started');

    req.setTimeout(0);
    res.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => {
      try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
    };

    send({ type: 'start', message: 'Reading Excel file...' });

    const workbook = new Excel.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheet = workbook.getWorksheet('products') || workbook.worksheets[0];
    if (!sheet) {
      send({ type: 'error', message: 'No worksheet found' });
      if (filePath) try { fs.unlinkSync(filePath); } catch (e) {}
      return res.end();
    }

    const headers = getHeaderMap(sheet.getRow(1));
    if (!headers['product']) {
      send({ type: 'error', message: 'Missing required column: product' });
      if (filePath) try { fs.unlinkSync(filePath); } catch (e) {}
      return res.end();
    }

    send({ type: 'info', message: 'Extracting images...' });
    const images = extractImages(workbook, sheet);

    const totalRows = sheet.rowCount - 1;
    send({ type: 'info', message: 'Found ' + totalRows + ' rows, ' + Object.keys(images).length + ' images', total: totalRows, images: Object.keys(images).length });

    const sequelize = Product.sequelize;
    let batch = [];
    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    let lastPercent = 0;

    send({ type: 'info', message: 'Processing rows...' });

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const productName = getCellValue(row, headers, 'product');

      if (!productName) {
        skipped++;
        processed++;
        continue;
      }

      batch.push({
        product: productName,
        color: getCellValue(row, headers, 'color'),
        chipset: getCellValue(row, headers, 'chipset'),
        type: getCellValue(row, headers, 'type'),
        beam_angle: getCellValue(row, headers, 'beam_angle'),
        ct: getCellValue(row, headers, 'ct'),
        cri: getCellValue(row, headers, 'cri'),
        drive: getCellValue(row, headers, 'drive'),
        power_factor: getCellValue(row, headers, 'power_factor'),
        drive_details: getCellValue(row, headers, 'drive_details'),
        warranty: getCellValue(row, headers, 'warranty'),
        dlp: parseNumber(getCellValue(row, headers, 'dlp')),
        mrp: parseNumber(getCellValue(row, headers, 'mrp')),
        image: images[rowNum] || getCellValue(row, headers, 'image') || null,
      });
      processed++;

      if (batch.length >= BATCH_SIZE) {
        const count = await insertBatchSQL(sequelize, batch, log);
        inserted += count;
        if (count < batch.length) errors += (batch.length - count);
        batch = [];

        const percent = Math.floor((processed / totalRows) * 100);
        if (percent >= lastPercent + PROGRESS_INTERVAL) {
          lastPercent = percent;
          send({ type: 'progress', percent, processed, total: totalRows, inserted });
        }
      }
    }

    // Final batch
    if (batch.length > 0) {
      const count = await insertBatchSQL(sequelize, batch, log);
      inserted += count;
      if (count < batch.length) errors += (batch.length - count);
    }

    // Cleanup
    if (filePath) try { fs.unlinkSync(filePath); } catch (e) {}
    try { CacheService.clear(); } catch (e) {}

    const duration = Date.now() - startTime;
    log.info({ processed, inserted, skipped, errors, duration }, 'Upload complete');

    send({
      type: 'complete',
      status: 1,
      message: 'Upload complete',
      data: { processed, inserted, skipped, errors, total_rows: totalRows, duration_ms: duration }
    });

    return res.end();

  } catch (err) {
    log.error({ err }, 'Upload error');
    if (filePath) try { fs.unlinkSync(filePath); } catch (e) {}
    try {
      res.write('data: ' + JSON.stringify({ type: 'error', message: err.message }) + '\n\n');
      res.end();
    } catch (e) {
      err.status = HTTPStatus.BAD_REQUEST;
      return next(err);
    }
  }
}
