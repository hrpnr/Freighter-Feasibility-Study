const PricingService = require('../services/pricingService');

class PricingController {
  static async getByScenario(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await PricingService.getByScenario(scenarioId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching pricing:', error);
      res.status(500).json({ error: 'Failed to fetch pricing' });
    }
  }

  // Master Pricing Methods
  static async getAllMaster(req, res) {
    try {
      const result = await PricingService.getAllMaster();
      res.json(result);
    } catch (error) {
      console.error('CRITICAL: Master Pricing Fetch Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch master pricing',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  static async createMaster(req, res) {
    try {
      const { origin_id, destination_id, fare_usd } = req.body;

      if (!origin_id || !destination_id || isNaN(fare_usd)) {
        return res.status(400).json({ error: 'Origin, Destination and Fare are required' });
      }

      const result = await PricingService.createMaster(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Master price already exists for this city-pair and segment' });
      }
      console.error('Error creating master pricing:', error);
      res.status(500).json({ error: 'Failed to create master pricing' });
    }
  }

  static async updateMaster(req, res) {
    try {
      const { id } = req.params;
      const { fare_usd } = req.body;

      if (isNaN(fare_usd)) {
        return res.status(400).json({ error: 'Fare must be a valid number' });
      }

      const result = await PricingService.updateMaster(id, req.body);

      if (!result) {
        return res.status(404).json({ error: 'Master pricing not found' });
      }

      res.json(result);
    } catch (error) {
      console.error('Error updating master pricing:', error);
      res.status(500).json({ error: 'Failed to update master pricing' });
    }
  }

  static async deleteMaster(req, res) {
    try {
      const { id } = req.params;
      await PricingService.deleteMaster(id);
      res.json({ message: 'Master pricing deleted successfully' });
    } catch (error) {
      console.error('Error deleting master pricing:', error);
      res.status(500).json({ error: 'Failed to delete master pricing' });
    }
  }

  static async deleteAllMaster(req, res) {
    try {
      await PricingService.deleteAllMaster();
      res.json({ message: 'All master pricing deleted successfully' });
    } catch (error) {
      console.error('Error deleting all master pricing:', error);
      res.status(500).json({ error: 'Failed to delete all master pricing' });
    }
  }

  // Scenario-specific methods
  static async create(req, res) {
    try {
      const { scenarioId } = req.params;
      const { origin_id, destination_id, fare_usd } = req.body;

      if (!origin_id || !destination_id || isNaN(fare_usd)) {
        return res.status(400).json({ error: 'Origin, Destination and Fare are required' });
      }

      if (origin_id === destination_id) {
        return res.status(400).json({ error: 'Origin and Destination must be different' });
      }

      const result = await PricingService.create(scenarioId, req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Price already exists for this city-pair and segment in this scenario' });
      }
      console.error('Error creating pricing:', error);
      res.status(500).json({ error: 'Failed to create pricing' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { fare_usd } = req.body;

      if (isNaN(fare_usd)) {
        return res.status(400).json({ error: 'Fare must be a valid number' });
      }

      const result = await PricingService.update(id, req.body);

      if (!result) {
        return res.status(404).json({ error: 'Pricing not found' });
      }

      res.json(result);
    } catch (error) {
      console.error('Error updating pricing:', error);
      res.status(500).json({ error: 'Failed to update pricing' });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await PricingService.delete(id);
      res.json({ message: 'Pricing deleted successfully' });
    } catch (error) {
      console.error('Error deleting pricing:', error);
      res.status(500).json({ error: 'Failed to delete pricing' });
    }
  }

  static async bulkCreate(req, res) {
    try {
      const { scenarioId } = req.params;
      const { items } = req.body;

      const results = await PricingService.bulkCreate(scenarioId, items);
      res.status(201).json(results);
    } catch (error) {
      console.error('Error bulk creating pricing:', error);
      res.status(500).json({ error: 'Failed to bulk create pricing' });
    }
  }
}

module.exports = PricingController;
