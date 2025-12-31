/* eslint-disable no-console */
import mongoose from 'mongoose';
import { checkRole } from '../src/middlewares/rbac.middleware.js';
import User from '../src/models/user.model.js';
import constants from '../src/config/constants.js';

const { ROLES } = constants;

async function testModel() {
    console.log('--- Testing User Model ---');
    const user = new User({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
    });

    if (user.role === ROLES.SALES_PERSON) {
        console.log('PASS: Default role is SALES_PERSON');
    } else {
        console.error(`FAIL: Default role is ${user.role}`);
    }
}

function testMiddleware() {
    console.log('\n--- Testing checkRole Middleware ---');

    const next = () => console.log('  Middleware called next()');
    const sendStatus = (status) => console.log(`  Middleware returned status: ${status}`);
    const res = { sendStatus };

    // Case 1: Admin user (should pass)
    console.log('Case 1: Admin User accessing Admin Route');
    const reqAdmin = { user: { role: ROLES.ADMIN } };
    checkRole([ROLES.ADMIN])(reqAdmin, res, next);

    // Case 2: Salesperson user accessing Admin Route (should fail)
    console.log('Case 2: Salesperson User accessing Admin Route');
    const reqSales = { user: { role: ROLES.SALES_PERSON } };
    checkRole([ROLES.ADMIN])(reqSales, res, next);

    // Case 3: Salesperson user accessing Salesperson Route (should pass)
    console.log('Case 3: Salesperson User accessing Salesperson Route');
    checkRole([ROLES.SALES_PERSON])(reqSales, res, next);

    // Case 4: Manager user accessing Admin Route (should fail)
    console.log('Case 4: Manager User accessing Admin Route');
    const reqManager = { user: { role: ROLES.MANAGER } };
    checkRole([ROLES.ADMIN])(reqManager, res, next);

    // Case 5: Manager user accessing Manager/Admin Route (should pass)
    console.log('Case 5: Manager User accessing Manager Route');
    checkRole([ROLES.MANAGER])(reqManager, res, next);
}

async function run() {
    await testModel();
    testMiddleware();
}

run();
