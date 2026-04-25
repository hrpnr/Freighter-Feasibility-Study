const RevenueCalculator = require('./revenueCalculator');
const CostCalculator = require('./costCalculator');

class PnLCalculator {
  /**
   * Calculate monthly P&L
   * @param {Object} inputs - All required inputs
   * @returns {Object} Monthly P&L with detailed breakdown
   */
  static calculateMonthlyPnL(inputs) {
    const {
      monthDate,
      numberOfAircraft,
      blockHours,
      flightCycles,
      revenue,
      costInputs
    } = inputs;

    // Calculate all costs
    const costs = CostCalculator.calculateTotalMonthlyCosts(costInputs);

    // Calculate P&L metrics
    const rev = isNaN(revenue) || revenue === null ? 0 : revenue;
    const profitLoss = rev - costs.totalCost;
    const profitMargin = rev > 0 ? profitLoss / rev : 0;
    const bHours = isNaN(blockHours) || blockHours === null ? 0 : blockHours;
    const costPerBH = CostCalculator.calculateCostPerBlockHour(costs.totalCost, bHours);

    return {
      monthDate,
      numberOfAircraft,
      blockHours: Math.round(blockHours * 10) / 10,
      flightCycles,

      // Revenue
      totalRevenue: Math.round(rev * 100) / 100,

      // Cost breakdown
      leaseCost: costs.leaseCost,
      eisCost: costs.eisCost,
      redelCost: costs.redelCost,
      insuranceCost: costs.insuranceCost,
      maintenanceCost: costs.maintenanceCost,
      groundHandlingCost: costs.groundHandlingCost,
      fuelCost: costs.fuelCost,
      landingFee: costs.landingFee,
      parkingFee: costs.parkingFee,
      navigationFee: costs.navigationFee,
      routeCharge: costs.routeCharge,
      crewExpense: costs.crewExpense,
      crewFlightAllowance: costs.crewFlightAllowance,
      crewHOTAC: costs.crewHOTAC,
      overheadCost: costs.overheadCost,

      // Totals
      totalCost: costs.totalCost,
      profitLoss: Math.round(profitLoss * 100) / 100,
      profitMargin: Math.round(profitMargin * 10000) / 10000,
      costPerBH: costPerBH
    };
  }

  /**
   * Calculate cumulative P&L over multiple months
   * @param {Array} monthlyPnLs - Array of monthly P&L objects
   * @returns {Array} Monthly P&Ls with cumulative profit/loss
   */
  static calculateCumulativePnL(monthlyPnLs) {
    if (!monthlyPnLs || monthlyPnLs.length === 0) {
      return [];
    }

    let cumulativeProfitLoss = 0;

    return monthlyPnLs.map(pnl => {
      cumulativeProfitLoss += parseFloat(pnl.profitLoss || 0);

      return {
        ...pnl,
        cumulativeProfitLoss: Math.round(cumulativeProfitLoss * 100) / 100
      };
    });
  }

  /**
   * Calculate NPV (Net Present Value)
   * @param {Array} cashFlows - Array of monthly cash flows
   * @param {number} discountRate - Annual discount rate (cost of capital)
   * @returns {number} NPV in USD
   */
  static calculateNPV(cashFlows, discountRate) {
    if (!cashFlows || cashFlows.length === 0 || isNaN(discountRate)) {
      return 0;
    }

    const monthlyRate = discountRate / 12;

    const npv = cashFlows.reduce((sum, cashFlow, index) => {
      const val = isNaN(cashFlow) ? 0 : cashFlow;
      const discountedValue = val / Math.pow(1 + monthlyRate, index + 1);
      return sum + discountedValue;
    }, 0);

    return Math.round(npv * 100) / 100;
  }

