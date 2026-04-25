const pool = require('../database/pool');
const FlightCalculator = require('../calculations/flightCalculator');
const ScenarioCalculator = require('../calculations/scenarioCalculator');
const config = require('../config/config');
const { format, startOfMonth, endOfMonth, getDaysInMonth, differenceInYears } = require('date-fns');

class DailyPnLService {
  /**
   * Get daily P&L data for a scenario's 5-year horizon
   * Uses scenario pricing with master fallback
   */
  static async getDailyPnL(id) {
    try {

      // 1. Load Scenario and Parameters
      const scenarioRes = await pool.query('SELECT * FROM scenarios WHERE id = $1', [id]);
      if (scenarioRes.rows.length === 0) throw new Error('Scenario not found');
      const scenario = scenarioRes.rows[0];
      const goLiveDate = new Date(scenario.go_live_date);

      const paramsRes = await pool.query(
        `SELECT sp.*, mp.*, 
            COALESCE(sp.seasonality_constant, mp.seasonality_constant) as seasonality_constant,
            COALESCE(sp.seasonality_slope, mp.seasonality_slope) as seasonality_slope,
            COALESCE(sp.ground_time_hll_hours, mp.ground_time_hll_hours) as ground_time_hll_hours,
            COALESCE(sp.ground_time_manual_hours, mp.ground_time_manual_hours) as ground_time_manual_hours,
            COALESCE(sp.cargo_density_kg_per_m3, mp.cargo_density_kg_per_m3) as cargo_density_kg_per_m3,
            COALESCE(sp.ground_handling_fee_usd, mp.ground_handling_fee_usd) as ground_handling_fee_usd,
            COALESCE(sp.avg_taxi_time_hours, mp.avg_taxi_time_hours) as avg_taxi_time_hours,
            COALESCE(sp.non_linear_flight_path_effect_pct, mp.non_linear_flight_path_effect_pct) as non_linear_flight_path_effect_pct,
            COALESCE(sp.apu_op_hour_ratio, mp.apu_op_hour_ratio) as apu_op_hour_ratio,
            COALESCE(sp.cost_of_capital, mp.cost_of_capital) as cost_of_capital,
            COALESCE(sp.usd_to_idr_rate, mp.usd_to_idr_rate) as usd_to_idr_rate,
            COALESCE(sp.eis_cost_usd, mp.eis_cost_usd) as eis_cost_usd,
            COALESCE(sp.redelivery_cost_usd, mp.redelivery_cost_usd) as redelivery_cost_usd,
            COALESCE(sp.insurance_cost_per_ac_month_usd, mp.insurance_cost_per_ac_month_usd) as insurance_cost_per_ac_month_usd,
            COALESCE(sp.overhead_cost_month_usd, mp.overhead_cost_month_usd) as overhead_cost_month_usd,
            COALESCE(sp.pilot_annual_salary_usd, mp.pilot_annual_salary_usd) as pilot_annual_salary_usd,
            COALESCE(sp.fo_annual_salary_usd, mp.fo_annual_salary_usd) as fo_annual_salary_usd,
            COALESCE(sp.pilot_count_per_ac, mp.pilot_count_per_ac) as pilot_count_per_ac,
            COALESCE(sp.fo_count_per_ac, mp.fo_count_per_ac) as fo_count_per_ac,
            COALESCE(sp.pilot_fata_per_hour_usd, mp.pilot_fata_per_hour_usd) as pilot_fata_per_hour_usd,
            COALESCE(sp.pilot_afb_per_hour_usd, mp.pilot_afb_per_hour_usd) as pilot_afb_per_hour_usd,
            COALESCE(sp.pilot_lot_per_hour_usd, mp.pilot_lot_per_hour_usd) as pilot_lot_per_hour_usd,
            COALESCE(sp.fo_fata_per_hour_usd, mp.fo_fata_per_hour_usd) as fo_fata_per_hour_usd,
            COALESCE(sp.fo_afb_per_hour_usd, mp.fo_afb_per_hour_usd) as fo_afb_per_hour_usd,
            COALESCE(sp.fo_lot_per_hour_usd, mp.fo_lot_per_hour_usd) as fo_lot_per_hour_usd,
            COALESCE(sp.fuel_price_idr_per_liter, mp.fuel_price_idr_per_liter) as fuel_price_idr_per_liter,
            COALESCE(sp.traffic_growth_rate_annual, mp.traffic_growth_rate_annual) as traffic_growth_rate_annual,
            COALESCE(sp.fare_growth_rate_annual, mp.fare_growth_rate_annual) as fare_growth_rate_annual
         FROM scenario_parameters sp
         CROSS JOIN (SELECT * FROM master_scenario_parameters LIMIT 1) mp
         WHERE sp.scenario_id = $1`,
        [id]
      );
      const params = paramsRes.rows[0] || {};
      // Ensure all numeric fields are parsed as numbers
      Object.keys(params).forEach(key => {
        if (typeof params[key] === 'string' && !isNaN(params[key]) && params[key].trim() !== '' && key !== 'id' && key !== 'scenario_id') {
          params[key] = parseFloat(params[key]);
        }
      });

      // 2. Revenue is sourced from the daily_revenue table (simulation engine output).
      //    Re-calculating revenue here via the growth formula produces compounding drift
      //    over the 5-year horizon, leading to astronomically inflated values.
      //    The simulation engine already applied proration and all growth factors correctly.

      // 3. Load Fleet and Aircraft Types (to get fixed costs and burn rates)
      const fleetRes = await pool.query(
        `SELECT fp.id as fp_id, fp.aircraft_number, fp.eis_date, fp.redelivery_date, fp.lease_cost_monthly_usd, at.speed_knots, at.fuel_burn_liter_per_hour, at.max_payload_kg
         FROM fleet_plans fp 
         JOIN aircraft_types at ON fp.aircraft_type_id = at.id 
         WHERE fp.scenario_id = $1`, [id]
      );
      const fleet = fleetRes.rows;

      // Determine robust start date: earliest EIS or go-live to capture initial investment (NPV/IRR accuracy)
      let simulationStartDate = new Date(goLiveDate);
      const oneYearBeforeGoLive = new Date(goLiveDate);
      oneYearBeforeGoLive.setFullYear(oneYearBeforeGoLive.getFullYear() - 1);

      fleet.forEach(ac => {
        if (!ac.eis_date) return;
        const acEis = new Date(ac.eis_date);
        if (isNaN(acEis.getTime())) return;
        
        if (acEis < simulationStartDate) {
          simulationStartDate = new Date(acEis);
        }
      });
      
      // Safety cap: don't simulate more than 1 year of pre-operational period to prevent performance collapse
      if (simulationStartDate < oneYearBeforeGoLive) {
        simulationStartDate = oneYearBeforeGoLive;
      }

      // 4. Fetch aggregated daily traffic
      const trafficRes = await pool.query(
        `SELECT dt.calculation_date, dt.fleet_plan_id, dt.origin_id, dt.destination_id, dt.segment,
                MAX(s.route_category) as route_category,
                MAX(s.rotation_group_id::text) as rotation_group_id,
                MAX(s.priority) as priority,
                MAX(dt.distance_km) as distance_km,
                SUM(dt.flights) as flights, SUM(dt.block_hours) as block_hours, SUM(dt.flight_cycles) as flight_cycles,
                MAX(COALESCE(saf.landing_fee_usd, a.landing_fee_usd)) as landing_fee,
                MAX(COALESCE(saf.parking_fee_usd, a.parking_fee_usd)) as parking_fee,
                MAX(COALESCE(saf.navigation_fee_usd, a.navigation_fee_usd)) as navigation_fee
         FROM daily_traffic dt
         LEFT JOIN schedules s ON dt.scenario_id = s.scenario_id 
               AND dt.origin_id = s.origin_id 
               AND dt.destination_id = s.destination_id 
               AND dt.segment = s.full_route_string
               AND dt.fleet_plan_id = s.fleet_plan_id
         JOIN airports a ON dt.destination_id = a.id
         LEFT JOIN scenario_airport_fees saf ON a.id = saf.airport_id AND saf.scenario_id = dt.scenario_id
         WHERE dt.scenario_id = $1
         GROUP BY dt.calculation_date, dt.fleet_plan_id, dt.origin_id, dt.destination_id, dt.segment
         ORDER BY dt.calculation_date`,
        [id]
      );

      if (trafficRes.rows.length === 0) {
        return { data: [], summary: { hasData: false, pricingRemark: 'No calculation data available' } };
      }

      // 4.5. Fetch actual crew payroll and role breakdown for this scenario
      const crewRes = await pool.query(
        'SELECT monthly_salary_usd, role, max_duty_hours_per_month, max_duty_hours_per_day FROM crew_members WHERE scenario_id = $1',
        [id]
      );
      const totalMonthlySalary = crewRes.rows.reduce((sum, cm) => sum + (parseFloat(cm.monthly_salary_usd) || 0), 0);
      const pilotCount = crewRes.rows.filter(cm => cm.role === 'pilot').length;
      const foCount    = crewRes.rows.filter(cm => cm.role === 'first_officer').length;
      // A crew SET = 1 Captain + 1 FO always flying together. Capacity is limited by the smaller pool.
      const numCrewSets = Math.min(pilotCount, foCount);

      // 5. Calculate Daily P&L for a continuous timeline
      const dailyPnL = {};
      const horizonYears = 5;
      const endDate = new Date(goLiveDate);
      endDate.setFullYear(endDate.getFullYear() + horizonYears);

      // 5a. Initialize EVERY day in the horizon with fixed costs
      let current = new Date(simulationStartDate);
      while (current < endDate) {
        const dateStr = format(current, 'yyyy-MM-dd');
        const daysInMonth = getDaysInMonth(current);
        
        // Fixed costs: Overall Overhead + Total Crew Salaries (pro-rated daily)
        const dailyOverhead = (parseFloat(params.overhead_cost_month_usd) || 0) / daysInMonth;
        const dailyCrewSalaries = totalMonthlySalary / daysInMonth;

        dailyPnL[dateStr] = { date: dateStr, revenue: 0, cost: dailyOverhead + dailyCrewSalaries, profit: 0, crew_duty_demand: 0, crew_duty_capacity: 0, crew_daily_ceiling: 0, ac_block_hours: 0, ac_flights: 0, ac_active: 0, ac_max_bh_capacity: 0 };
        
        // Add aircraft-specific fixed costs if within their active period
        fleet.forEach(ac => {
          const eis = new Date(ac.eis_date);
          const redel = new Date(ac.redelivery_date);
          
          if (current >= eis && current <= redel) {
            // Only Lease and Insurance now (Salaries moved to global above)
            const monthlyFixed = (parseFloat(ac.lease_cost_monthly_usd) || 0) +
                                 (parseFloat(params.insurance_cost_per_ac_month_usd) || 0);
            
            dailyPnL[dateStr].cost += (monthlyFixed / daysInMonth);
            // Track active fleet for utilization chart
            dailyPnL[dateStr].ac_active += 1;
            dailyPnL[dateStr].ac_max_bh_capacity += parseFloat(params.max_block_hours_per_ac_per_day) || 14;

            // One-time EIS investment cost on the entry day
            if (format(current, 'yyyy-MM-dd') === format(eis, 'yyyy-MM-dd')) {
              dailyPnL[dateStr].cost += parseFloat(params.eis_cost_usd || config.DEFAULT_EIS_COST_USD);
            }

            // One-time Redelivery cost on the exit day
            if (format(current, 'yyyy-MM-dd') === format(redel, 'yyyy-MM-dd')) {
              dailyPnL[dateStr].cost += parseFloat(params.redelivery_cost_usd || config.DEFAULT_REDELIVERY_COST_USD);
            }
          }
        });

        current.setDate(current.getDate() + 1);
      }

      // 5b. Read pre-computed revenue from daily_revenue (simulation engine, already prorated)
      const dailyRevRes = await pool.query(
        `SELECT calculation_date, SUM(revenue_usd) as total_revenue
         FROM daily_revenue
         WHERE scenario_id = $1
         GROUP BY calculation_date`,
        [id]
      );
      dailyRevRes.rows.forEach(r => {
        const dateStr = format(new Date(r.calculation_date), 'yyyy-MM-dd');
        if (dailyPnL[dateStr] !== undefined) {
          dailyPnL[dateStr].revenue = parseFloat(r.total_revenue) || 0;
        }
      });

      // 5c. Overlay variable costs (fuel, GH, crew allowance) from traffic
      trafficRes.rows.forEach(row => {
        const dateObj = new Date(row.calculation_date);
        const dateStr = format(dateObj, 'yyyy-MM-dd');
        if (!dailyPnL[dateStr]) return;

        const acInfo = fleet.find(f => String(f.fp_id) === String(row.fleet_plan_id)) || {};

        let effectiveBH = parseFloat(row.block_hours) || 0;
        const speed = parseFloat(acInfo.speed_knots) || 450;
        if (effectiveBH === 0 && (parseFloat(row.distance_km) || 0) > 0) {
          effectiveBH = FlightCalculator.calculateBlockHours(
            parseFloat(row.distance_km), speed,
            parseFloat(params.avg_taxi_time_hours) || 0.25,
            parseFloat(params.non_linear_flight_path_effect_pct) || 1.05
          );
        }

        const fuelCost = acInfo.fp_id
          ? FlightCalculator.calculateFuelCost(
              effectiveBH, parseFloat(acInfo.fuel_burn_liter_per_hour) || 0,
              parseFloat(params.fuel_price_idr_per_liter) || 0,
              parseFloat(params.usd_to_idr_rate) || 0
            )
          : 0;
        const ghCost = (parseFloat(row.flights) || 0) * (parseFloat(params.ground_handling_fee_usd) || 0);
        const crewAllowance = effectiveBH * (
          (parseFloat(params.pilot_fata_per_hour_usd) || 0) +
          (parseFloat(params.pilot_afb_per_hour_usd) || 0) +
          (parseFloat(params.pilot_lot_per_hour_usd) || 0) +
          (parseFloat(params.fo_fata_per_hour_usd) || 0) +
          (parseFloat(params.fo_afb_per_hour_usd) || 0) +
          (parseFloat(params.fo_lot_per_hour_usd) || 0)
        );

        const airportFees = (parseFloat(row.flights) || 0) * (
          (parseFloat(row.landing_fee) || 0) +
          (parseFloat(row.parking_fee) || 0) +
          (parseFloat(row.navigation_fee) || 0)
        );

        dailyPnL[dateStr].cost += parseFloat(fuelCost || 0) + parseFloat(ghCost || 0) + parseFloat(crewAllowance || 0) + parseFloat(airportFees || 0);
      });

      // 5c. Overlay maintenance costs from log
      const maintenanceRes = await pool.query(
        `SELECT ml.due_date, COALESCE(ml.actual_cost_usd, met.event_cost_usd) as event_cost
         FROM maintenance_log ml
         JOIN maintenance_event_types met ON ml.event_type_id = met.id
         JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
         WHERE fp.scenario_id = $1 AND ml.status IN ('scheduled', 'overdue', 'completed', 'simulated')`,
        [id]
      );

      maintenanceRes.rows.forEach(row => {
        const dateStr = format(new Date(row.due_date), 'yyyy-MM-dd');
        if (dailyPnL[dateStr]) {
          dailyPnL[dateStr].cost += (parseFloat(row.event_cost) || 0);
        }
      });

      // 6. Calculate Crew Utilization Metrics (in CREW-SET-HOURS)
      // A crew set = 1 Captain + 1 FO flying together. They are never split.
      const dutyBuffer = parseFloat(params.crew_duty_buffer_hours) || 1.5;
      const fatigueReserve = parseFloat(params.crew_fatigue_reserve_pct) || 0.20;

      // Each crew SET's daily ceiling = its members' max duty (use pilot's limit, FO matches)
      const maxDutyPerSet = parseFloat(params.max_duty_hours_per_day) || 12;
      // Daily ceiling = how many crew-set-hours the roster can cover in one day
      const totalDailyMaxDuty   = numCrewSets * maxDutyPerSet * (1 - fatigueReserve);
      // Monthly prorated capacity in crew-set-hours per day
      const avgMonthlyHrsPerPerson = crewRes.rows
        .filter(cm => cm.role === 'pilot')
        .reduce((sum, cm) => sum + (parseFloat(cm.max_duty_hours_per_month) || 100), 0) / Math.max(pilotCount, 1);
      const totalMonthlyCapacityLimit = (numCrewSets * avgMonthlyHrsPerPerson * (1 - fatigueReserve)) / 30;

      trafficRes.rows.forEach(row => {
        const dateStr = format(new Date(row.calculation_date), 'yyyy-MM-dd');
        if (!dailyPnL[dateStr]) return;

        // Demand in CREW-SET-HOURS: 1 aircraft needs 1 crew set for (BH + 1 buffer per duty day)
        // No ×2 — a Pilot+FO are ONE set, not two independent resources
        const crewSetHours = (parseFloat(row.block_hours) || 0) + ((parseFloat(row.flights) || 0) > 0 ? dutyBuffer : 0);

        dailyPnL[dateStr].crew_duty_demand    += crewSetHours;
        dailyPnL[dateStr].crew_duty_capacity   = totalMonthlyCapacityLimit;
        dailyPnL[dateStr].crew_daily_ceiling   = totalDailyMaxDuty;

        // Aircraft utilization accumulators
        dailyPnL[dateStr].ac_block_hours += parseFloat(row.block_hours) || 0;
        dailyPnL[dateStr].ac_flights     += parseFloat(row.flights) || 0;
      });

      // Calculate final profit for all dates
      Object.keys(dailyPnL).forEach(dateStr => {
        dailyPnL[dateStr].profit = dailyPnL[dateStr].revenue - dailyPnL[dateStr].cost;
      });

      // 6. Check if calculation is stale
      const lastCalcRes = await pool.query(
        `SELECT MAX(created_at) as last_calc FROM monthly_pnl WHERE scenario_id = $1`,
        [id]
      );
      const lastCalc = lastCalcRes.rows[0]?.last_calc ? new Date(lastCalcRes.rows[0].last_calc) : new Date(0);

      const lastUpdateRes = await pool.query(
        `SELECT MAX(updated_at) as last_update FROM (
          SELECT updated_at FROM fleet_plans WHERE scenario_id = $1
          UNION ALL
          SELECT updated_at FROM schedules WHERE scenario_id = $1
          UNION ALL
          SELECT updated_at FROM scenario_parameters WHERE scenario_id = $1
        ) as updates`,
        [id]
      );
      const lastUpdate = lastUpdateRes.rows[0]?.last_update ? new Date(lastUpdateRes.rows[0].last_update) : new Date(0);

      const result = Object.values(dailyPnL).sort((a, b) => a.date.localeCompare(b.date));

      // 7. Calculate Investment Metrics using Single Source of Truth
      // Derive final NPV, IRR and Payback from the official monthly_pnl generated by the Simulation Engine
      const sstRes = await pool.query(
        `SELECT profit_loss_usd, cumulative_profit_loss_usd 
         FROM monthly_pnl 
         WHERE scenario_id = $1 
         ORDER BY month_date`, 
        [id]
      );
      
      let finalNpv = 0;
      let finalIrr = 0;
      let finalPayback = null;

      if (sstRes.rows.length > 0) {
        const mappedPnl = sstRes.rows.map(r => ({
          profitLoss: parseFloat(r.profit_loss_usd) || 0,
          cumulativeProfitLoss: parseFloat(r.cumulative_profit_loss_usd) || 0
        }));
        
        const metrics = ScenarioCalculator.calculateFinancialMetrics(
          mappedPnl, 
          parseFloat(params.cost_of_capital) || config.DEFAULT_COST_OF_CAPITAL
        );
        
        finalNpv = isNaN(metrics.npv) ? 0 : Math.round(metrics.npv);
        finalIrr = isNaN(metrics.irr) || metrics.irr === null ? 0 : metrics.irr;
        finalPayback = metrics.paybackPeriod;
      }

      return {
        data: result,
        summary: {
          hasData: result.length > 0,
          isStale: lastUpdate > lastCalc,
          pricingRemark: 'Revenue sourced from simulation engine',
          npv: finalNpv,
          irr: finalIrr,
          paybackMonths: finalPayback
        }
      };

    } catch (error) {
      console.error('Error fetching daily P&L:', error);
      throw new Error('Failed to fetch daily P&L data');
    }
  }

