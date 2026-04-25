const MonteCarloService = require('../services/monteCarloService');

class MonteCarloController {
  /**
   * Run Monte Carlo simulation
   */
  static async runSimulation(req, res) {
    try {
      const { id } = req.params;
      const config = req.body;

      // Validate iterations
      if (config.iterations && (config.iterations < 100 || config.iterations > 10000)) {
        return res.status(400).json({ 
          error: 'Iterations must be between 100 and 10,000' 
        });
      }

      console.log(`Starting Monte Carlo simulation for scenario ${id}`);
      
      const results = await MonteCarloService.runSimulation(id, config);

      res.json({
        message: 'Simulation completed successfully',
        ...results
      });

    } catch (error) {
      console.error('Error running Monte Carlo simulation:', error);
      res.status(500).json({ 
        error: 'Failed to run simulation',
        details: error.message 
      });
    }
  }

  /**
   * Get histogram data for a metric
   */
  static async getHistogram(req, res) {
    try {
      const { id } = req.params;
      const { metric = 'npv', bins = 50 } = req.query;
      const config = req.body;

      const results = await MonteCarloService.runSimulation(id, {
        ...config,
        iterations: config.iterations || 1000
      });

      const histogram = MonteCarloService.generateHistogram(
        results.results,
        metric,
        parseInt(bins)
      );

      res.json({
        metric,
        bins: histogram.length,
        data: histogram,
        statistics: results.statistics[metric]
      });

    } catch (error) {
      console.error('Error generating histogram:', error);
      res.status(500).json({ 
        error: 'Failed to generate histogram',
        details: error.message 
      });
    }
  }

  /**
   * Get risk analysis
   */
  static async getRiskAnalysis(req, res) {
    try {
      const { id } = req.params;
      const config = req.body;

      const results = await MonteCarloService.runSimulation(id, {
        ...config,
        iterations: config.iterations || 1000,
        confidenceLevel: config.confidenceLevel || 0.95
      });

      res.json({
        riskMetrics: results.riskMetrics,
        statistics: results.statistics,
        confidenceLevel: results.confidenceLevel
      });

    } catch (error) {
      console.error('Error performing risk analysis:', error);
      res.status(500).json({ 
        error: 'Failed to perform risk analysis',
        details: error.message 
      });
    }
  }

  /**
   * Get probability distribution
   */
  static async getProbabilityDistribution(req, res) {
    try {
      const { id } = req.params;
      const { metric = 'npv' } = req.query;
      const config = req.body;

      const results = await MonteCarloService.runSimulation(id, {
        ...config,
        iterations: config.iterations || 1000
      });

      // Get cumulative distribution
      const values = results.results.map(r => r[metric]).sort((a, b) => a - b);
      const cdf = values.map((value, index) => ({
        value,
        probability: (index + 1) / values.length
      }));

      res.json({
        metric,
        cdf,
        statistics: results.statistics[metric],
        riskMetrics: results.riskMetrics[metric]
      });

    } catch (error) {
      console.error('Error generating probability distribution:', error);
      res.status(500).json({ 
        error: 'Failed to generate probability distribution',
        details: error.message 
      });
    }
  }
}

module.exports = MonteCarloController;
