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
  return cell.text != null ? cell.text.trim() : clean(cell.value);
}

function extractImages(workbook, worksheet) {
  const imageMap = {};
  try {
    const media = (workbook.model && workbook.model.media) || [];
    const wsImages = (worksheet.getImages && worksheet.getImages()) || [];
    for (const img of wsImages) {
      try {
        const data = media[img.imageId];
        if (data && data.buffer) {
          const tl = img.range && img.range.tl;
          const rowNum =
            (tl && tl.nativeRow != null ? tl.nativeRow : tl ? tl.row : 0) + 1;
          const ext = data.extension || 'png';
          const mime =
            ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext;
          imageMap[rowNum] =
            'data:' + mime + ';base64,' + data.buffer.toString('base64');
        }
      } catch (e) {}
    }
  } catch (e) {}
  return imageMap;
}

/**
 * Insert/Update batch - splits into smaller chunks if images present
 * Uses UPSERT (INSERT ON DUPLICATE KEY UPDATE) to update existing records
 * MariaDB max_allowed_packet is typically 16MB, base64 images can be large
 */
async function insertBatchSQL(sequelize, batch, log) {
  if (!batch.length) return { inserted: 0, updated: 0 };

  // Check if batch has images - if so, use smaller chunks
  const hasImages = batch.some(r => r.image && r.image.length > 1000);
  const chunkSize = hasImages ? 20 : 500; // Small chunks for images

  const columns = [
    'id',
    'product',
    'color',
    'chipset',
    'type',
    'beam_angle',
    'ct',
    'cri',
    'drive',
    'power_factor',
    'drive_details',
    'warranty',
    'dlp',
    'dlp_20',
    'dlp_15',
    'dlp_5',
    'mrp',
    'image',
    'created_at',
    'updated_at',
  ];

  // Columns to update on duplicate (exclude id and created_at)
  const updateColumns = [
    'product',
    'color',
    'chipset',
    'type',
    'beam_angle',
    'ct',
    'cri',
    'drive',
    'power_factor',
    'drive_details',
    'warranty',
    'dlp',
    'dlp_20',
    'dlp_15',
    'dlp_5',
    'mrp',
    'image',
  ];

  const now = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  const escape = v => {
    if (v === null || v === undefined || v === '') return 'NULL';
    if (typeof v === 'number') return v;
    return (
      "'" +
      String(v)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "''") +
      "'"
    );
  };

  let totalInserted = 0;
  let totalUpdated = 0;

  // Build ON DUPLICATE KEY UPDATE clause
  const updateClause =
    updateColumns.map(col => `${col} = VALUES(${col})`).join(', ') +
    `, updated_at = '${now}'`;

  // Process in chunks
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);

    const values = chunk
      .map(
        r =>
          '(' +
          [
            r.id || null,
            r.product,
            r.color,
            r.chipset,
            r.type,
            r.beam_angle,
            r.ct,
            r.cri,
            r.drive,
            r.power_factor,
            r.drive_details,
            r.warranty,
            r.dlp,
            r.dlp_20,
            r.dlp_15,
            r.dlp_5,
            r.mrp,
            r.image,
            now,
            now,
          ]
            .map(escape)
            .join(',') +
          ')',
      )
      .join(',');

    const sql =
      'INSERT INTO products (' +
      columns.join(',') +
      ') VALUES ' +
      values +
      ' ON DUPLICATE KEY UPDATE ' +
      updateClause;

    try {
      const [result] = await sequelize.query(sql, {
        type: sequelize.QueryTypes.INSERT,
        logging: false,
      });
      // affectedRows: inserts count as 1, updates count as 2
      const affected = (result && result.affectedRows) || chunk.length;
      // Estimate: if affectedRows > chunk.length, some were updates
      const updates = Math.max(0, affected - chunk.length);
      totalInserted += chunk.length - updates;
      totalUpdated += updates;
    } catch (err) {
      // If chunk still too big, try one by one
      if (err.message.includes('max_allowed_packet')) {
        for (const row of chunk) {
          try {
            const singleValue =
              '(' +
              [
                row.id || null,
                row.product,
                row.color,
                row.chipset,
                row.type,
                row.beam_angle,
                row.ct,
                row.cri,
                row.drive,
                row.power_factor,
                row.drive_details,
                row.warranty,
                row.dlp,
                row.dlp_20,
                row.dlp_15,
                row.dlp_5,
                row.mrp,
                row.image,
                now,
                now,
              ]
                .map(escape)
                .join(',') +
              ')';
            const singleSql =
              'INSERT INTO products (' +
              columns.join(',') +
              ') VALUES ' +
              singleValue +
              ' ON DUPLICATE KEY UPDATE ' +
              updateClause;
            await sequelize.query(singleSql, {
              type: sequelize.QueryTypes.INSERT,
              logging: false,
            });
            totalInserted++;
          } catch (singleErr) {
            log.error(
              { err: singleErr.message, product: row.product },
              'Single row insert error',
            );
          }
        }
      } else {
        log.error(
          { err: err.message, chunkSize: chunk.length },
          'Chunk insert error',
        );
      }
    }
  }

  return { inserted: totalInserted, updated: totalUpdated };
}

