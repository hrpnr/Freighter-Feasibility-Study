const DailyPnLService = require('../services/dailyPnLService');

class DailyPnLController {
  static async getDailyPnL(req, res) {
    try {
      const { id } = req.params;
      const result = await DailyPnLService.getDailyPnL(id);
      res.json(result);
    } catch (error) {
      console.error('Error fetching daily P&L:', error);
      res.status(error.message === 'Scenario not found' ? 404 : 500).json({ error: error.message || 'Failed to fetch daily P&L data' });
    }
  }

  static async getDailyAnalysis(req, res) {
    try {
      const { id } = req.params;
      const { date } = req.query;
      const result = await DailyPnLService.getDailyAnalysis(id, date);
      res.json(result);
    } catch (error) {
      console.error('Error in daily analysis:', error);
      res.status(error.message === 'Scenario not found' ? 404 : 400).json({ error: error.message || 'Failed to analyze flight costs' });
    }
  }
}

module.exports = DailyPnLController;
