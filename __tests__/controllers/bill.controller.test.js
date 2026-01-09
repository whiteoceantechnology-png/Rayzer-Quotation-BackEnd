import { expect } from 'chai';
import sinon from 'sinon';
import * as billController from '../../src/controllers/bill.controller.js';
import Bill from '../../src/models/bill.model.js';

// Mock response
function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.download = sinon.stub().returns(res);
  return res;
}

// Mock request with user
function mockReq(overrides = {}) {
  return {
    user: { id: 1, user_id: 1 },
    body: {},
    params: {},
    query: {},
    log: { info: sinon.stub(), error: sinon.stub(), debug: sinon.stub() },
    ...overrides,
  };
}

describe('Bill Controller', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('create', () => {
    it('should create a bill and return 201', async () => {
      const req = mockReq({
        body: {
          customer_id: 1,
          items: [
            { product_id: 1, quantity: 2, unit_price: 500, room_name: 'Living Room' },
          ],
          discount: 100,
        },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockBill = {
        id: 1,
        bill_number: 'BILL-001',
        customer_id: 1,
        subtotal: 1000,
        discount: 100,
        total_amount: 900,
        toJSON: () => ({ id: 1, bill_number: 'BILL-001' }),
      };

      sinon.stub(Bill, 'create').resolves(mockBill);

      await billController.create(req, res, next);

      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.called).to.be.true;
    });

    it('should handle validation errors', async () => {
      const req = mockReq({ body: {} }); // Missing required fields
      const res = mockRes();
      const next = sinon.stub();

      await billController.create(req, res, next);

      expect(next.called).to.be.true;
    });
  });

  describe('list', () => {
    it('should return paginated list of bills', async () => {
      const req = mockReq({
        query: { page: 1, limit: 10 },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockBills = {
        count: 2,
        rows: [
          { id: 1, bill_number: 'BILL-001' },
          { id: 2, bill_number: 'BILL-002' },
        ],
      };

      sinon.stub(Bill, 'findAndCountAll').resolves(mockBills);

      await billController.list(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.called).to.be.true;
    });

    it('should filter by customer_id', async () => {
      const req = mockReq({
        query: { customer_id: 1 },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockBills = { count: 1, rows: [{ id: 1 }] };
      const findStub = sinon.stub(Bill, 'findAndCountAll').resolves(mockBills);

      await billController.list(req, res, next);

      expect(findStub.called).to.be.true;
      const callArgs = findStub.firstCall.args[0];
      expect(callArgs.where).to.have.property('customer_id');
    });

    it('should filter by status', async () => {
      const req = mockReq({
        query: { status: 'draft' },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockBills = { count: 1, rows: [{ id: 1, status: 'draft' }] };
      sinon.stub(Bill, 'findAndCountAll').resolves(mockBills);

      await billController.list(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('getById', () => {
    it('should return bill details', async () => {
      const req = mockReq({ params: { id: 1 } });
      const res = mockRes();
      const next = sinon.stub();

      const mockBill = {
        id: 1,
        bill_number: 'BILL-001',
        items: [],
        customer: { name: 'Test Customer' },
      };

      sinon.stub(Bill, 'findByPk').resolves(mockBill);

      await billController.getById(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.called).to.be.true;
    });

    it('should return 404 if bill not found', async () => {
      const req = mockReq({ params: { id: 999 } });
      const res = mockRes();
      const next = sinon.stub();

      sinon.stub(Bill, 'findByPk').resolves(null);

      await billController.getById(req, res, next);

      expect(res.status.calledWith(404)).to.be.true;
    });
  });

  describe('update', () => {
    it('should update bill and return success', async () => {
      const req = mockReq({
        params: { id: 1 },
        body: { discount: 200 },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockBill = {
        id: 1,
        update: sinon.stub().resolves(),
        toJSON: () => ({ id: 1, discount: 200 }),
      };

      sinon.stub(Bill, 'findByPk').resolves(mockBill);

      await billController.update(req, res, next);

      expect(mockBill.update.called).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('should return 404 if bill not found', async () => {
      const req = mockReq({
        params: { id: 999 },
        body: { discount: 200 },
      });
      const res = mockRes();
      const next = sinon.stub();

      sinon.stub(Bill, 'findByPk').resolves(null);

      await billController.update(req, res, next);

      expect(res.status.calledWith(404)).to.be.true;
    });
  });

  describe('remove', () => {
    it('should delete bill and return success', async () => {
      const req = mockReq({ params: { id: 1 } });
      const res = mockRes();
      const next = sinon.stub();

      const mockBill = {
        id: 1,
        destroy: sinon.stub().resolves(),
      };

      sinon.stub(Bill, 'findByPk').resolves(mockBill);

      await billController.remove(req, res, next);

      expect(mockBill.destroy.called).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });
});