export async function uploadExcel(req, res, next) {
  const log = req.log || logger;
  const startTime = Date.now();
  let filePath = null;

  try {
    if (!req.file) {
      return res
        .status(HTTPStatus.BAD_REQUEST)
        .json({ message: 'File required', status: 0 });
    }

    filePath = req.file.path;
    log.info(
      {
        fileSize: req.file.size,
        fileName: req.file.originalname,
        path: filePath,
      },
      'Excel upload started',
    );

    req.setTimeout(0);
    res.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = data => {
      try {
        res.write('data: ' + JSON.stringify(data) + '\n\n');
      } catch (e) {}
    };

    send({ type: 'start', message: 'Reading Excel file...' });

    const workbook = new Excel.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheet = workbook.getWorksheet('products') || workbook.worksheets[0];
    if (!sheet) {
      send({ type: 'error', message: 'No worksheet found' });
      if (filePath)
        try {
          fs.unlinkSync(filePath);
        } catch (e) {}
      return res.end();
    }

    const headers = getHeaderMap(sheet.getRow(1));
    if (!headers['product']) {
      send({ type: 'error', message: 'Missing required column: product' });
      if (filePath)
        try {
          fs.unlinkSync(filePath);
        } catch (e) {}
      return res.end();
    }

    send({ type: 'info', message: 'Extracting images...' });
    const images = extractImages(workbook, sheet);

    const totalRows = sheet.rowCount - 1;
    send({
      type: 'info',
      message:
        'Found ' +
        totalRows +
        ' rows, ' +
        Object.keys(images).length +
        ' images',
      total: totalRows,
      images: Object.keys(images).length,
    });

    const sequelize = Product.sequelize;
    let batch = [];
    let processed = 0;
    let inserted = 0;
    let updated = 0;
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

      // Get ID if present (for updating existing records)
      const productId = parseNumber(getCellValue(row, headers, 'id'));

      batch.push({
        id: productId,
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
        dlp_20: parseNumber(getCellValue(row, headers, 'dlp_20')),
        dlp_15: parseNumber(getCellValue(row, headers, 'dlp_15')),
        dlp_5: parseNumber(getCellValue(row, headers, 'dlp_5')),
        mrp: parseNumber(getCellValue(row, headers, 'mrp')),
        image: images[rowNum] || getCellValue(row, headers, 'image') || null,
      });
      processed++;

      if (batch.length >= BATCH_SIZE) {
        const result = await insertBatchSQL(sequelize, batch, log);
        inserted += result.inserted;
        updated += result.updated;
        batch = [];

        const percent = Math.floor(processed / totalRows * 100);
        if (percent >= lastPercent + PROGRESS_INTERVAL) {
          lastPercent = percent;
          send({
            type: 'progress',
            percent,
            processed,
            total: totalRows,
            inserted,
            updated,
          });
        }
      }
    }

    // Final batch
    if (batch.length > 0) {
      const result = await insertBatchSQL(sequelize, batch, log);
      inserted += result.inserted;
      updated += result.updated;
    }

    // Cleanup
    if (filePath)
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    try {
      CacheService.clear();
    } catch (e) {}

    const duration = Date.now() - startTime;
    log.info(
      { processed, inserted, updated, skipped, errors, duration },
      'Upload complete',
    );

    send({
      type: 'complete',
      status: 1,
      message: 'Upload complete',
      data: {
        processed,
        inserted,
        updated,
        skipped,
        errors,
        total_rows: totalRows,
        duration_ms: duration,
      },
    });

    return res.end();
  } catch (err) {
    log.error({ err }, 'Upload error');
    if (filePath)
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    try {
      res.write(
        'data: ' +
          JSON.stringify({ type: 'error', message: err.message }) +
          '\n\n',
      );
      res.end();
    } catch (e) {
      err.status = HTTPStatus.BAD_REQUEST;
      return next(err);
    }
  }
}

