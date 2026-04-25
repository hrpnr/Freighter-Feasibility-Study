const AirportFeesService = require('../services/airportFeesService');

class AirportFeesController {
    static async getByScenario(req, res) {
        try {
            const { scenarioId } = req.params;
            const result = await AirportFeesService.getByScenario(scenarioId);
            res.json(result);
        } catch (error) {
            console.error('Error fetching scenario airport fees:', error);
            res.status(500).json({ error: 'Failed to fetch scenario airport fees' });
        }
    }

    static async upsertScenarioOverride(req, res) {
        try {
            const { scenarioId } = req.params;
            const result = await AirportFeesService.upsertScenarioOverride(scenarioId, req.body);
            res.json(result);
        } catch (error) {
            console.error('Error upserting scenario fee override:', error);
            res.status(500).json({ error: 'Failed to save fee override' });
        }
    }

    static async deleteScenarioOverride(req, res) {
        try {
            const { id } = req.params; // override id
            await AirportFeesService.deleteScenarioOverride(id);
            res.json({ message: 'Override removed' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete fee override' });
        }
    }
}

module.exports = AirportFeesController;
