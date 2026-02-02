import Sequelize, { Model } from 'sequelize';
import sequelize from '../config/database.js';
import Customer from './customer.model.js';
import User from './user.model.js';
import Product from './product.model.js';

class BillItem extends Model { }

BillItem.init({
  room_name: { type: Sequelize.STRING, allowNull: false },
  quantity: { type: Sequelize.INTEGER, allowNull: false },
  unit_price: { type: Sequelize.FLOAT, allowNull: false },
  total_price: { type: Sequelize.FLOAT, allowNull: false },
  dlp_total: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
  // product_id foreign key defined by association
  // bill_id foreign key defined by association
}, {
  sequelize,
  modelName: 'BillItem',
  tableName: 'bill_items',
  underscored: true,
  timestamps: false,
  indexes: [
    { fields: ['bill_id'] },
    { fields: ['product_id'] }
  ]
});

class Bill extends Model { }

Bill.init({
  bill_number: {
    type: Sequelize.STRING,
    unique: true
  },
  subtotal: { type: Sequelize.FLOAT, allowNull: false },
  tax_rate: { type: Sequelize.FLOAT, defaultValue: 18 },
  tax_amount: { type: Sequelize.FLOAT, allowNull: false },
  discount: { type: Sequelize.FLOAT, defaultValue: 0 },
  total_amount: { type: Sequelize.FLOAT, allowNull: false },
  notes: Sequelize.TEXT,
  terms_conditions: Sequelize.TEXT,
  dlp_total: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
  status: {
    type: Sequelize.ENUM('draft', 'sent', 'paid', 'cancelled'),
    defaultValue: 'draft'
  },
  // customer_id FK
  // created_by FK (User)
}, {
  sequelize,
  modelName: 'Bill',
  tableName: 'bills',
  underscored: true,
  indexes: [
    { fields: ['customer_id'] },
    { fields: ['created_by'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
    { fields: ['bill_number'] } // unique constraint already adds index, but good to be explicit or leave as is (unique: true implies index)
  ]
});

// Add indexes to BillItem (Doing it via direct init update or separately if desired, usually init)
// Re-init BillItem with indexes (Need to replace the whole init block for BillItem or just add indexes if I can match it)

// Associations
Bill.hasMany(BillItem, { foreignKey: 'bill_id', as: 'items' });
BillItem.belongsTo(Bill, { foreignKey: 'bill_id' });

BillItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

Bill.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Bill.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Hook for bill_number with transaction lock to prevent race condition
Bill.beforeCreate(async (bill, options) => {
  if (!bill.bill_number) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}-`;

    // Use transaction if available, or create one for atomic sequence generation
    const transaction = options.transaction;
    
    // Find last bill with matching prefix for this month to get sequence
    // Use FOR UPDATE lock when in transaction to prevent race condition
    const lastBill = await Bill.findOne({
      where: {
        bill_number: {
          [Sequelize.Op.like]: `${prefix}%`
        }
      },
      order: [['bill_number', 'DESC']],
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {})
    });

    let seq = 1;
    if (lastBill && lastBill.bill_number) {
      const parts = lastBill.bill_number.split('-');
      const lastSeq = parseInt(parts.pop(), 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    bill.bill_number = `${prefix}${String(seq).padStart(4, '0')}`;
  }
});

export { Bill, BillItem };
export default Bill;