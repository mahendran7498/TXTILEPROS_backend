const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const nodemailer = require('nodemailer');

// Create transporter (configure with your SMTP in .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// POST /api/contact
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;

    // Validate
    if (!name || !phone || !email || !message) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    // Save to DB
    const contact = await Contact.create({
      name, phone, email,
      subject: subject || 'General Inquiry',
      message,
      ip: req.ip,
    });

    // Send email notification (optional — won't break if SMTP not configured)
    if (process.env.SMTP_USER) {
      try {
        await transporter.sendMail({
          from: `"TXTILPROS Website" <${process.env.SMTP_USER}>`,
          to: process.env.NOTIFY_EMAIL || process.env.SMTP_USER,
          subject: `New Inquiry from ${name} — ${subject || 'General'}`,
          html: `
            <h2>New Contact Form Submission</h2>
            <table>
              <tr><td><strong>Name:</strong></td><td>${name}</td></tr>
              <tr><td><strong>Phone:</strong></td><td>${phone}</td></tr>
              <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
              <tr><td><strong>Subject:</strong></td><td>${subject}</td></tr>
              <tr><td><strong>Message:</strong></td><td>${message}</td></tr>
            </table>
          `,
        });

        // Auto-reply to customer
        await transporter.sendMail({
          from: `"TXTILPROS" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Thank you for contacting TXTILPROS',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#0a1628;padding:32px;text-align:center">
                <h1 style="color:#f47320;font-size:28px;margin:0;letter-spacing:2px">TXTILPROS</h1>
                <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:4px 0 0">Textile Machinery Experts</p>
              </div>
              <div style="padding:32px;background:#f4f6f9">
                <h2 style="color:#0a1628">Thank you, ${name}!</h2>
                <p style="color:#4a5568;line-height:1.7">We have received your inquiry and will get back to you within 24 hours. For urgent matters, please call us directly at <strong>+91 98765 43210</strong>.</p>
                <div style="background:white;border-left:4px solid #f47320;padding:16px;margin:20px 0;border-radius:4px">
                  <p style="margin:0;color:#0a1628;font-weight:600">Your message:</p>
                  <p style="margin:8px 0 0;color:#4a5568">${message}</p>
                </div>
                <p style="color:#8a96a8;font-size:13px">TXTILPROS · Coimbatore, Tamil Nadu · +91 98765 43210</p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
      }
    }

    res.status(201).json({ success: true, id: contact._id, message: 'Inquiry received! We\'ll respond within 24 hours.' });
  } catch (err) {
    console.error('Contact route error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/contact (admin — protect this in production)
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const total = await Contact.countDocuments(filter);
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ contacts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/contact/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!contact) return res.status(404).json({ error: 'Not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
