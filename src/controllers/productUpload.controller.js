import HTTPStatus from 'http-status';
import Excel from 'exceljs';
import Product from '../models/product.model.js';
import logger from '../utils/logger.js';

const BATCH_SIZE = 100;

function parseNumber(val) {
  if (val == null) return null;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function clean(text) {
  if (text == null) return '';
  return String(text).trim();
}

function mapSheetImages(workbook, worksheet) {
  const imageMap = new Map();
  const sheetImages = worksheet.getImages?.() || [];
  // console.log();
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
  // console.log('Mapped images for rows:', imageMap);
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
  try {
    if (!req.file) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'File required', status: 0 });
    }

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[1];
    // console.log('Worksheets:', sheet.map(s => s.name));
    // console.log((sheet.getRow(3).values));
    // console.log(sheet.getImages()[2]);
    // console.log(sheet.getRow(3).values);
    if (!sheet) {
      return res.status(HTTPStatus.BAD_REQUEST).json({ message: 'No sheet found', status: 0 });
    }

    const headers = getHeaderMap(sheet);
    const imageMap = mapSheetImages(workbook, sheet);

    let batch = [];
    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    async function flushBatch() {
      requestLogger.debug({ batchSize: batch.length }, 'Flushing product upload batch');
      if (!batch.length) return;
      try {
        const result = await Product.bulkSave(batch, { ordered: false });
        requestLogger.debug({ result }, 'Bulk write result');
        inserted += (result.insertedCount || 0) + (result.upsertedCount || 0);
        updated += result.modifiedCount || 0;
        requestLogger.debug({ inserted, updated, skipped }, 'Processed product upload batch');
      } catch (err) {
        requestLogger.error({ err }, 'Error during bulk write');
        if (err.writeErrors) {
          err.writeErrors.forEach((we) => {
            if (we.code === 11000) skipped += 1;
          });
        } else {
          throw err;
        }
        // Don't throw - continue with remaining batches
      } finally {
        processed += batch.length;
        batch = [];
      }
    }

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);

      const productVal = clean(getCell(row, headers, 'product'));
      if (!productVal) {
        skipped += 1;
        continue;
      }

      const rowImage = imageMap.get(r);
      const inlineImage = clean(getCell(row, headers, 'image'));
      const imageValue = rowImage
        ? `data:image/${rowImage.extension};base64,${rowImage.buffer.toString('base64')}`
        : inlineImage;

      const doc = new Product({
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
      // r==3&&console.log('Parsed document:', doc);
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    return res.status(HTTPStatus.OK).json({
      status: 1,
      message: 'Upload complete',
      processed,
      inserted,
      updated,
      skipped,
    });
  } catch (e) {
    requestLogger.error({ err: e }, 'Upload error');
    e.status = HTTPStatus.BAD_REQUEST;
    return next(e);
  }
}