const express = require('express');
const SalesOrder = require('../models/SalesOrder');
const { requireAuth } = require('../middleware/auth');
const { isSalesUser, requireSalesModuleAccess, requireOwner } = require('../middleware/access');
const { storeCompanyIdPhoto } = require('../utils/salesUpload');

const router = express.Router();

router.use(requireAuth, requireSalesModuleAccess);

router.get('/dashboard', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { created_by: req.user.email };
    const [totalOrders, pendingOrders, recentOrders] = await Promise.all([
      SalesOrder.countDocuments(filter),
      SalesOrder.countDocuments({ ...filter, order_status: 'Pending' }),
      SalesOrder.find(filter).sort({ created_at: -1, _id: -1 }).limit(5),
    ]);

    res.json({
      dashboard: {
        totalOrders,
        pendingOrders,
        completedOrders: Math.max(totalOrders - pendingOrders, 0),
        recentOrders,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    if (!isSalesUser(req.user)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const customer_name = String(req.body.customer_name || '').trim();
    const phone_number = String(req.body.phone_number || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const address = String(req.body.address || '').trim();

    if (!customer_name || !phone_number || !address) {
      return res.status(400).json({ error: 'Customer name, phone number, and address are required.' });
    }

    const company_id_photo = await storeCompanyIdPhoto(req.body.company_id_photo);

    const order = await SalesOrder.create({
      customer_name,
      phone_number,
      email,
      address,
      company_id_photo,
      order_status: 'Pending',
      created_by: req.user.email,
    });

    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/mine', async (req, res, next) => {
  try {
    if (!isSalesUser(req.user)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const orders = await SalesOrder.find({ created_by: req.user.email }).sort({ created_at: -1, _id: -1 });
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/all', requireOwner, async (req, res, next) => {
  try {
    const orders = await SalesOrder.find({}).sort({ created_at: -1, _id: -1 });
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
