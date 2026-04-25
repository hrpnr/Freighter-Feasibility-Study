const HolidaysService = require('../services/holidaysService');

class HolidaysController {
  static async getByScenario(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await HolidaysService.getByScenario(scenarioId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching holidays:', error);
      res.status(500).json({ error: 'Failed to fetch holidays' });
    }
  }

  static async getAllMaster(req, res) {
    try {
      const result = await HolidaysService.getAllMaster();
      res.json(result);
    } catch (error) {
      console.error('Error fetching master holidays:', error);
      res.status(500).json({ error: 'Failed' });
    }
  }

  static async createMaster(req, res) {
    try {
      const result = await HolidaysService.createMaster(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  }

  static async updateMaster(req, res) {
    try {
      const { id } = req.params;
      const result = await HolidaysService.updateMaster(id, req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  }

  static async deleteMaster(req, res) {
    try {
      await HolidaysService.deleteMaster(req.params.id);
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  }

  static async create(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await HolidaysService.create(scenarioId, req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating holiday:', error);
      res.status(500).json({ error: 'Failed to create holiday' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const result = await HolidaysService.update(id, req.body);
      if (!result) return res.status(404).json({ error: 'Holiday not found' });
      res.json(result);
    } catch (error) {
      console.error('Error updating holiday:', error);
      res.status(500).json({ error: 'Failed to update holiday' });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await HolidaysService.delete(id);
      res.json({ message: 'Holiday deleted successfully' });
    } catch (error) {
      console.error('Error deleting holiday:', error);
      res.status(500).json({ error: 'Failed to delete holiday' });
    }
  }

  static async bulkCreate(req, res) {
    try {
      const { scenarioId } = req.params;
      const { holidays } = req.body;
      const result = await HolidaysService.bulkCreate(scenarioId, holidays);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error bulk creating holidays:', error);
      res.status(500).json({ error: 'Failed to bulk create holidays' });
    }
  }
}

module.exports = HolidaysController;