/**
 * Export products to Excel file for editing
 * Downloads all products with ID column for re-upload updates
 */
export async function exportExcel(req, res, next) {
  const log = req.log || logger;

  try {
    log.info('Starting product export to Excel');

    // Fetch all products (exclude large image data for export)
    const products = await Product.findAll({
      attributes: [
        'id',
        'product',
        'color',
        'chipset',
        'type',
        'beam_angle',
        'ct',
        'cri',
        'drive',
        'power_factor',
        'drive_details',
        'warranty',
        'dlp',
        'dlp_20',
        'dlp_15',
        'dlp_5',
        'mrp',
      ],
      order: [['id', 'ASC']],
      raw: true,
    });

    if (!products.length) {
      return res.status(HTTPStatus.NOT_FOUND).json({
        message: 'No products found to export',
        status: 0,
      });
    }

    // Create workbook and worksheet
    const workbook = new Excel.Workbook();
    workbook.creator = 'Rayzer Lights';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('products', {
      properties: { defaultColWidth: 15 },
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }], // Freeze first column (ID) and first row (header)
    });

    // Define columns - ID first for updates, then all product fields
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Chipset', key: 'chipset', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Beam_Angle', key: 'beam_angle', width: 12 },
      { header: 'CT', key: 'ct', width: 10 },
      { header: 'CRI', key: 'cri', width: 10 },
      { header: 'Drive', key: 'drive', width: 15 },
      { header: 'Power_Factor', key: 'power_factor', width: 12 },
      { header: 'Drive_Details', key: 'drive_details', width: 25 },
      { header: 'Warranty', key: 'warranty', width: 15 },
      { header: 'DLP', key: 'dlp', width: 12 },
      { header: 'DLP_20', key: 'dlp_20', width: 12 },
      { header: 'DLP_15', key: 'dlp_15', width: 12 },
      { header: 'DLP_5', key: 'dlp_5', width: 12 },
      { header: 'MRP', key: 'mrp', width: 12 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F4F4' },
    };

    // Add product data rows
    products.forEach(product => {
      worksheet.addRow({
        id: product.id,
        product: product.product || '',
        color: product.color || '',
        chipset: product.chipset || '',
        type: product.type || '',
        beam_angle: product.beam_angle || '',
        ct: product.ct || '',
        cri: product.cri || '',
        drive: product.drive || '',
        power_factor: product.power_factor || '',
        drive_details: product.drive_details || '',
        warranty: product.warranty || '',
        dlp: product.dlp || '',
        dlp_20: product.dlp_20 || '',
        dlp_15: product.dlp_15 || '',
        dlp_5: product.dlp_5 || '',
        mrp: product.mrp || '',
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set response headers for file download
    const filename = `products_export_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    log.info(
      { count: products.length, filename, size: buffer.length },
      'Product export complete',
    );

    return res.send(buffer);
  } catch (err) {
    log.error({ err }, 'Export error');
    err.status = HTTPStatus.INTERNAL_SERVER_ERROR;
    return next(err);
  }
}
