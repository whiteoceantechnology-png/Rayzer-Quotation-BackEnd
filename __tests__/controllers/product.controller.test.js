import { expect } from 'chai';
import sinon from 'sinon';
import * as productController from '../../src/controllers/product.controller.js';
import Product from '../../src/models/product.model.js';
import CacheService from '../../src/services/cache.js';

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
    file: null,
    log: { info: sinon.stub(), error: sinon.stub(), debug: sinon.stub() },
    ...overrides,
  };
}

describe('Product Controller', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('list', () => {
    it('should return paginated list of products', async () => {
      const req = mockReq({
        query: { page: 1, limit: 10 },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockProducts = [
        { toJSON: () => ({ id: 1, product: 'LED Spotlight' }) },
        { toJSON: () => ({ id: 2, product: 'Strip Light' }) },
      ];

      sinon.stub(CacheService, 'get').resolves(null);
      sinon.stub(CacheService, 'set').resolves();
      sinon.stub(Product, 'count').resolves(2);
      sinon.stub(Product, 'findAll').resolves(mockProducts);

      await productController.list(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.called).to.be.true;
    });

    it('should search by product name', async () => {
      const req = mockReq({
        query: { search: 'LED' },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockProducts = [
        { toJSON: () => ({ id: 1, product: 'LED Spotlight' }) },
      ];

      sinon.stub(CacheService, 'get').resolves(null);
      sinon.stub(CacheService, 'set').resolves();
      sinon.stub(Product, 'count').resolves(1);
      const findStub = sinon.stub(Product, 'findAll').resolves(mockProducts);

      await productController.list(req, res, next);

      expect(findStub.called).to.be.true;
    });

    it('should return cached list results when available', async () => {
      const req = mockReq({
        query: { page: 1, limit: 10, search: 'Strip Driver 12v' },
      });
      const res = mockRes();
      const next = sinon.stub();
      const cachedPayload = {
        status: 1,
        message: 'Products fetched',
        data: [{ id: 1, product: 'Cached Strip' }],
        meta: { page: 1, limit: 10, total: 1 },
      };

      sinon.stub(CacheService, 'get').resolves(cachedPayload);
      const countStub = sinon.stub(Product, 'count');
      const findStub = sinon.stub(Product, 'findAll');

      await productController.list(req, res, next);

      expect(countStub.called).to.be.false;
      expect(findStub.called).to.be.false;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('listAll', () => {
    it('should return all products without pagination', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = sinon.stub();

      const mockProducts = [
        { id: 1, product: 'LED Spotlight' },
        { id: 2, product: 'Strip Light' },
      ];

      sinon.stub(CacheService, 'get').returns(null);
      sinon.stub(CacheService, 'set');
      sinon.stub(Product, 'findAll').resolves(mockProducts);

      await productController.listAll(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('should return cached products if available', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = sinon.stub();

      const cachedProducts = [{ id: 1, product: 'Cached Product' }];

      sinon.stub(CacheService, 'get').returns(cachedProducts);
      const findStub = sinon.stub(Product, 'findAll');

      await productController.listAll(req, res, next);

      expect(findStub.called).to.be.false;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('getById', () => {
    it('should return product by ID', async () => {
      const req = mockReq({ params: { id: 1 } });
      const res = mockRes();
      const next = sinon.stub();

      const mockProduct = { id: 1, product: 'LED Spotlight' };

      sinon.stub(Product, 'findByPk').resolves(mockProduct);

      await productController.getById(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('should return 404 if product not found', async () => {
      const req = mockReq({ params: { id: 999 } });
      const res = mockRes();
      const next = sinon.stub();

      sinon.stub(Product, 'findByPk').resolves(null);

      await productController.getById(req, res, next);

      expect(res.status.calledWith(404)).to.be.true;
    });
  });

  describe('createProduct', () => {
    it('should create a product', async () => {
      const req = mockReq({
        body: {
          product: 'New LED Light',
          mrp: 1000,
          dlp: 800,
        },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockProduct = { id: 1, product: 'New LED Light', mrp: 1000 };

      sinon.stub(Product, 'create').resolves(mockProduct);
      sinon.stub(CacheService, 'clear');

      await productController.createProduct(req, res, next);

      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  describe('updateProduct', () => {
    it('should update a product', async () => {
      const req = mockReq({
        params: { id: 1 },
        body: { mrp: 1200 },
      });
      const res = mockRes();
      const next = sinon.stub();

      const mockProduct = {
        id: 1,
        update: sinon.stub().resolves(),
        toJSON: () => ({ id: 1, mrp: 1200 }),
      };

      sinon.stub(Product, 'findByPk').resolves(mockProduct);
      sinon.stub(CacheService, 'clear');

      await productController.updateProduct(req, res, next);

      expect(mockProduct.update.called).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('deleteProduct', () => {
    it('should delete a product', async () => {
      const req = mockReq({ params: { id: 1 } });
      const res = mockRes();
      const next = sinon.stub();

      const mockProduct = {
        id: 1,
        destroy: sinon.stub().resolves(),
      };

      sinon.stub(Product, 'findByPk').resolves(mockProduct);
      sinon.stub(CacheService, 'clear');

      await productController.deleteProduct(req, res, next);

      expect(mockProduct.destroy.called).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('getProducts (dropdown data)', () => {
    it('should return unique product names', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = sinon.stub();

      const mockProducts = [
        { product: 'LED Spotlight' },
        { product: 'Strip Light' },
      ];

      sinon.stub(Product, 'findAll').resolves(mockProducts);

      await productController.getProducts(req, res, next);

      expect(res.status.calledWith(200)).to.be.true;
    });
  });
});
