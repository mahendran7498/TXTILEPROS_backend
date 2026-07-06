const mongoose = require('mongoose');

const salaryAuditLogSchema = new mongoose.Schema(
  {
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    salary_record_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRecord', required: true, index: true },
    edited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    field_name: { type: String, required: true, trim: true },
    old_value: { type: String, default: '' },
    new_value: { type: String, default: '' },
    remarks: { type: String, trim: true, default: '' },
    edited_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'salary_audit_logs' }
);

module.exports = mongoose.model('SalaryAuditLog', salaryAuditLogSchema);
