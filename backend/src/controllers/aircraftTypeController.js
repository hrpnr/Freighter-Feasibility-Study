const AircraftTypeService = require('../services/aircraftTypeService');

class AircraftTypeController {
  static async getAll(req, res) {
    try {
      const result = await AircraftTypeService.getAll();
      res.json(result);
    } catch (error) {
      console.error('Error fetching aircraft types:', error);
      res.status(500).json({ error: 'Failed to fetch aircraft types' });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const result = await AircraftTypeService.getById(id);

      if (!result) {
        return res.status(404).json({ error: 'Aircraft type not found' });
      }

      res.json(result);
    } catch (error) {
      console.error('Error fetching aircraft type:', error);
      res.status(500).json({ error: 'Failed to fetch aircraft type' });
    }
  }

  static async create(req, res) {
    try {
      const result = await AircraftTypeService.create(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Aircraft type code already exists' });
      }
      console.error('Error creating aircraft type:', error);
      res.status(500).json({ error: 'Failed to create aircraft type' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const result = await AircraftTypeService.update(id, req.body);
      res.json(result);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Aircraft type code already exists' });
      }
      console.error('Error updating aircraft type:', error);
      res.status(500).json({ error: 'Failed to update aircraft type' });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await AircraftTypeService.delete(id);
      res.json({ message: 'Aircraft type deleted successfully' });
    } catch (error) {
      console.error('Error deleting aircraft type:', error);
      res.status(500).json({ error: 'Failed to delete aircraft type' });
    }
  }
}

module.exports = AircraftTypeController;
