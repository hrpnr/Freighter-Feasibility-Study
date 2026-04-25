const pool = require('../database/pool');
const ScenarioCalculator = require('../calculations/scenarioCalculator');

class MonteCarloService {
  /**
   * Run Monte Carlo simulation
   * @param {string} scenarioId - Base scenario ID
   * @param {Object} config - Simulation configuration
   * @returns {Object} Simulation results
   */
  static async runSimulation(scenarioId, config) {
    const {
      iterations     = 1000,
      variables      = {},
      confidenceLevel = 0.95,
      correlationRho = -0.35   // fuel ↔ traffic demand correlation
    } = config;

    const client = await pool.connect();

    try {
      // Get base scenario and parameters
      const paramsResult = await client.query(
        'SELECT * FROM scenario_parameters WHERE scenario_id = $1',
        [scenarioId]
      );

      if (paramsResult.rows.length === 0) {
        throw new Error('Scenario parameters not found');
      }

      const baseParams = paramsResult.rows[0];

      // Get base P&L once
      const pnlResult = await client.query(
        `SELECT * FROM monthly_pnl WHERE scenario_id = $1 ORDER BY month_date`,
        [scenarioId]
      );

      if (pnlResult.rows.length === 0) {
        throw new Error('No P&L data found. Please run base calculation first.');
      }

      const basePnL = pnlResult.rows;

      // Get max payload for the scenario's primary aircraft
      const payloadResult = await client.query(
        `SELECT at.max_payload_kg, at.code as aircraft_code
         FROM fleet_plans fp
         JOIN aircraft_types at ON fp.aircraft_type_id = at.id
         WHERE fp.scenario_id = $1
         LIMIT 1`,
        [scenarioId]
      );
      const scenarioMaxPayload = parseFloat(payloadResult.rows[0]?.max_payload_kg) || 19500;
      const aircraftCode = payloadResult.rows[0]?.aircraft_code || 'B733F';

      const results = [];

      console.log(`Starting Monte Carlo simulation with ${iterations} iterations...`);

      // Run iterations
      for (let i = 0; i < iterations; i++) {
        // Sample random values for each variable
        const sampledParams = { ...baseParams };

        for (const [varName, distribution] of Object.entries(variables)) {
          sampledParams[varName] = this.sampleDistribution(distribution);
        }

        const result = await this.calculateWithParams(
          client, scenarioId, sampledParams, basePnL, baseParams, variables, correlationRho, scenarioMaxPayload
        );
        results.push(result);


      }

      // Calculate statistics
      const statistics = this.calculateStatistics(results, confidenceLevel);

      // Calculate risk metrics
      const riskMetrics = this.calculateRiskMetrics(results, confidenceLevel);

      return {
        scenarioId,
        aircraftCode,
        maxPayloadLimit: scenarioMaxPayload,
        statistics,
        riskMetrics,
        results: results.map(r => ({ npv: r.npv, irr: r.irr, profit: r.totalProfit })),
        variables: Object.keys(variables)
      };

    } finally {
      client.release();
    }
  }

  /**
   * Sample from probability distribution
   */
  static sampleDistribution(distribution) {
    const { type, params } = distribution;

    switch (type) {
      case 'normal':
        return this.sampleNormal(params.mean, params.stdDev);

      case 'triangular':
        return this.sampleTriangular(params.min, params.mode, params.max);

      case 'uniform':
        return this.sampleUniform(params.min, params.max);

      case 'lognormal':
        return this.sampleLogNormal(params.mean, params.stdDev);

      default:
        throw new Error(`Unknown distribution type: ${type}`);
    }
  }

