import { expect } from 'chai';
import sinon from 'sinon';
import * as customerController from '../../src/controllers/customer.controller.js';
import Customer from '../../src/models/customer.model.js';

// Mock response
function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res;
}

// Mock request
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

describe('Customer Controller', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('create', () => {
    it('should create a customer and return 201', async () => {
      const req = mockReq({
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '9876543210',
          company_name: 'Acme Corp',
        },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockCustomer = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        toJSON: () => ({ id: 1, name: 'John Doe' }),
      };

      sinon.stub(Customer, 'create').resolves(mockCustomer);

      await customerController.create(req, res, next);

      expect(res.status.calledWith(201)).to.be.true;
    });

    it('should handle duplicate email errors', async () => {
      const req = mockReq({
        body: {
          name: 'John Doe',
          email: 'existing@example.com',
        },
      });
      const res = mockRes();
      const next = sinon.stub();

      const error = new Error('Duplicate entry');
      error.name = 'SequelizeUniqueConstraintError';
      sinon.stub(Customer, 'create').throws(error);

      await customerController.create(req, res, next);

      expect(next.called).to.be.true;
    });
  });

  describe('list', () => {
    it('should return paginated list of customers', async () => {
      const req = mockReq({
        query: { page: 1, limit: 10 },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockCustomers = {
        count: 2,
        rows: [
          { id: 1, name: 'John Doe' },
          { id: 2, name: 'Jane Smith' },
        ],
      };

      sinon.stub(Customer, 'findAndCountAll').resolves(mockCustomers);

      await customerController.list(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('should search by name or company', async () => {
      const req = mockReq({
        query: { search: 'Acme' },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockCustomers = {
        count: 1,
        rows: [{ id: 1, name: 'John', company_name: 'Acme Corp' }],
      };

      sinon.stub(Customer, 'findAndCountAll').resolves(mockCustomers);

      await customerController.list(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('getById', () => {
    it('should return customer details', async () => {
      const req = mockReq({ params: { id: 1 } });
      const res = mockRes();
      const next = sinon.stub();

      const mockCustomer = {
        id: 1,
        name: 'John Doe',
        bills: [],
      };

      sinon.stub(Customer, 'findByPk').resolves(mockCustomer);

      await customerController.getById(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('should return 404 if customer not found', async () => {
      const req = mockReq({ params: { id: 999 } });
      const res = mockRes();
      const next = sinon.stub();

      sinon.stub(Customer, 'findByPk').resolves(null);

      await customerController.getById(req, res, next);

      expect(res.status.calledWith(404)).to.be.true;
    });
  });

  describe('update', () => {
    it('should update customer and return success', async () => {
      const req = mockReq({
        params: { id: 1 },
        body: { name: 'John Updated' },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockCustomer = {
        id: 1,
        update: sinon.stub().resolves(),
        toJSON: () => ({ id: 1, name: 'John Updated' }),
      };

      sinon.stub(Customer, 'findByPk').resolves(mockCustomer);

      await customerController.update(req, res, next);

      expect(mockCustomer.update.called).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('remove', () => {
    it('should delete customer and return success', async () => {
      const req = mockReq({ params: { id: 1 } });
      const res = mockRes();
      const next = sinon.stub();

      const mockCustomer = {
        id: 1,
        destroy: sinon.stub().resolves(),
      };

      sinon.stub(Customer, 'findByPk').resolves(mockCustomer);

      await customerController.remove(req, res, next);

      expect(mockCustomer.destroy.called).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });
});
