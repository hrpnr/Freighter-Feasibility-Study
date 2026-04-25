const CrewService = require('../services/crewService');

class CrewController {
  static async getByScenario(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await CrewService.getByScenario(scenarioId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching crew by scenario:', error);
      res.status(500).json({ error: 'Failed to fetch crew members' });
    }
  }

  static async getAll(req, res) {
    try {
      const result = await CrewService.getAll();
      res.json(result);
    } catch (error) {
      console.error('Error fetching crew:', error);
      res.status(500).json({ error: 'Failed to fetch crew members' });
    }
  }

  static async create(req, res) {
    try {
      const result = await CrewService.create(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Employee ID already exists in this scenario' });
      }
      if (error.code === '22P02') {
        return res.status(400).json({ error: 'Invalid Scenario selection' });
      }
      console.error('Error creating crew member:', error);
      res.status(500).json({ error: 'Failed to create crew member' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const result = await CrewService.update(id, req.body);

      if (!result) {
        return res.status(404).json({ error: 'Crew member not found' });
      }

      res.json(result);
    } catch (error) {
      console.error('Error updating crew member:', error);
      res.status(500).json({ error: 'Failed to update crew member' });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await CrewService.delete(id);
      res.json({ message: 'Crew member deleted successfully' });
    } catch (error) {
      console.error('Error deleting crew member:', error);
      res.status(500).json({ error: 'Failed to delete crew member' });
    }
  }

  static async bulkCreate(req, res) {
    try {
      const { crew } = req.body;
      const results = await CrewService.bulkCreate(crew);
      res.status(201).json(results);
    } catch (error) {
      console.error('Error bulk creating crew:', error);
      res.status(500).json({ error: 'Failed to bulk create crew' });
    }
  }

  static async getCrewCost(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await CrewService.getCrewCost(scenarioId);
      res.json(result);
    } catch (error) {
      console.error('Error calculating crew cost:', error);
      res.status(500).json({ error: 'Failed to calculate crew cost' });
    }
  }
}

module.exports = CrewController;
