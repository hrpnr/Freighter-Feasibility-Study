const ScenarioService = require('../services/scenarioService');
const ExcelExportService = require('../services/excelExportService');

class ScenarioController {
  // Get all scenarios
  static async getAllScenarios(req, res) {
    try {
      const scenarios = await ScenarioService.getAllScenarios();
      res.json(scenarios);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      res.status(500).json({ error: 'Failed to fetch scenarios' });
    }
  }

  // Get scenario by ID
  static async getScenarioById(req, res) {
    try {
      const { id } = req.params;
      const scenario = await ScenarioService.getScenarioById(id);

      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      res.json(scenario);
    } catch (error) {
      console.error('Error fetching scenario:', error);
      res.status(500).json({ error: 'Failed to fetch scenario' });
    }
  }

  // Create new scenario
  static async createScenario(req, res) {
    try {
      const userId = req.user.id;
      const scenario = await ScenarioService.createScenario(req.body, userId);
      res.status(201).json(scenario);
    } catch (error) {
      console.error('Error creating scenario:', error);
      res.status(500).json({ error: 'Failed to create scenario' });
    }
  }

  // Update scenario
  static async updateScenario(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const scenario = await ScenarioService.updateScenario(id, req.body, userId);

      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      res.json(scenario);
    } catch (error) {
      console.error('Error updating scenario:', error);
      res.status(500).json({ error: 'Failed to update scenario' });
    }
  }

  // Delete scenario
  static async deleteScenario(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const result = await ScenarioService.deleteScenario(id, userId);

      if (!result) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      res.json({ message: 'Scenario deleted successfully' });
    } catch (error) {
      console.error('Error deleting scenario:', error);
      res.status(500).json({ error: 'Failed to delete scenario' });
    }
  }

  // Calculate scenario
  static async calculateScenario(req, res) {
    try {
      const { id } = req.params;
      const result = await ScenarioService.calculateScenario(id);
      res.json(result);
    } catch (error) {
      console.error('Error calculating scenario:', error);
      res.status(500).json({ error: 'Failed to calculate scenario', details: error.message });
    }
  }

  // Get monthly P&L
  static async getMonthlyPnL(req, res) {
    try {
      const { id } = req.params;
      const pnlData = await ScenarioService.getMonthlyPnL(id);
      res.json(pnlData);
    } catch (error) {
      console.error('Error fetching P&L:', error);
      res.status(500).json({ error: 'Failed to fetch P&L' });
    }
  }

  // Export to Excel
  static async exportToExcel(req, res) {
    try {
      const { id } = req.params;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=scenario_${id}_pnl.xlsx`);

      await ExcelExportService.exportMonthlyPnL(id, res);
      res.end();
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).json({ error: 'Failed to export to Excel' });
    }
  }

  // Get scenario parameters with master inheritance
  static async getParameters(req, res) {
    try {
      const { id } = req.params;
      const parameters = await ScenarioService.getParameters(id);
      res.json(parameters);
    } catch (error) {
      console.error('Error fetching parameters:', error);
      res.status(500).json({ error: 'Failed to fetch parameters' });
    }
  }

  // Get master parameters
  static async getMasterParameters(req, res) {
    try {
      const parameters = await ScenarioService.getMasterParameters();
      res.json(parameters);
    } catch (error) {
      console.error('Error fetching master parameters:', error);
      res.status(500).json({ error: 'Failed' });
    }
  }

  // Update master parameters
  static async updateMasterParameters(req, res) {
    try {
      const updated = await ScenarioService.updateMasterParameters(req.body);
      res.json(updated);
    } catch (error) {
      console.error('Error updating master parameters:', error);
      res.status(500).json({ error: 'Failed' });
    }
  }

  // Update scenario parameters
  static async updateParameters(req, res) {
    try {
      const { id } = req.params;
      const updated = await ScenarioService.updateParameters(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error('Error updating parameters:', error);
      res.status(500).json({ error: 'Failed to update parameters' });
    }
  }
}

module.exports = ScenarioController;
