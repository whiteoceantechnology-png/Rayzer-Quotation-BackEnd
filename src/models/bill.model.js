import mongoose, { Schema } from 'mongoose';

const BillItemSchema = new Schema({
  product_id: { type: Schema.Types.ObjectId, ref: 'Product' },
  room_name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  total_price: { type: Number, required: true },
});

const BillSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    bill_number: { type: String, unique: true },
    customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },    
    items: [BillItemSchema],    
    subtotal: { type: Number, required: true },
    tax_rate: { type: Number, default: 18 },
    tax_amount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total_amount: { type: Number, required: true },
    
    notes: String,
    terms_conditions: String,
    
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'sent', 'paid', 'cancelled'], default: 'draft' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

// Auto-generate bill number
BillSchema.pre('save', async function (next) {
  if (this.isNew && !this.bill_number) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const lastBill = await mongoose.models.Bill.findOne().sort('-created_at').exec();
    const seq = lastBill ? parseInt(lastBill.bill_number.split('-').pop()) + 1 : 1;
    this.bill_number = `INV-${year}${month}-${String(seq).padStart(4, '0')}`;
  }
  next();
});

// Remove the toJSON transform - it's now handled globally

const Bill = mongoose.model('Bill', BillSchema);
export default Bill;