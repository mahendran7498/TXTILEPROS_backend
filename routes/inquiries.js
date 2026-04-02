const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  type: { type: String, enum: ['quote', 'service', 'parts', 'consultation'], default: 'quote' },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: String,
  company: String,
  location: String,
  machineCount: Number,
  fabricType: String,
  notes: String,
  status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' },
}, { timestamps: true });

const Inquiry = mongoose.model('Inquiry', inquirySchema);

// POST /api/inquiries
router.post('/', async (req, res) => {
  try {
    const inquiry = await Inquiry.create(req.body);
    res.status(201).json({ success: true, id: inquiry._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inquiries (admin)
router.get('/', async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
