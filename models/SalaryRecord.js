const mongoose = require('mongoose');

const salaryRecordSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    basicSalary: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    incentives: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    leaveDeduction: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['paid', 'unpaid', 'pending'], default: 'pending', index: true },
    approvalStatus: { type: String, enum: ['admin_review', 'approved'], default: 'admin_review', index: true },
    remarks: { type: String, trim: true, default: '' },
    generatedDate: { type: Date, default: Date.now },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    payslipGeneratedAt: { type: Date },
    emailDeliveryStatus: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
    emailSentAt: { type: Date },
    emailError: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

salaryRecordSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('SalaryRecord', salaryRecordSchema);