  /**
   * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
   * @param {Array} cashFlows - Array of cash flows (first element is initial investment, negative)
   * @param {number} guess - Initial guess for IRR (default 0.1)
   * @param {number} tolerance - Tolerance for convergence (default 0.0001)
   * @param {number} maxIterations - Maximum iterations (default 100)
   * @returns {number} IRR as decimal (e.g., 0.15 = 15%)
   */
  static calculateIRR(cashFlows, guess = 0.1, tolerance = 0.0001, maxIterations = 100) {
    if (!cashFlows || cashFlows.length < 2) {
      return null;
    }

    let rate = guess;

    for (let i = 0; i < maxIterations; i++) {
      // Calculate NPV at current rate
      const npv = cashFlows.reduce((sum, cf, t) => {
        return sum + cf / Math.pow(1 + rate, t);
      }, 0);

      // Calculate derivative of NPV
      const dnpv = cashFlows.reduce((sum, cf, t) => {
        return sum - (t * cf) / Math.pow(1 + rate, t + 1);
      }, 0);

      // Newton-Raphson update
      let newRate = rate - npv / dnpv;

      // Prevent rate from jumping to infinity or below -1
      if (newRate > 100) newRate = 100; // Cap at 10,000% monthly
      if (newRate < -0.99) newRate = -0.99; // Minimum -99%

      if (Math.abs(newRate - rate) < tolerance) {
        return Math.round(newRate * 10000) / 10000;
      }

      rate = newRate;
    }

    return null; // Did not converge
  }

  /**
   * Calculate payback period in months
   * @param {Array} cumulativeCashFlows - Array of cumulative cash flows
   * @returns {number} Payback period in months, or null if not achieved
   */
  static calculatePaybackPeriod(cumulativeCashFlows) {
    if (!cumulativeCashFlows || cumulativeCashFlows.length === 0) {
      return null;
    }

    // Find the first month where cumulative cash flow becomes positive
    for (let i = 0; i < cumulativeCashFlows.length; i++) {
      if (cumulativeCashFlows[i] >= 0) {
        // Interpolate for more accurate payback period
        if (i === 0) {
          return 0;
        }

        const prevCF = cumulativeCashFlows[i - 1];
        const currCF = cumulativeCashFlows[i];
        const fraction = Math.abs(prevCF) / (currCF - prevCF);

        return Math.round((i + fraction) * 10) / 10;
      }
    }

    return null; // Payback not achieved within the period
  }

  /**
   * Calculate break-even analysis
   * @param {Object} inputs - Inputs for break-even calculation
   * @returns {Object} Break-even metrics
   */
  static calculateBreakEven(inputs) {
    const {
      totalCost,
      totalRevenue,
      blockHours,
      currentLoadFactor = 1
    } = inputs;

    // Break-even load factor
    const breakEvenLoadFactor = RevenueCalculator.calculateBreakEvenLoadFactor(
      totalCost,
      totalRevenue,
      currentLoadFactor
    );

    // Break-even block hours
    const costPerBH = CostCalculator.calculateCostPerBlockHour(totalCost, blockHours);
    const breakEvenBH = CostCalculator.calculateBreakEvenBlockHours(totalCost, totalRevenue, blockHours);

    return {
      breakEvenLoadFactor: breakEvenLoadFactor ? Math.round(breakEvenLoadFactor * 10000) / 10000 : null,
      breakEvenBlockHours: Math.round(breakEvenBH * 10) / 10,
      costPerBlockHour: Math.round(costPerBH * 100) / 100
    };
  }

  /**
   * Generate cash flow projection
   * @param {Array} monthlyPnLs - Array of monthly P&L objects
   * @param {number} initialInvestment - Initial investment (negative value)
   * @returns {Object} Cash flow analysis
   */
  static generateCashFlowProjection(monthlyPnLs, initialInvestment = 0) {
    if (!monthlyPnLs || monthlyPnLs.length === 0) {
      return null;
    }

    // Extract monthly cash flows (profit/loss)
    const monthlyCashFlows = monthlyPnLs.map(pnl => pnl.profitLoss);

    // Add initial investment as first cash flow
    const allCashFlows = [initialInvestment, ...monthlyCashFlows];

    // Calculate cumulative cash flows
    let cumulative = initialInvestment;
    const cumulativeCashFlows = monthlyCashFlows.map(cf => {
      cumulative += parseFloat(cf || 0);
      return Math.round(cumulative * 100) / 100;
    });

    return {
      monthlyCashFlows: monthlyCashFlows.map(cf => Math.round(cf * 100) / 100),
      cumulativeCashFlows,
      allCashFlows: allCashFlows.map(cf => Math.round(cf * 100) / 100)
    };
  }
}

module.exports = PnLCalculator;