  /**
   * Sample from standard normal N(0,1) — used for GBM shocks
   */
  static sampleNormalStandard() {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  static sampleNormal(mean, stdDev) {
    return mean + this.sampleNormalStandard() * stdDev;
  }

  static sampleTriangular(min, mode, max) {
    const u = Math.random();
    const f = (mode - min) / (max - min);
    if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }

  static sampleUniform(min, max) {
    return min + Math.random() * (max - min);
  }

  static sampleLogNormal(mean, stdDev) {
    return Math.exp(this.sampleNormal(mean, stdDev));
  }

  /**
   * Derive annualised sigma from a distribution definition (relative to base)
   * Used to scale GBM diffusion so the distribution range is preserved.
   */
  static deriveSigmaFromDist(distribution, baseValue) {
    if (!distribution || !baseValue || baseValue === 0) return 0.15; // safe default
    const { type, params } = distribution;
    let stdDev;
    if (type === 'normal') {
      stdDev = Math.abs(params.stdDev || 0);
    } else if (type === 'triangular') {
      // Triangular std dev formula
      const { min, mode, max } = params;
      stdDev = Math.sqrt((min*min + mode*mode + max*max - min*mode - min*max - mode*max) / 18);
    } else if (type === 'uniform') {
      stdDev = (params.max - params.min) / Math.sqrt(12);
    } else {
      stdDev = Math.abs(params.stdDev || baseValue * 0.15);
    }
    // Relative sigma (coefficient of variation)
    return Math.min(Math.max(Math.abs(stdDev / baseValue), 0.01), 0.80);
  }

  /**
   * Calculate one iteration using GBM time-varying paths for fuel & traffic,
   * with Cholesky-coupled correlated shocks. Stable variables (load factor,
   * overhead, fare growth) are applied as constant multipliers across all months.
   */
  static async calculateWithParams(
    client, scenarioId, sampledParams, basePnL, baseParams, variables, correlationRho = -0.35, maxUplift = 19500
  ) {
    const baseFuelPrice  = parseFloat(baseParams.fuel_price_idr_per_liter)  || 10500;
    const baseOverhead   = parseFloat(baseParams.overhead_cost_month_usd)   || 100000;
    const baseFareGrowth = parseFloat(baseParams.fare_growth_rate_annual)   || 0.07;
    const baseTrfGrowth  = parseFloat(baseParams.traffic_growth_rate_annual)|| 0.25;

    // We use one_leg uplift as the reference for 'Uplift Confidence' logic
    const refUplift = parseFloat(baseParams.initial_uplift_jkt_one_leg) || 16000;
    // maxUplift is passed from the resolved aircraft type

    // ── Stable variables: sample ONCE per iteration ──────────────────────────
    // 'avg_load_factor_pct' now acts as the Uplift Confidence Level multiplier (e.g. 0.85 = 85%)
    const sampledCL = variables.avg_load_factor_pct
      ? this.sampleDistribution(variables.avg_load_factor_pct)
      : 1.0;
    const sampledFareGrowth = variables.fare_growth_rate_annual
      ? this.sampleDistribution(variables.fare_growth_rate_annual)
      : baseFareGrowth;
    const sampledTrfGrowth = variables.traffic_growth_rate_annual
      ? this.sampleDistribution(variables.traffic_growth_rate_annual)
      : baseTrfGrowth;

    // Apply capacity cap: min(maxUplift, planned * confidence) / planned
    const effectiveUplift = Math.min(maxUplift, refUplift * sampledCL);
    const lfMult   = Math.max(0.05, effectiveUplift / refUplift);
    
    // Growth drifts (relative to base scenario encoded in monthly_pnl)
    const driftTrf  = sampledTrfGrowth - baseTrfGrowth;
    const driftFare = sampledFareGrowth - baseFareGrowth;

    // ── GBM annualised sigmas for time-varying variables ─────────────────────
    const sigmaFuel = this.deriveSigmaFromDist(variables.fuel_price_idr_per_liter, baseFuelPrice);
    const sigmaTrf  = this.deriveSigmaFromDist(variables.traffic_growth_rate_annual, Math.abs(baseTrfGrowth) || 0.25);
    const dt = 1 / 12; // monthly time step (years)

    // Cholesky decomp for 2-variable correlation:
    //   Z_fuel  = W1  (independent)
    //   Z_trf   = ρ·W1 + √(1-ρ²)·W2  (correlated)
    const rho    = Math.max(-0.999, Math.min(0.999, correlationRho));
    const rhoC   = Math.sqrt(1 - rho * rho);

    // Initialise Brownian path accumulators
    let W_fuel = 0;
    let W_trf  = 0;

    // ── Month-by-month GBM walk ───────────────────────────────────────────────
    const modifiedPnL = basePnL.map((month, m) => {
      // Draw independent standard normals
      const Z1 = this.sampleNormalStandard(); // drives fuel
      const Z2 = this.sampleNormalStandard(); // independent component for traffic

      // Correlated shock for traffic
      const Z_trf_corr = rho * Z1 + rhoC * Z2;

      // Update Brownian paths (√dt scaling)
      W_fuel += Math.sqrt(dt) * Z1;
      W_trf  += Math.sqrt(dt) * Z_trf_corr;

      // Time elapsed in years
      const t = (m + 1) * dt;

      // GBM: S(t) = S(0)·exp((μ - σ²/2)·t + σ·W(t))
      // Using μ = relative drift to override scenario default trends
      const fuelMultiplier = Math.exp(-(sigmaFuel * sigmaFuel / 2) * t + sigmaFuel * W_fuel);
      const trfMultiplier  = Math.exp((driftTrf - sigmaTrf * sigmaTrf / 2) * t + sigmaTrf * W_trf);
      const fareDriftMult  = Math.exp(driftFare * t);

      let revenue = parseFloat(month.total_revenue_usd) || 0;
      let cost    = parseFloat(month.total_cost_usd)    || 0;

      // Apply stable multipliers
      revenue *= lfMult;    // load factor
      revenue *= fareDriftMult; // time-varying fare growth drift
      revenue *= Math.max(0.01, trfMultiplier); // time-varying traffic shock + drift

      // Apply time-varying fuel cost shock (GBM)
      const fuelCost = parseFloat(month.fuel_cost_usd) || 0;
      cost = cost - fuelCost + fuelCost * Math.max(0.1, fuelMultiplier);

      const adjRev  = isNaN(revenue) ? 0 : revenue;
      const adjCost = isNaN(cost)    ? 0 : cost;
      return { ...month, total_revenue_usd: adjRev, total_cost_usd: adjCost, profit_loss_usd: adjRev - adjCost };
    });

    // ── Financial metrics from adjusted monthly P&L ───────────────────────────
    const totalRevenue = modifiedPnL.reduce((s, p) => s + (parseFloat(p.total_revenue_usd) || 0), 0);
    const totalCost    = modifiedPnL.reduce((s, p) => s + (parseFloat(p.total_cost_usd)    || 0), 0);
    const totalProfit  = totalRevenue - totalCost;

    const costOfCapital = parseFloat(baseParams.cost_of_capital) || 0.04;
    const monthlyRate   = costOfCapital / 12;
    const npv = modifiedPnL.reduce((sum, p, i) =>
      sum + (parseFloat(p.profit_loss_usd) || 0) / Math.pow(1 + monthlyRate, i + 1), 0
    );

    const irr = this.calculateIRR([0, ...modifiedPnL.map(p => parseFloat(p.profit_loss_usd) || 0)]);

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      npv,
      irr,
      profitMargin: totalRevenue > 0 ? totalProfit / totalRevenue : 0
    };
  }


