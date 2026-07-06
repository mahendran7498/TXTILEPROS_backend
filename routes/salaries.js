const express = require('express');
const SalaryAuditLog = require('../models/SalaryAuditLog');
const SalaryRecord = require('../models/SalaryRecord');
const { requireAnyRole, requireAuth } = require('../middleware/auth');
const { sendPayslipEmail } = require('../utils/email');
const { buildPayslipPdf, getPayslipFilename } = require('../utils/payslipPdf');
const { ensureSalaryRecordsForMonth, getSalaryMonth, recalculateNetSalary } = require('../utils/salary');

const router = express.Router();
const ADMIN_ROLES = ['owner', 'admin'];
const PAYSLIP_EMPLOYEE_FIELDS = 'name email employeeCode department role createdAt';
const EDITABLE_FIELDS = [
  'basicSalary',
  'incentives',
  'overtimeAmount',
  'leaveDeduction',
  'otherDeductions',
  'paymentStatus',
  'remarks',
];

router.use(requireAuth);

function serializeSalary(record) {
  const doc = record?.toObject ? record.toObject() : record;
  return {
    ...doc,
    employee: doc.employee,
    salaryRecordId: String(doc._id),
  };
}

async function findSalaryRecordForAdmin(id) {
  return SalaryRecord.findById(id)
    .populate('employee', PAYSLIP_EMPLOYEE_FIELDS)
    .populate('approvedBy', 'name email role');
}

router.get('/mine', async (req, res, next) => {
  try {
    const records = await SalaryRecord.find({
      employee: req.user._id,
      approvalStatus: 'approved',
    })
      .sort({ year: -1, month: -1 })
      .populate('employee', PAYSLIP_EMPLOYEE_FIELDS);

    res.json({ salaries: records.map(serializeSalary) });
  } catch (error) {
    next(error);
  }
});

router.get('/mine/:id/payslip', async (req, res, next) => {
  try {
    const record = await SalaryRecord.findOne({
      _id: req.params.id,
      employee: req.user._id,
      approvalStatus: 'approved',
    }).populate('employee', PAYSLIP_EMPLOYEE_FIELDS);

    if (!record) {
      return res.status(404).json({ error: 'Payslip not found.' });
    }

    const pdf = buildPayslipPdf(record);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${getPayslipFilename(record)}"`);
    return res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const { year, month } = getSalaryMonth(req.query.month);
    const status = String(req.query.status || '').trim();
    await ensureSalaryRecordsForMonth({ year, month });

    const filter = { year, month };
    if (['paid', 'unpaid', 'pending'].includes(status)) {
      filter.paymentStatus = status;
    }

    const salaries = await SalaryRecord.find(filter)
      .sort({ year: -1, month: -1, paymentStatus: 1 })
      .populate('employee', PAYSLIP_EMPLOYEE_FIELDS)
      .populate('approvedBy', 'name email role');

    res.json({ salaries: salaries.map(serializeSalary) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const salary = await findSalaryRecordForAdmin(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found.' });
    }
    res.json({ salary: serializeSalary(salary) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const salary = await SalaryRecord.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found.' });
    }
    if (salary.approvalStatus === 'approved') {
      return res.status(400).json({ error: 'Approved salaries cannot be edited.' });
    }

    const logs = [];
    const remarks = String(req.body.remarks || '').trim();

    for (const field of EDITABLE_FIELDS) {
      if (!(field in req.body)) continue;

      const oldValue = salary[field];
      const newValue = field === 'paymentStatus'
        ? String(req.body[field] || '').trim()
        : field === 'remarks'
          ? String(req.body[field] || '').trim()
          : Number(req.body[field] || 0);

      if (field === 'paymentStatus' && !['paid', 'unpaid', 'pending'].includes(newValue)) {
        return res.status(400).json({ error: 'Payment status must be paid, unpaid, or pending.' });
      }

      if (String(oldValue ?? '') === String(newValue ?? '')) continue;

      salary[field] = newValue;
      logs.push({
        employee_id: salary.employee,
        salary_record_id: salary._id,
        edited_by: req.user._id,
        field_name: field,
        old_value: String(oldValue ?? ''),
        new_value: String(newValue ?? ''),
        remarks,
        edited_at: new Date(),
      });
    }

    recalculateNetSalary(salary);
    await salary.save();
    if (logs.length) {
      await SalaryAuditLog.insertMany(logs);
    }

    const populated = await findSalaryRecordForAdmin(salary._id);
    res.json({ salary: serializeSalary(populated) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approve', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const salary = await SalaryRecord.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found.' });
    }

    salary.approvalStatus = 'approved';
    salary.approvedBy = req.user._id;
    salary.approvedAt = new Date();
    recalculateNetSalary(salary);
    await salary.save();

    const populated = await findSalaryRecordForAdmin(salary._id);
    res.json({ salary: serializeSalary(populated) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/generate-payslip', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const salary = await findSalaryRecordForAdmin(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found.' });
    }
    if (salary.approvalStatus !== 'approved') {
      return res.status(400).json({ error: 'Approve salary before generating the payslip.' });
    }

    const pdf = buildPayslipPdf(salary);
    salary.payslipGeneratedAt = new Date();
    try {
      const result = await sendPayslipEmail({ salaryRecord: salary, pdfBuffer: pdf });
      salary.emailDeliveryStatus = result.status || 'sent';
      salary.emailSentAt = result.status === 'sent' ? new Date() : salary.emailSentAt;
      salary.emailError = result.message || '';
    } catch (emailError) {
      salary.emailDeliveryStatus = 'failed';
      salary.emailError = emailError.message;
    }
    await salary.save();

    res.json({ salary: serializeSalary(salary), pdfBytes: pdf.length });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resend-email', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const salary = await findSalaryRecordForAdmin(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found.' });
    }
    if (salary.approvalStatus !== 'approved') {
      return res.status(400).json({ error: 'Approve salary before sending email.' });
    }

    const pdf = buildPayslipPdf(salary);
    try {
      const result = await sendPayslipEmail({ salaryRecord: salary, pdfBuffer: pdf });
      salary.emailDeliveryStatus = result.status || 'sent';
      salary.emailSentAt = result.status === 'sent' ? new Date() : salary.emailSentAt;
      salary.emailError = result.message || '';
    } catch (emailError) {
      salary.emailDeliveryStatus = 'failed';
      salary.emailError = emailError.message;
    }
    await salary.save();

    res.json({ salary: serializeSalary(salary) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/payslip', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const salary = await findSalaryRecordForAdmin(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary record not found.' });
    }

    const pdf = buildPayslipPdf(salary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${getPayslipFilename(salary)}"`);
    return res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/audit-logs', requireAnyRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const logs = await SalaryAuditLog.find({ salary_record_id: req.params.id })
      .sort({ edited_at: -1 })
      .populate('edited_by', 'name email role');
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
