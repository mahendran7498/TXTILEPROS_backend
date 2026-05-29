function normalizeDepartment(department) {
  return String(department || '').trim().toLowerCase();
}

function isOwner(user) {
  return user?.role === 'admin';
}

function isServiceUser(user) {
  return user?.role === 'employee' && normalizeDepartment(user?.department) !== 'sales';
}

function isSalesUser(user) {
  return user?.role === 'sales' || (user?.role === 'employee' && normalizeDepartment(user?.department) === 'sales');
}

function requireOwner(req, res, next) {
  if (!isOwner(req.user)) {
    return res.status(403).json({ error: 'Access Denied' });
  }
  return next();
}

function requireServiceModuleAccess(req, res, next) {
  if (isOwner(req.user) || isServiceUser(req.user)) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied' });
}

function requireSalesModuleAccess(req, res, next) {
  if (isOwner(req.user) || isSalesUser(req.user)) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied' });
}

module.exports = {
  isOwner,
  isServiceUser,
  isSalesUser,
  requireOwner,
  requireServiceModuleAccess,
  requireSalesModuleAccess,
};