  /**
   * Calculate statistics from results
   */
  static calculateStatistics(results, confidenceLevel) {
    const npvs = results.map(r => r.npv).sort((a, b) => a - b);
    const profits = results.map(r => r.totalProfit).sort((a, b) => a - b);
    const irrs = results.map(r => r.irr).filter(r => r !== null).sort((a, b) => a - b);

    const percentile = (arr, p) => {
      const index = Math.ceil(arr.length * p) - 1;
      return arr[Math.max(0, index)];
    };

    return {
      npv: {
        mean: npvs.reduce((a, b) => a + b, 0) / npvs.length,
        median: percentile(npvs, 0.5),
        stdDev: this.calculateStdDev(npvs),
        min: npvs[0],
        max: npvs[npvs.length - 1],
        p5: percentile(npvs, 0.05),
        p25: percentile(npvs, 0.25),
        p75: percentile(npvs, 0.75),
        p95: percentile(npvs, 0.95)
      },
      profit: {
        mean: profits.reduce((a, b) => a + b, 0) / profits.length,
        median: percentile(profits, 0.5),
        stdDev: this.calculateStdDev(profits),
        min: profits[0],
        max: profits[profits.length - 1],
        p5: percentile(profits, 0.05),
        p25: percentile(profits, 0.25),
        p75: percentile(profits, 0.75),
        p95: percentile(profits, 0.95)
      },
      irr: irrs.length > 0 ? {
        mean: irrs.reduce((a, b) => a + b, 0) / irrs.length,
        median: percentile(irrs, 0.5),
        min: irrs[0],
        max: irrs[irrs.length - 1]
      } : null
    };
  }

