import mongoose, { Schema } from 'mongoose';

const ProductSchema = new Schema(
  {
    product: { type: String, required: true },
    color: { type: String },
    chipset: { type: String },
    type: { type: String },
    beam_angle: { type: String },
    ct: { type: String },
    cri: { type: String },
    drive: { type: String },
    power_factor: { type: String },
    drive_details: { type: String },
    warranty: { type: String },
    dlp: { type: Number },
    mrp: { type: Number },
    image: { type: String, default: '' },
    MRP: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

// Unique composite index to support upsert deduplication
ProductSchema.index({ product: 1, color: 1, chipset: 1, ct: 1, beam_angle: 1, type: 1 }, { unique: false });

// Add text index for better full-text search
ProductSchema.index({ 
  product: 'text', 
  color: 'text', 
  chipset: 'text',
  ct: 'text',
  cri: 'text',
  drive: 'text',
  warranty: 'text'
});

// Add individual indexes for common queries
ProductSchema.index({ product: 1 });
ProductSchema.index({ color: 1 });
ProductSchema.index({ chipset: 1 });
ProductSchema.index({ ct: 1 });
ProductSchema.index({ created_at: -1 });

const Product = mongoose.model('Product', ProductSchema);
export default Product;