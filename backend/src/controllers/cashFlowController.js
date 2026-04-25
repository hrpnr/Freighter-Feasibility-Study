const CashFlowService = require('../services/cashFlowService');

class CashFlowController {
  static async getCashFlowProjection(req, res) {
    try {
      const { id } = req.params;
      const { initialInvestment = 0 } = req.query;
      const result = await CashFlowService.getCashFlowProjection(id, initialInvestment);
      res.json(result);
    } catch (error) {
      console.error('Error getting cash flow projection:', error);
      res.status(error.message.includes('No P&L data found') ? 404 : 500).json({ error: error.message || 'Failed to get cash flow projection' });
    }
  }

  static async getBreakEvenAnalysis(req, res) {
    try {
      const { id } = req.params;
      const { month } = req.query;
      const result = await CashFlowService.getBreakEvenAnalysis(id, month);
      res.json(result);
    } catch (error) {
      console.error('Error getting break-even analysis:', error);
      res.status(error.message === 'No P&L data found' ? 404 : 500).json({ error: error.message || 'Failed to get break-even analysis' });
    }
  }

  static async getFinancialMetrics(req, res) {
    try {
      const { id } = req.params;
      const result = await CashFlowService.getFinancialMetrics(id);
      res.json(result);
    } catch (error) {
      console.error('Error getting financial metrics:', error);
      res.status(error.message === 'No P&L data found' ? 404 : 500).json({ error: error.message || 'Failed to get financial metrics' });
    }
  }
}

module.exports = CashFlowController;