  /**
   * Calculate risk metrics (VaR and CVaR)
   */
  static calculateRiskMetrics(results, confidenceLevel) {
    const npvs = results.map(r => r.npv).sort((a, b) => a - b);
    const profits = results.map(r => r.totalProfit).sort((a, b) => a - b);

    const varIndex = Math.floor(npvs.length * (1 - confidenceLevel));
    const npvVaR = npvs[varIndex];
    const profitVaR = profits[varIndex];

    // CVaR (Conditional VaR / Expected Shortfall)
    const npvCVaR = npvs.slice(0, varIndex + 1).reduce((a, b) => a + b, 0) / (varIndex + 1);
    const profitCVaR = profits.slice(0, varIndex + 1).reduce((a, b) => a + b, 0) / (varIndex + 1);

    // Probability of loss
    const npvLossProbability = npvs.filter(n => n < 0).length / npvs.length;
    const profitLossProbability = profits.filter(p => p < 0).length / profits.length;

    return {
      confidenceLevel,
      npv: {
        VaR: npvVaR,
        CVaR: npvCVaR,
        probabilityOfLoss: npvLossProbability
      },
      profit: {
        VaR: profitVaR,
        CVaR: profitCVaR,
        probabilityOfLoss: profitLossProbability
      }
    };
  }

  /**
   * Calculate standard deviation
   */
  static calculateStdDev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate IRR (simplified Newton-Raphson method)
   */
  static calculateIRR(cashFlows) {
    let rate = 0.1;
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
      let npv = 0;
      let derivative = 0;

      for (let t = 0; t < cashFlows.length; t++) {
        npv += cashFlows[t] / Math.pow(1 + rate, t);
        derivative -= t * cashFlows[t] / Math.pow(1 + rate, t + 1);
      }

      if (Math.abs(npv) < tolerance) {
        return rate;
      }

      if (derivative === 0) {
        return null;
      }

      rate = rate - npv / derivative;
    }

    return null;
  }

  /**
   * Generate histogram data
   */
  static generateHistogram(results, metric, bins = 50) {
    const values = results.map(r => r[metric]).sort((a, b) => a - b);
    const min = values[0];
    const max = values[values.length - 1];
    const binWidth = (max - min) / bins;

    const histogram = [];
    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      const count = values.filter(v => v >= binStart && v < binEnd).length;

      histogram.push({
        bin: `${Math.round(binStart / 1000)}K - ${Math.round(binEnd / 1000)}K`,
        binStart,
        binEnd,
        count,
        frequency: count / values.length
      });
    }

    return histogram;
  }
}

module.exports = MonteCarloService;