  /**
   * Get detailed analysis for ONE specific day (Leg-by-leg)
   */
  static async getDailyAnalysis(id, date) {
    try {
      if (!date) throw new Error('Date parameter is required');

      // Clean date parsing to avoid "Invalid Date"
      const targetDate = new Date(`${date}T00:00:00`);
      if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid date format');
      }
      const dateStr = format(targetDate, 'yyyy-MM-dd');

      // 1. Load Scenario and Parameters
      const scenarioRes = await pool.query('SELECT * FROM scenarios WHERE id = $1', [id]);
      if (scenarioRes.rows.length === 0) throw new Error('Scenario not found');
      const scenario = scenarioRes.rows[0];
      const goLiveDate = new Date(scenario.go_live_date);
      if (isNaN(goLiveDate.getTime())) {
        throw new Error('Scenario has invalid go-live date');
      }

      const paramsRes = await pool.query(
        `SELECT sp.*, mp.*, 
            COALESCE(sp.seasonality_constant, mp.seasonality_constant) as seasonality_constant,
            COALESCE(sp.seasonality_slope, mp.seasonality_slope) as seasonality_slope,
            COALESCE(sp.ground_time_hll_hours, mp.ground_time_hll_hours) as ground_time_hll_hours,
            COALESCE(sp.ground_time_manual_hours, mp.ground_time_manual_hours) as ground_time_manual_hours,
            COALESCE(sp.cargo_density_kg_per_m3, mp.cargo_density_kg_per_m3) as cargo_density_kg_per_m3,
            COALESCE(sp.ground_handling_fee_usd, mp.ground_handling_fee_usd) as ground_handling_fee_usd,
            COALESCE(sp.avg_taxi_time_hours, mp.avg_taxi_time_hours) as avg_taxi_time_hours,
            COALESCE(sp.non_linear_flight_path_effect_pct, mp.non_linear_flight_path_effect_pct) as non_linear_flight_path_effect_pct,
            COALESCE(sp.apu_op_hour_ratio, mp.apu_op_hour_ratio) as apu_op_hour_ratio,
            COALESCE(sp.cost_of_capital, mp.cost_of_capital) as cost_of_capital,
            COALESCE(sp.usd_to_idr_rate, mp.usd_to_idr_rate) as usd_to_idr_rate,
            COALESCE(sp.eis_cost_usd, mp.eis_cost_usd) as eis_cost_usd,
            COALESCE(sp.redelivery_cost_usd, mp.redelivery_cost_usd) as redelivery_cost_usd,
            COALESCE(sp.insurance_cost_per_ac_month_usd, mp.insurance_cost_per_ac_month_usd) as insurance_cost_per_ac_month_usd,
            COALESCE(sp.overhead_cost_month_usd, mp.overhead_cost_month_usd) as overhead_cost_month_usd,
            COALESCE(sp.pilot_annual_salary_usd, mp.pilot_annual_salary_usd) as pilot_annual_salary_usd,
            COALESCE(sp.fo_annual_salary_usd, mp.fo_annual_salary_usd) as fo_annual_salary_usd,
            COALESCE(sp.pilot_count_per_ac, mp.pilot_count_per_ac) as pilot_count_per_ac,
            COALESCE(sp.fo_count_per_ac, mp.fo_count_per_ac) as fo_count_per_ac,
            COALESCE(sp.pilot_fata_per_hour_usd, mp.pilot_fata_per_hour_usd) as pilot_fata_per_hour_usd,
            COALESCE(sp.pilot_afb_per_hour_usd, mp.pilot_afb_per_hour_usd) as pilot_afb_per_hour_usd,
            COALESCE(sp.pilot_lot_per_hour_usd, mp.pilot_lot_per_hour_usd) as pilot_lot_per_hour_usd,
            COALESCE(sp.fo_fata_per_hour_usd, mp.fo_fata_per_hour_usd) as fo_fata_per_hour_usd,
            COALESCE(sp.fo_afb_per_hour_usd, mp.fo_afb_per_hour_usd) as fo_afb_per_hour_usd,
            COALESCE(sp.fo_lot_per_hour_usd, mp.fo_lot_per_hour_usd) as fo_lot_per_hour_usd,
            COALESCE(sp.fuel_price_idr_per_liter, mp.fuel_price_idr_per_liter) as fuel_price_idr_per_liter,
            COALESCE(sp.traffic_growth_rate_annual, mp.traffic_growth_rate_annual) as traffic_growth_rate_annual,
            COALESCE(sp.fare_growth_rate_annual, mp.fare_growth_rate_annual) as fare_growth_rate_annual
         FROM scenario_parameters sp
         CROSS JOIN (SELECT * FROM master_scenario_parameters LIMIT 1) mp
         WHERE sp.scenario_id = $1`, [id]
      );
      const params = paramsRes.rows[0] || {};
      // Ensure all numeric fields are parsed as numbers
      Object.keys(params).forEach(key => {
        if (typeof params[key] === 'string' && !isNaN(params[key]) && params[key].trim() !== '' && key !== 'id' && key !== 'scenario_id') {
          params[key] = parseFloat(params[key]);
        }
      });

      // 2. Load Fleet (for fixed costs)
      const fleetRes = await pool.query(`
        SELECT fp.id as fp_id, fp.aircraft_number, fp.eis_date, fp.redelivery_date, fp.lease_cost_monthly_usd,
               at.name as aircraft_type_name, at.fuel_burn_liter_per_hour, at.speed_knots, at.max_payload_kg 
        FROM fleet_plans fp 
        JOIN aircraft_types at ON fp.aircraft_type_id = at.id 
        WHERE fp.scenario_id = $1`, [id]
      );
      const fleet = fleetRes.rows;

      // 3. Read pre-computed per-leg revenue from daily_revenue (simulation engine output).
      //    This guarantees the drawer shows the same figures as the scenario calculation,
      //    avoiding compounding growth-rate drift when re-running the formula at year 2-5.
      const revenueRes = await pool.query(
        `SELECT origin_id, destination_id, segment, revenue_usd
         FROM daily_revenue
         WHERE scenario_id = $1 AND calculation_date = $2`,
        [id, dateStr]
      );

      const pricingRes = await pool.query(
        `SELECT p.origin_id, p.destination_id, p.segment, p.fare_usd
         FROM pricing p
         WHERE p.scenario_id = $1
         UNION ALL
         SELECT mp.origin_id, mp.destination_id, mp.segment, mp.fare_usd
         FROM master_pricing mp
         WHERE NOT EXISTS (
            SELECT 1 FROM pricing p2 
            WHERE p2.scenario_id = $1 
            AND p2.origin_id = mp.origin_id 
            AND p2.destination_id = mp.destination_id 
            AND (p2.segment = mp.segment OR (p2.segment IS NULL AND mp.segment IS NULL))
         )`,
        [id]
      );
      const revenueMap = {};
      revenueRes.rows.forEach(r => {
        const key = `${r.origin_id}-${r.destination_id}-${r.segment}`;
        revenueMap[key] = parseFloat(r.revenue_usd) || 0;
      });

      // Fetch manifest items for granular breakdown
      const manifestRes = await pool.query(`
        SELECT sm.*, s.origin_id, s.destination_id, s.fleet_plan_id, s.full_route_string as segment
        FROM schedule_manifest sm
        JOIN schedules s ON sm.schedule_id = s.id
        WHERE s.scenario_id = $1
      `, [id]);

      const manifestAuditMap = {};
      manifestRes.rows.forEach(m => {
        const key = `${m.origin_id}-${m.destination_id}-${m.fleet_plan_id}-${m.segment}`;
        if (!manifestAuditMap[key]) manifestAuditMap[key] = [];
        manifestAuditMap[key].push(m);
      });

      // 4. Calculate Fixed Costs for this specific day
      const crewRes = await pool.query('SELECT monthly_salary_usd FROM crew_members WHERE scenario_id = $1', [id]);
      const totalMonthlySalary = crewRes.rows.reduce((sum, cm) => sum + (parseFloat(cm.monthly_salary_usd) || 0), 0);
      
      const daysInMonth = getDaysInMonth(targetDate);
      let fixedCosts = { 
        lease: 0, 
        insurance: 0, 
        crew_fixed: totalMonthlySalary / daysInMonth, 
        overhead: (parseFloat(params.overhead_cost_month_usd) || 0) / daysInMonth 
      };

      fleet.forEach(ac => {
        const eis = new Date(ac.eis_date);
        const redel = new Date(ac.redelivery_date);
        if (targetDate >= eis && targetDate <= redel) {
          fixedCosts.lease += (parseFloat(ac.lease_cost_monthly_usd) || 0) / daysInMonth;
          fixedCosts.insurance += (parseFloat(params.insurance_cost_per_ac_month_usd) || 0) / daysInMonth;
        }
      });

      // 5. Fetch Traffic for this specific day
      const trafficRes = await pool.query(
        `SELECT dt.origin_id, dt.destination_id, dt.segment, dt.fleet_plan_id,
                MAX(s.rotation_group_id::text) as rotation_group_id, 
                MAX(s.priority) as priority,
                MAX(s.route_category) as route_category,
                SUM(dt.flights) as flights, 
                SUM(dt.block_hours) as block_hours, 
                SUM(dt.flight_cycles) as flight_cycles,
                MAX(dt.distance_km) as distance_km,
                MAX(s.start_date) as start_date
         FROM daily_traffic dt
         LEFT JOIN schedules s ON dt.scenario_id = s.scenario_id 
           AND dt.origin_id = s.origin_id AND dt.destination_id = s.destination_id 
           AND dt.segment = s.full_route_string AND dt.fleet_plan_id = s.fleet_plan_id
         WHERE dt.scenario_id = $1 AND dt.calculation_date = $2
         GROUP BY dt.origin_id, dt.destination_id, dt.segment, dt.fleet_plan_id`,
        [id, dateStr]
      );

      // Fetch airport codes once for fast lookup
      const airportsRes = await pool.query('SELECT id, code FROM airports');
      const airportMap = {};
      airportsRes.rows.forEach(a => airportMap[a.id] = a.code);

      console.log(`[Analysis] Found ${trafficRes.rows.length} legs for ${dateStr}`);

      const legs = [];
      let totalLegRevenue = 0;
      let totalLegCost = 0;

      const seasonalityIndex = FlightCalculator.calculateSeasonalityIndex(
        targetDate.getMonth() + 1,
        params.seasonality_constant,
        params.seasonality_slope
      );

      for (const row of trafficRes.rows) {
        const ac = fleet.find(f => f.fp_id === row.fleet_plan_id);
        const category = row.route_category || 'jkt_one_leg';
        const growth = ScenarioCalculator.getGrowthRateForCategory(category, params);

        const fareGrowth = parseFloat(params.fare_growth_rate_annual) || 0;
        
        let revenue = 0;
        let grownUplift = 0;
        const manifest = [];
        const originCode = airportMap[row.origin_id] || '';
        const destCode = airportMap[row.destination_id] || '';

        const mKey = `${row.origin_id}-${row.destination_id}-${row.fleet_plan_id}-${row.segment}`;
        const items = manifestAuditMap[mKey] || [];

        const rotationStartDate = row.start_date ? new Date(row.start_date) : goLiveDate;
        const yearsSinceRotationStart = Math.max(0, (targetDate - rotationStartDate) / (1000 * 60 * 60 * 24 * 365.25));

        let totalDemandKg = 0;
        const processedItems = items.map(item => {
           const grownWeight = parseFloat(item.weight_kg) * Math.pow(1 + growth, yearsSinceRotationStart) * seasonalityIndex;
           const grownPrice = parseFloat(item.yield_usd_per_kg) * Math.pow(1 + fareGrowth, yearsSinceRotationStart);
           totalDemandKg += grownWeight;
           return { ...item, grownWeight, grownPrice };
        });

        // Enforce max payload cap
        grownUplift = totalDemandKg;
        let scaleFactor = 1.0;
        if (ac?.max_payload_kg && totalDemandKg > parseFloat(ac.max_payload_kg)) {
           grownUplift = parseFloat(ac.max_payload_kg);
           scaleFactor = grownUplift / totalDemandKg;
        }

        if (processedItems.length > 0) {
           processedItems.forEach(item => {
              const weight = item.grownWeight * scaleFactor;
              
              // Only attribute revenue to the LEG where the cargo is first uplifted (True Origin).
              // This prevents double-counting in transit segments in the analysis drawer.
              const isOriginLeg = String(item.od_origin_id) === String(row.origin_id);
              if (isOriginLeg) {
                revenue += weight * item.grownPrice;
              }

              manifest.push({
                 type: item.is_transit ? 'Transit' : 'Direct',
                 od: `${airportMap[item.od_origin_id] || originCode}-${airportMap[item.od_destination_id] || destCode}`,
                 weight: weight,
                 price: item.grownPrice,
                 is_transit: item.is_transit
              });
           });
        }

        // Recalculate block hours locally if database has 0, as a fallback (Distance / Speed)
        let effectiveBH = parseFloat(row.block_hours) || 0;
        const speed = parseFloat(ac?.speed_knots) || 450; // Fallback to 450kts if missing

        if (effectiveBH === 0 && (parseFloat(row.distance_km) || 0) > 0) {
          effectiveBH = FlightCalculator.calculateBlockHours(
            parseFloat(row.distance_km), 
            speed, 
            parseFloat(params.avg_taxi_time_hours) || 0.25, 
            parseFloat(params.non_linear_flight_path_effect_pct) || 1.05
          );
        }

        console.log(`[Audit-BH] ${row.segment}: Dist=${row.distance_km}, Speed=${speed}, Result=${effectiveBH}`);

        const fuel = ac ? FlightCalculator.calculateFuelCost(effectiveBH, parseFloat(ac.fuel_burn_liter_per_hour) || 0, parseFloat(params.fuel_price_idr_per_liter) || 0, parseFloat(params.usd_to_idr_rate) || 0) : 0;
        const gh = (parseFloat(row.flights) || 0) * (parseFloat(params.ground_handling_fee_usd) || 0);
        const crew = effectiveBH * (
          (parseFloat(params.pilot_fata_per_hour_usd) || 0) + (parseFloat(params.pilot_afb_per_hour_usd) || 0) + (parseFloat(params.pilot_lot_per_hour_usd) || 0) +
          (parseFloat(params.fo_fata_per_hour_usd) || 0) + (parseFloat(params.fo_afb_per_hour_usd) || 0) + (parseFloat(params.fo_lot_per_hour_usd) || 0)
        );

        const legDoc = (parseFloat(fuel) || 0) + (parseFloat(gh) || 0) + (parseFloat(crew) || 0);

        legs.push({
          segment: row.segment,
          origin_code: originCode,
          dest_code: destCode,
          ac_number: ac?.aircraft_number || '?',
          ac_type: ac?.aircraft_type_name || '?',
          block_hours: effectiveBH,
          uplift_kg: grownUplift,
          manifest: manifest,
          revenue: parseFloat(revenue) || 0,
          fuel: parseFloat(fuel) || 0,
          handling: parseFloat(gh) || 0,
          crew: parseFloat(crew) || 0,
          total_doc: legDoc,
          fleet_plan_id: row.fleet_plan_id,
          rotation_group_id: row.rotation_group_id,
          priority: row.priority,
          route_category: category,
          distance_km: row.distance_km || 0
        });
      }

      // Proration is already applied by the simulation engine when writing to daily_revenue.
      // No re-proration needed here.

      // Recalculate totals after proration - Safely handle possible NaN
      totalLegRevenue = legs.reduce((sum, l) => sum + parseFloat(l.revenue || 0), 0);
      totalLegCost = legs.reduce((sum, l) => sum + parseFloat(l.fuel || 0) + parseFloat(l.handling || 0) + parseFloat(l.crew || 0), 0);

      // Final sort for display
      legs.sort((a, b) => a.segment.localeCompare(b.segment));

      // 6. Maintenance Events
      const mtxRes = await pool.query(
        `SELECT met.event_name, COALESCE(ml.actual_cost_usd, met.event_cost_usd) as cost 
         FROM maintenance_log ml 
         JOIN maintenance_event_types met ON ml.event_type_id = met.id 
         JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
         WHERE fp.scenario_id = $1 AND ml.due_date = $2`, 
        [id, dateStr]
      );
      const mtxCost = mtxRes.rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

      const totalFixed = fixedCosts.lease + fixedCosts.insurance + fixedCosts.crew_fixed + fixedCosts.overhead;

      return {
        date: dateStr,
        summary: {
          revenue: totalLegRevenue,
          cost: totalLegCost + totalFixed + mtxCost,
          profit: totalLegRevenue - (totalLegCost + totalFixed + mtxCost)
        },
        fixed_costs: fixedCosts,
        legs: legs,
        maintenance: mtxRes.rows
      };

    } catch (error) {
      console.error('Error in daily analysis:', error);
      console.error(error.stack);
      throw new Error('Failed to analyze flight costs');
    }
  }

  /**
   * Internal helper for IRR calculation using Secant method
   */
  static internalCalculateIRR(cashflows, guess = 0.1) {
    const maxIters = 100;
    const precision = 1e-7;
    
    const getNPV = (rate) => {
      let npv = 0;
      for (let i = 0; i < cashflows.length; i++) {
        npv += cashflows[i] / Math.pow(1 + rate, i);
      }
      return npv;
    };

    let x0 = guess;
    let x1 = guess + 0.01;
    
    for (let i = 0; i < maxIters; i++) {
      const f0 = getNPV(x0);
      const f1 = getNPV(x1);
      
      if (Math.abs(f1 - f0) < precision) break;
      
      const x2 = x1 - f1 * (x1 - x0) / (f1 - f0);
      if (Math.abs(x2 - x1) < precision) return x2;
      
      x0 = x1;
      x1 = x2;
    }
    return x1;
  }
}

module.exports = DailyPnLService;
