const AirportService = require('../services/airportService');

class AirportController {
  static async getAll(req, res) {
    try {
      const result = await AirportService.getAll();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch airports' });
    }
  }

  static async create(req, res) {
    try {
      const result = await AirportService.create(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Airport code already exists' });
      }
      res.status(500).json({ error: 'Failed to create airport' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const result = await AirportService.update(id, req.body);
      res.json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Airport code already exists' });
      }
      res.status(500).json({ error: 'Failed to update airport', details: error.message });
    }
  }

  static async delete(req, res) {
    try {
      await AirportService.delete(req.params.id);
      res.json({ message: 'Airport deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete airport' });
    }
  }
}

module.exports = AirportController;
