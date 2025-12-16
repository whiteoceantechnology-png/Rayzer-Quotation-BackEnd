import mongoose, { Schema } from 'mongoose';

const CustomerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    mobile_number: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    company_name: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by is required'],
    }, 
    created_at: Date,
    updated_at: Date,
  },
  { timestamps: false, versionKey: false },
);

CustomerSchema.pre('save', async function (next) {
  try {
    next();
  } catch (err) {
    next(err);
  }
});

// Remove the toJSON transform - it's now handled globally

const Customer = mongoose.model('Customer', CustomerSchema);
export default Customer;