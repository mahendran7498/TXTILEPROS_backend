const User = require('../models/User');
const { hashPassword } = require('./auth');

async function ensureDefaultUsers() {
  const count = await User.countDocuments();
  if (count > 0) {
    return;
  }

  const defaultUsers = [
    {
      name: process.env.DEFAULT_ADMIN_NAME || 'System Admin',
      email: (process.env.DEFAULT_ADMIN_EMAIL || 'admin@txtilpros.local').toLowerCase(),
      passwordHash: hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123'),
      role: 'admin',
      department: 'Operations',
      employeeCode: 'ADM-001',
    },
    {
      name: process.env.DEFAULT_EMPLOYEE_NAME || 'Field Engineer',
      email: (process.env.DEFAULT_EMPLOYEE_EMAIL || 'employee@txtilpros.local').toLowerCase(),
      passwordHash: hashPassword(process.env.DEFAULT_EMPLOYEE_PASSWORD || 'Employee@123'),
      role: 'employee',
      department: 'Service',
      employeeCode: 'EMP-001',
    },
  ];

  await User.insertMany(defaultUsers);
  console.log('Seeded default admin and employee accounts.');
}

module.exports = {
  ensureDefaultUsers,
};
