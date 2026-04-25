const FleetService = require('../services/fleetService');

class FleetController {
  static async getFleetPlans(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await FleetService.getFleetPlans(scenarioId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching fleet plans:', error);
      res.status(500).json({ error: 'Failed to fetch fleet plans' });
    }
  }

  static async createFleetPlan(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await FleetService.createFleetPlan(scenarioId, req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating fleet plan:', error);
      res.status(500).json({ error: 'Failed to create fleet plan' });
    }
  }

  static async updateFleetPlan(req, res) {
    try {
      const { id } = req.params;
      const result = await FleetService.updateFleetPlan(id, req.body);
      res.json(result);
    } catch (error) {
      console.error('Error updating fleet plan:', error);
      res.status(500).json({ error: 'Failed to update fleet plan' });
    }
  }

  static async deleteFleetPlan(req, res) {
    try {
      const { id } = req.params;
      await FleetService.deleteFleetPlan(id);
      res.json({ message: 'Fleet plan deleted successfully' });
    } catch (error) {
      console.error('Error deleting fleet plan:', error);
      res.status(500).json({ error: 'Failed to delete fleet plan' });
    }
  }

  // Set initial maintenance baselines (Last Done)
  static async setInitialMaintenance(req, res) {
    try {
      const { id } = req.params; // fleet_plan_id
      const { baselines } = req.body; 
      
      await FleetService.setInitialMaintenance(id, baselines);
      res.json({ message: 'Baselines updated successfully' });
    } catch (error) {
      console.error('Error setting initial maintenance:', error);
      res.status(500).json({ error: 'Failed to set initial maintenance' });
    }
  }

  // Get initial maintenance baselines
  static async getInitialMaintenance(req, res) {
    try {
      const { id } = req.params;
      const result = await FleetService.getInitialMaintenance(id);
      res.json(result);
    } catch (error) {
      console.error('Error fetching initial maintenance:', error);
      res.status(500).json({ error: 'Failed to fetch initial maintenance' });
    }
  }
}

module.exports = FleetController;
