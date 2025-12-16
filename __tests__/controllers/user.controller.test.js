import { expect } from 'chai';
import sinon from 'sinon';
import * as userController from '../../src/controllers/user.controller.js';
import User from '../../src/models/user.model.js';

// Mock response and next
function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res;
}

describe('User Controller', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('create', () => {
    it('should create a user and return success', async () => {
      const req = { body: { email: 'test@example.com', password: 'Password1', username: 'testuser' } };
      const res = mockRes();
      const userStub = { toAuthJSON: () => ({ _id: '123', token: 'token' }) };
      sinon.stub(User, 'create').resolves(userStub);
      await userController.create(req, res, () => {});
      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledWithMatch({ message: 'User created successfully', status: 1 })).to.be.true;
    });
    it('should handle errors and call next', async () => {
      const req = { body: {} };
      const res = mockRes();
      const next = sinon.stub();
      sinon.stub(User, 'create').throws(new Error('fail'));
      await userController.create(req, res, next);
      expect(next.called).to.be.true;
    });
  });

  describe('resetPassword', () => {
    it('should reset password and return success', async () => {
      const req = { body: { password: 'Password1' }, user: { id: 'userId' } };
      const res = mockRes();
      sinon.stub(User, 'findByIdAndUpdate').resolves();
      sinon.stub(require('bcrypt'), 'hash').resolves('hashed');
      await userController.resetPassword(req, res, () => {});
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.calledWithMatch({ message: 'Password reset successful', status: 1 })).to.be.true;
    });
  });

  describe('updateProfile', () => {
    it('should update profile and return success', async () => {
      const req = { body: { first_name: 'John' }, user: { id: 'userId' }, log: { debug: sinon.stub() } };
      const res = mockRes();
      const updatedProfile = { first_name: 'John' };
      sinon.stub(User, 'findByIdAndUpdate').resolves(updatedProfile);
      await userController.updateProfile(req, res, () => {});
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.calledWithMatch({ message: 'updateProfile successful', status: 1 })).to.be.true;
    });
  });
});
