const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../auth/middleware/permissions');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../../auth/middleware/permissions');
const Role = require('./role.model');
const Permission = require('./permission.model');

// Get all permissions
router.get('/permissions', requireAdmin, async (req, res) => {
  try {
    const permissions = await Permission.findAll({
      where: { isActive: true },
      order: [['module', 'ASC'], ['resource', 'ASC'], ['action', 'ASC']]
    });
    
    res.json({ permissions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch permissions', details: error.message });
  }
});

// Get all roles
router.get('/roles', requireAdmin, async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']]
    });
    
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch roles', details: error.message });
  }
});

// Create role
router.post('/roles', requireAdmin, async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    
    const role = await Role.create({
      name,
      description,
      permissions,
      isSystemRole: false
    });
    
    res.status(201).json(role);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create role', details: error.message });
  }
});

// Update role
router.put('/roles/:id', requireAdmin, async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    if (role.isSystemRole) {
      return res.status(403).json({ 
        error: 'Cannot modify system role',
        message: 'System roles are protected and cannot be modified.'
      });
    }
    
    await role.update(req.body);
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update role', details: error.message });
  }
});

// Delete role
router.delete('/roles/:id', requireAdmin, async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    if (role.isSystemRole) {
      return res.status(403).json({ 
        error: 'Cannot delete system role',
        message: 'System roles are protected and cannot be deleted.'
      });
    }
    
    await role.destroy();
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete role', details: error.message });
  }
});

// Get permission matrix
router.get('/permission-matrix', requireAdmin, (req, res) => {
  res.json({
    permissions: PERMISSIONS,
    rolePermissions: ROLE_PERMISSIONS
  });
});

module.exports = router;
