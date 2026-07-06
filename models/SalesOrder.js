const mongoose = require('mongoose');

const salesOrderSchema = new mongoose.Schema(
  {
    customer_name: { type: String, required: true, trim: true },
    phone_number: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    company_id_photo: { type: String, required: true, trim: true },
    order_status: { type: String, trim: true, default: 'Pending' },
    created_by: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

module.exports = mongoose.model('SalesOrder', salesOrderSchema, 'sales_orders');
