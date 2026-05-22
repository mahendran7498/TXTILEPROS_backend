const mongoose = require('mongoose');
const { startOfDay } = require('../utils/date');

const leaveRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveDate: { type: Date },
    fromDate: { type: Date, required: true, index: true },
    toDate: { type: Date, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    paidLeaveDays: { type: Number, default: 0 },
    adminComment: { type: String, trim: true, default: '' },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

leaveRequestSchema.pre('validate', function fillLegacyLeaveDates() {
  if (!this.fromDate && this.leaveDate) this.fromDate = this.leaveDate;
  if (!this.toDate && this.leaveDate) this.toDate = this.leaveDate;
});

leaveRequestSchema.pre('validate', function preventPastLeaveSubmission() {
  if (!this.fromDate || (!this.isNew && !this.isModified('fromDate'))) {
    return;
  }

  if (startOfDay(this.fromDate) < startOfDay()) {
    this.invalidate('fromDate', 'Leave request cannot be submitted after the leave date has passed.');
  }
});

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
