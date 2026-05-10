const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveDate: { type: Date },
    fromDate: { type: Date, required: true, index: true },
    toDate: { type: Date, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
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

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
