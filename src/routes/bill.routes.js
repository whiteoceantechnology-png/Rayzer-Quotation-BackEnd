import { Router } from 'express';
import * as BillController from '../controllers/bill.controller.js';
import { authJwt } from '../services/auth.js';

const router = new Router();

router.post('/', authJwt, BillController.create);
router.get('/', authJwt, BillController.list);
router.get('/:id', authJwt, BillController.getById);
router.get('/:id/pdf', authJwt, BillController.generatePDF);

export default router;