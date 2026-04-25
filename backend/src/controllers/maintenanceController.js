const MaintenanceService = require('../services/maintenanceService');

class MaintenanceController {
  // Get all maintenance event types for aircraft type
  static async getEventTypes(req, res) {
    try {
      const { aircraftTypeId } = req.params;
      const result = await MaintenanceService.getEventTypes(aircraftTypeId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching maintenance event types:', error);
      res.status(500).json({ error: 'Failed to fetch maintenance event types' });
    }
  }

  // Create maintenance event type
  static async createEventType(req, res) {
    try {
      const result = await MaintenanceService.createEventType(req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating maintenance event type:', error);
      res.status(500).json({ error: 'Failed to create maintenance event type' });
    }
  }

  // Update maintenance event type
  static async updateEventType(req, res) {
    try {
      const { id } = req.params;
      const result = await MaintenanceService.updateEventType(id, req.body);
      
      if (!result) {
        return res.status(404).json({ error: 'Event type not found' });
      }
      res.json(result);
    } catch (error) {
      console.error('Error updating maintenance event type:', error);
      res.status(500).json({ error: 'Failed to update maintenance event type' });
    }
  }

  // Delete maintenance event type
  static async deleteEventType(req, res) {
    try {
      const { id } = req.params;
      await MaintenanceService.deleteEventType(id);
      res.json({ message: 'Event type deleted successfully' });
    } catch (error) {
      console.error('Error deleting maintenance event type:', error);
      res.status(500).json({ error: 'Failed to delete maintenance event type' });
    }
  }

  // Get maintenance log for aircraft
  static async getMaintenanceLog(req, res) {
    try {
      const { fleetPlanId } = req.params;
      const result = await MaintenanceService.getMaintenanceLog(fleetPlanId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching maintenance log:', error);
      res.status(500).json({ error: 'Failed to fetch maintenance log' });
    }
  }

  // Schedule maintenance for aircraft
  static async scheduleMaintenance(req, res) {
    try {
      const { fleetPlanId } = req.params;
      const events = await MaintenanceService.scheduleMaintenance(fleetPlanId);
      
      res.status(201).json({
        message: 'Maintenance scheduled successfully',
        eventsScheduled: events.length,
        events
      });
    } catch (error) {
      console.error('Error scheduling maintenance:', error);
      res.status(500).json({ error: 'Failed to schedule maintenance' });
    }
  }

  // Update maintenance event status
  static async updateMaintenanceStatus(req, res) {
    try {
      const { id } = req.params;
      const result = await MaintenanceService.updateMaintenanceStatus(id, req.body);
      
      if (!result) {
        return res.status(404).json({ error: 'Maintenance event not found' });
      }
      res.json(result);
    } catch (error) {
      console.error('Error updating maintenance status:', error);
      res.status(500).json({ error: 'Failed to update maintenance status' });
    }
  }

  // Get upcoming maintenance for scenario
  static async getUpcomingMaintenance(req, res) {
    try {
      const { scenarioId } = req.params;
      const { days } = req.query;
      const result = await MaintenanceService.getUpcomingMaintenance(scenarioId, days);
      res.json(result);
    } catch (error) {
      console.error('Error fetching upcoming maintenance:', error);
      res.status(500).json({ error: 'Failed to fetch upcoming maintenance' });
    }
  }
  // Delete all maintenance event types
  static async deleteAllEventTypes(req, res) {
    try {
      await MaintenanceService.deleteAllEventTypes();
      res.json({ message: 'All event dictionaries cleared successfully' });
    } catch (error) {
      console.error('Error deleting all maintenance event types:', error);
      res.status(500).json({ error: 'Failed to clear maintenance event dictionaries' });
    }
  }
}

module.exports = MaintenanceController;
