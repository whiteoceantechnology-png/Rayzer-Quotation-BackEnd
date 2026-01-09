import { expect } from 'chai';
import sinon from 'sinon';

// Note: Worker threads are harder to test directly
// This tests the controller behavior with mocked worker

describe('Product Upload Controller', () => {
  describe('Excel Upload', () => {
    it('should require a file', async () => {
      // Mock request without file
      const req = {
        file: null,
        log: { info: sinon.stub(), error: sinon.stub() },
      };
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
      };
      const next = sinon.stub();

      // Import controller
      const { uploadExcel } = await import('../../src/controllers/productUpload.controller.js');

      await uploadExcel(req, res, next);

      expect(res.status.calledWith(400)).to.be.true;
      expect(res.json.calledWithMatch({ message: 'File required' })).to.be.true;
    });

    it('should set SSE headers for streaming', async () => {
      const req = {
        file: {
          buffer: Buffer.from('dummy'),
          size: 100,
          originalname: 'test.xlsx',
        },
        log: { info: sinon.stub(), error: sinon.stub() },
        setTimeout: sinon.stub(),
      };
      
      const headers = {};
      const res = {
        setHeader: (key, value) => { headers[key] = value; },
        setTimeout: sinon.stub(),
        flushHeaders: sinon.stub(),
        write: sinon.stub(),
        end: sinon.stub(),
      };
      const next = sinon.stub();

      // Import controller
      const { uploadExcel } = await import('../../src/controllers/productUpload.controller.js');

      // Start upload (will fail due to invalid Excel, but headers should be set)
      try {
        await uploadExcel(req, res, next);
      } catch (e) {
        // Expected to fail with invalid Excel buffer
      }

      expect(headers['Content-Type']).to.equal('text/event-stream');
      expect(headers['Cache-Control']).to.equal('no-cache');
      expect(headers['X-Accel-Buffering']).to.equal('no');
    });
  });

  describe('Excel Parser Worker', () => {
    it('should export from correct path', async () => {
      const workerPath = '../../src/workers/excelParser.worker.js';
      
      // Just verify the file can be imported (exists)
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const fullPath = path.join(__dirname, workerPath);
      
      expect(fs.existsSync(fullPath)).to.be.true;
    });
  });
});
