const pool = require('../database/pool');
const PnLCalculator = require('../calculations/pnlCalculator');

class CashFlowService {
  /**
   * Get cash flow projection for scenario
   */
  static async getCashFlowProjection(id, initialInvestment = 0) {
    try {

      // Get monthly P&L
      const pnlResult = await pool.query(
        `SELECT * FROM monthly_pnl
         WHERE scenario_id = $1
         ORDER BY month_date`,
        [id]
      );

      if (pnlResult.rows.length === 0) {
        throw new Error('No P&L data found. Please run calculation first.');
      }

      // Generate cash flow projection
      const cashFlow = PnLCalculator.generateCashFlowProjection(
        pnlResult.rows,
        parseFloat(initialInvestment)
      );

      // Get scenario parameters for NPV calculation
      const paramsResult = await pool.query(
        'SELECT cost_of_capital FROM scenario_parameters WHERE scenario_id = $1',
        [id]
      );

      const costOfCapital = paramsResult.rows[0]?.cost_of_capital || 0.04;

      // Calculate NPV
      const npv = PnLCalculator.calculateNPV(cashFlow.monthlyCashFlows, costOfCapital);

      // Calculate IRR
      const irr = PnLCalculator.calculateIRR(cashFlow.allCashFlows);

      // Calculate payback period
      const paybackPeriod = PnLCalculator.calculatePaybackPeriod(cashFlow.cumulativeCashFlows);

      return {
        initialInvestment: parseFloat(initialInvestment),
        monthlyCashFlows: cashFlow.monthlyCashFlows,
        cumulativeCashFlows: cashFlow.cumulativeCashFlows,
        financialMetrics: {
          npv,
          irr: irr ? Math.round(irr * 10000) / 100 : null, // Convert to percentage
          paybackPeriod,
          totalCashFlow: cashFlow.cumulativeCashFlows[cashFlow.cumulativeCashFlows.length - 1]
        }
      };
    } catch (error) {
      console.error('Error getting cash flow projection:', error);
      throw new Error('Failed to get cash flow projection');
    }
  }

  /**
   * Get break-even analysis
   */
  static async getBreakEvenAnalysis(id, month) {
    try {

      let query = `SELECT * FROM monthly_pnl WHERE scenario_id = $1`;
      const params = [id];

      if (month) {
        query += ` AND month_date = $2`;
        params.push(month);
      } else {
        query += ` ORDER BY month_date DESC LIMIT 1`;
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('No P&L data found');
      }

      const pnl = result.rows[0];

      // Calculate break-even metrics
      const breakEven = PnLCalculator.calculateBreakEven({
        totalCost: pnl.total_cost_usd,
        totalRevenue: pnl.total_revenue_usd,
        blockHours: pnl.block_hours,
        currentLoadFactor: 1
      });

      return {
        month: pnl.month_date,
        currentMetrics: {
          revenue: pnl.total_revenue_usd,
          cost: pnl.total_cost_usd,
          profit: pnl.profit_loss_usd,
          blockHours: pnl.block_hours,
          flightCycles: pnl.flight_cycles
        },
        breakEven: {
          loadFactor: breakEven.breakEvenLoadFactor,
          blockHours: breakEven.breakEvenBlockHours,
          costPerBlockHour: breakEven.costPerBlockHour
        }
      };
    } catch (error) {
      console.error('Error getting break-even analysis:', error);
      throw new Error('Failed to get break-even analysis');
    }
  }

  /**
   * Get financial metrics summary
   */
  static async getFinancialMetrics(id) {
    try {

      // Get all P&L data
      const pnlResult = await pool.query(
        `SELECT * FROM monthly_pnl
         WHERE scenario_id = $1
         ORDER BY month_date`,
        [id]
      );

      if (pnlResult.rows.length === 0) {
        throw new Error('No P&L data found');
      }

      const pnls = pnlResult.rows;

      // Get scenario parameters
      const paramsResult = await pool.query(
        'SELECT cost_of_capital FROM scenario_parameters WHERE scenario_id = $1',
        [id]
      );

      const costOfCapital = paramsResult.rows[0]?.cost_of_capital || 0.04;

      // Calculate financial metrics
      const cashFlows = pnls.map(p => p.profit_loss_usd);
      const npv = PnLCalculator.calculateNPV(cashFlows, costOfCapital);
      const irr = PnLCalculator.calculateIRR([0, ...cashFlows]);
      const paybackPeriod = PnLCalculator.calculatePaybackPeriod(
        pnls.map(p => p.cumulative_profit_loss_usd)
      );

      // Calculate summary stats
      const totalRevenue = pnls.reduce((sum, p) => sum + parseFloat(p.total_revenue_usd), 0);
      const totalCost = pnls.reduce((sum, p) => sum + parseFloat(p.total_cost_usd), 0);
      const totalProfit = pnls.reduce((sum, p) => sum + parseFloat(p.profit_loss_usd), 0);
      const avgMonthlyProfit = totalProfit / pnls.length;
      const profitableMonths = pnls.filter(p => p.profit_loss_usd > 0).length;

      return {
        period: {
          startMonth: pnls[0].month_date,
          endMonth: pnls[pnls.length - 1].month_date,
          totalMonths: pnls.length
        },
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
          avgMonthlyProfit: Math.round(avgMonthlyProfit * 100) / 100,
          profitableMonths,
          profitMarginAvg: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0
        },
        financialMetrics: {
          npv: Math.round(npv * 100) / 100,
          irr: irr ? Math.round(irr * 10000) / 100 : null,
          paybackPeriod,
          costOfCapital: Math.round(costOfCapital * 10000) / 100
        }
      };
    } catch (error) {
      console.error('Error getting financial metrics:', error);
      throw new Error('Failed to get financial metrics');
    }
  }
}

module.exports = CashFlowService;
