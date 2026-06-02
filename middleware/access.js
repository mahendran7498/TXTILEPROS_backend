function normalizeDepartment(department) {
  return String(department || '').trim().toLowerCase();
}

function isOwner(user) {
  return user?.role === 'admin';
}

function isManager(user) {
  return user?.role === 'manager';
}

function isSalesDepartment(user) {
  return normalizeDepartment(user?.department) === 'sales';
}

function isServiceUser(user) {
  return user?.role === 'employee' && !isSalesDepartment(user);
}

function isSalesUser(user) {
  return user?.role === 'employee' && isSalesDepartment(user);
}

function isServiceManager(user) {
  return isManager(user) && !isSalesDepartment(user);
}

function isSalesManager(user) {
  return isManager(user) && isSalesDepartment(user);
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

function requireServiceManagementAccess(req, res, next) {
  if (isOwner(req.user) || isServiceManager(req.user)) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied' });
}

function requireSalesModuleAccess(req, res, next) {
  if (isOwner(req.user) || isSalesUser(req.user) || isSalesManager(req.user)) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied' });
}

function requireSalesManagementAccess(req, res, next) {
  if (isOwner(req.user) || isSalesManager(req.user)) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied' });
}

module.exports = {
  isOwner,
  isManager,
  isSalesDepartment,
  isServiceUser,
  isSalesUser,
  isServiceManager,
  isSalesManager,
  requireOwner,
  requireServiceModuleAccess,
  requireServiceManagementAccess,
  requireSalesModuleAccess,
  requireSalesManagementAccess,
};
