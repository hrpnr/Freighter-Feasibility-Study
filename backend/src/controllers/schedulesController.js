const SchedulesService = require('../services/schedulesService');

class SchedulesController {
  static async getByScenario(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await SchedulesService.getByScenario(scenarioId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      res.status(500).json({ error: 'Failed to fetch schedules' });
    }
  }

  static async create(req, res) {
    try {
      const { scenarioId } = req.params;
      const result = await SchedulesService.create(scenarioId, req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating schedule:', error);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const result = await SchedulesService.update(id, req.body);
      if (!result) return res.status(404).json({ error: 'Schedule not found' });
      res.json(result);
    } catch (error) {
      console.error('Error updating schedule:', error);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  }

  static async updateRotation(req, res) {
    try {
      const { rotationGroupId } = req.params;
      await SchedulesService.updateRotation(rotationGroupId, req.body);
      res.json({ message: 'Rotation segments updated successfully' });
    } catch (error) {
      console.error('Error updating rotation:', error);
      res.status(500).json({ error: 'Failed to update rotation' });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await SchedulesService.delete(id);
      res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
      console.error('Error deleting schedule:', error);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  }

  static async deleteRotation(req, res) {
    try {
      const { rotationGroupId } = req.params;
      await SchedulesService.deleteRotation(rotationGroupId);
      res.json({ message: 'Whole rotation deleted successfully' });
    } catch (error) {
      console.error('Error deleting rotation:', error);
      res.status(500).json({ error: 'Failed to delete rotation' });
    }
  }

  static async bulkCreateRotation(req, res) {
    try {
      const { scenarioId } = req.params;
      const { segments } = req.body;
      if (!Array.isArray(segments) || segments.length === 0) {
        return res.status(400).json({ error: 'Segments array is required' });
      }
      const result = await SchedulesService.bulkCreateRotation(scenarioId, segments);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error in bulkCreateRotation:', error);
      res.status(500).json({ error: 'Failed to create bulk rotation' });
    }
  }

  static async deleteAll(req, res) {
    try {
      const { scenarioId } = req.params;
      await SchedulesService.deleteAll(scenarioId);
      res.json({ message: 'All schedules deleted successfully' });
    } catch (error) {
      console.error('Error deleting all schedules:', error);
      res.status(500).json({ error: 'Failed to delete all schedules' });
    }
  }

  static async deleteWeek(req, res) {
    try {
      const { id } = req.params;
      const { dayField } = req.body;
      const result = await SchedulesService.deleteWeek(id, dayField);
      if (!result) return res.status(404).json({ error: 'Schedule not found' });
      res.json({ message: result.deleted ? 'Schedule deleted' : `Cleared ${dayField}` });
    } catch (error) {
      console.error('Error deleting week schedule:', error);
      res.status(500).json({ error: 'Failed to delete week schedule' });
    }
  }

  static async deleteMonth(req, res) {
    try {
      const { id } = req.params;
      const { asOfDate } = req.body;
      if (!asOfDate) return res.status(400).json({ error: 'asOfDate is required' });
      const result = await SchedulesService.deleteMonth(id, new Date(asOfDate));
      if (!result) return res.status(404).json({ error: 'Schedule not found' });
      res.json({ message: `Action taken: ${result.action}` });
    } catch (error) {
      console.error('Error deleting month schedule:', error);
      res.status(500).json({ error: 'Failed to delete month schedule' });
    }
  }
}

module.exports = SchedulesController;
