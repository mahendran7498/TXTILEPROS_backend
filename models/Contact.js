const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  subject: { type: String, default: 'General Inquiry' },
  message: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ['new', 'read', 'replied'], default: 'new' },
  ip: String,
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
