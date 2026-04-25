const { addDays, differenceInDays, startOfMonth, endOfMonth, format, eachDayOfInterval } = require('date-fns');
const FlightCalculator = require('./flightCalculator');
const RevenueCalculator = require('./revenueCalculator');
const CostCalculator = require('./costCalculator');
const PnLCalculator = require('./pnlCalculator');
const pool = require('../database/pool');

class ScenarioCalculator {
  /**
   * Main method to calculate entire scenario
   * Pre-calculates all daily traffic, revenue, and monthly P&L
   * @param {string} scenarioId - UUID of scenario
   * @returns {Object} Calculation summary
   */
  static async calculateScenario(scenarioId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Step 1: Load scenario data
      const scenarioData = await this.loadScenarioData(client, scenarioId);

      // Step 1.5: Validate scenario data
      this.validateScenarioData(scenarioData);

      // Step 2: Generate date range (Start from Go Live, normalized to midnight)
      const dateRange = this.generateDateRange(
        scenarioData.scenario.go_live_date,
        scenarioData.scenario.base_date,
        60 // 5 years
      );

      // Step 3: Clear existing calculations
      await this.clearExistingCalculations(client, scenarioId);

      // Step 4: Calculate daily traffic and revenue with stateful triggers
      const dailyResults = await this.calculateDailyTrafficAndRevenue(
        client,
        scenarioId,
        scenarioData,
        dateRange
      );

      // Step 4.5: Save simulated maintenance events to the database so the frontend can display them
      for (const ev of dailyResults.triggeredEvents) {
        await client.query(
          `INSERT INTO maintenance_log 
           (fleet_plan_id, event_type_id, due_date, status)
           VALUES ($1, $2, $3, $4)`,
          [ev.fleet_plan_id, ev.event_type_id, ev.due_date, ev.status]
        );
      }

      // Step 4.6: Validate Crew Compliance (Gatekeeper)
      await this.validateCrewFeasibility(client, scenarioId, scenarioData);

      // Step 5: Calculate monthly P&L using aggregated daily data
      const monthlyPnL = await this.calculateMonthlyPnL(
        client,
        scenarioId,
        scenarioData,
        dateRange,
        dailyResults.triggeredEvents
      );

      // Step 6: Calculate financial metrics (NPV, IRR, Payback)
      const financialMetrics = this.calculateFinancialMetrics(
        monthlyPnL,
        scenarioData.parameters.cost_of_capital
      );

      await client.query('COMMIT');

      return {
        success: true,
        scenarioId,
        summary: {
          totalDays: dailyResults.totalDays,
          totalMonths: monthlyPnL.length,
          totalRevenue: monthlyPnL.reduce((sum, m) => sum + m.totalRevenue, 0),
          totalCost: monthlyPnL.reduce((sum, m) => sum + m.totalCost, 0),
          totalProfit: monthlyPnL.reduce((sum, m) => sum + m.profitLoss, 0),
          ...financialMetrics
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load all scenario data
   */
  static async loadScenarioData(client, scenarioId) {
    // Load scenario
    const scenarioResult = await client.query(
      'SELECT * FROM scenarios WHERE id = $1',
      [scenarioId]
    );

    if (scenarioResult.rows.length === 0) {
      throw new Error('Scenario not found');
    }

    // Load parameters (inherited from master if no scenario override)
    const paramsResult = await client.query(
      `SELECT sp.*, mp.*, 
         COALESCE(sp.seasonality_constant, mp.seasonality_constant) as seasonality_constant,
         COALESCE(sp.seasonality_slope, mp.seasonality_slope) as seasonality_slope,
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
      [scenarioId]
    );

    // Load fleet plans with initial utilization
    const fleetResult = await client.query(
      `SELECT fp.*, at.*, fp.id as id 
       FROM fleet_plans fp
       JOIN aircraft_types at ON fp.aircraft_type_id = at.id
       WHERE fp.scenario_id = $1
       ORDER BY fp.aircraft_number`,
      [scenarioId]
    );

    // Load schedules
    const schedulesResult = await client.query(
      `SELECT s.*, 
              (6371 * acos(
                cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
                cos(radians(d.longitude) - radians(o.longitude)) + 
                sin(radians(o.latitude)) * sin(radians(d.latitude))
              )) as distance_km,
              o.code as origin_code, d.code as dest_code,
              o.country as origin_country, d.country as dest_country
       FROM schedules s
       JOIN airports o ON s.origin_id = o.id
       JOIN airports d ON s.destination_id = d.id
       WHERE s.scenario_id = $1`,
      [scenarioId]
    );

    // Load pricing (Master with Scenario Overrides)
    const pricingResult = await client.query(
      `SELECT 
          COALESCE(p.origin_id, mp.origin_id) as origin_id,
          COALESCE(p.destination_id, mp.destination_id) as destination_id,
          COALESCE(p.segment, mp.segment) as segment,
          COALESCE(p.fare_usd, mp.fare_usd) as fare_usd
       FROM master_pricing mp
       LEFT JOIN pricing p ON p.scenario_id = $1 
          AND p.origin_id = mp.origin_id 
          AND p.destination_id = mp.destination_id 
          AND (p.segment = mp.segment OR (p.segment IS NULL AND mp.segment IS NULL))
       UNION
       SELECT origin_id, destination_id, segment, fare_usd
       FROM pricing 
       WHERE scenario_id = $1`,
      [scenarioId]
    );

    // Load holidays
    const holidaysResult = await client.query(
      'SELECT * FROM holidays WHERE scenario_id = $1',
      [scenarioId]
    );

    // Load airport fees (Master with Scenario Overrides)
    const feesResult = await client.query(
      `SELECT 
         a.id as airport_id, a.code as airport_code,
         COALESCE(saf.landing_fee_usd, a.landing_fee_usd) as landing_fee_usd,
         COALESCE(saf.parking_fee_usd, a.parking_fee_usd) as parking_fee_usd,
         COALESCE(saf.navigation_fee_usd, a.navigation_fee_usd) as navigation_fee_usd
       FROM airports a
       LEFT JOIN scenario_airport_fees saf ON a.id = saf.airport_id AND saf.scenario_id = $1`,
      [scenarioId]
    );

    // Load maintenance log (Manual overrides or completed historical events)
    const maintenanceLogResult = await client.query(
      `SELECT ml.fleet_plan_id, ml.due_date, ml.status,
              met.id as event_type_id, met.event_name, met.event_cost_usd, met.downtime_days
       FROM maintenance_log ml
       JOIN maintenance_event_types met ON ml.event_type_id = met.id
       JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
       WHERE fp.scenario_id = $1
         AND ml.status IN ('scheduled', 'completed')`,
      [scenarioId]
    );

    // Load initial accomplishment baselines (Last Done state)
    const initialMtxResult = await client.query(
      `SELECT fim.*, met.event_name, met.interval_months, met.interval_block_hours, 
              met.interval_flight_cycles, met.interval_apu_hours, met.event_cost_usd, met.downtime_days
       FROM fleet_initial_mtx fim
       JOIN maintenance_event_types met ON fim.event_type_id = met.id
       JOIN fleet_plans fp ON fim.fleet_plan_id = fp.id
       WHERE fp.scenario_id = $1`,
      [scenarioId]
    );

    // Group initial baselines by fleet_plan_id
    const initialBaselines = {};
    initialMtxResult.rows.forEach(row => {
      if (!initialBaselines[row.fleet_plan_id]) initialBaselines[row.fleet_plan_id] = [];
      initialBaselines[row.fleet_plan_id].push(row);
    });

    // Load schedule manifest items
    const manifestResult = await client.query(
      `SELECT sm.* 
       FROM schedule_manifest sm
       JOIN schedules s ON sm.schedule_id = s.id
       WHERE s.scenario_id = $1`,
      [scenarioId]
    );

    const manifestMap = {};
    manifestResult.rows.forEach(row => {
      if (!manifestMap[row.schedule_id]) manifestMap[row.schedule_id] = [];
      manifestMap[row.schedule_id].push(row);
    });

    // Load all maintenance event types (for the simulation engine's trigger logic)
    const allEventTypesResult = await client.query(
      `SELECT met.*, at.id as aircraft_type_id
       FROM maintenance_event_types met
       JOIN aircraft_types at ON met.aircraft_type_id = at.id
       ORDER BY met.aircraft_type_id, met.event_name`
    );

    const parameters = paramsResult.rows[0] || {};
    // Ensure all numeric fields are parsed as numbers
    Object.keys(parameters).forEach(key => {
      if (typeof parameters[key] === 'string' && !isNaN(parameters[key]) && parameters[key].trim() !== '' && key !== 'id' && key !== 'scenario_id') {
        parameters[key] = parseFloat(parameters[key]);
      }
    });

    const crewResult = await client.query(
      'SELECT * FROM crew_members WHERE scenario_id = $1',
      [scenarioId]
    );

    return {
      scenario: scenarioResult.rows[0],
      parameters,
      fleet: fleetResult.rows,
      schedules: schedulesResult.rows.map(s => ({
        ...s,
        manifest_items: manifestMap[s.id] || []
      })),
      pricing: pricingResult.rows,
      holidays: holidaysResult.rows,
      airportFees: feesResult.rows,
      maintenanceLog: maintenanceLogResult.rows,
      initialBaselines,
      allEventTypes: allEventTypesResult.rows,
      crewMembers: crewResult.rows
    };
  }

  /**
   * Validate scenario data to prevent calculation errors
   */
  static validateScenarioData(data) {
    const { scenario, fleet, schedules, parameters } = data;

    // 1. EIS validation - Removed local constraint to allow fleet expansion
    // Simulation engine handles aircraft entry individually based on their dates.

    // 2. Schedule match fleet
    const fleetIds = new Set(fleet.map(f => f.id));
    const invalidSchedules = schedules.filter(s => !fleetIds.has(s.fleet_plan_id));
    if (invalidSchedules.length > 0) {
      throw new Error(`Found ${invalidSchedules.length} schedules with an invalid or missing aircraft assignment.`);
    }

  }

  /**
   * Build a Map<fleet_plan_id, Set<dateStr>> of grounded dates derived from
   * the maintenance_log downtime_days field.
   * A date is grounded if it falls within [due_date, due_date + downtime_days - 1].
   */
  static buildGroundedDatesMap(maintenanceLog) {
    const map = new Map();
    if (!maintenanceLog || maintenanceLog.length === 0) return map;

    for (const event of maintenanceLog) {
      const downtime = parseInt(event.downtime_days) || 0;
      if (downtime <= 0) continue;

      const dueDate = new Date(event.due_date);
      dueDate.setHours(0, 0, 0, 0);

      if (!map.has(event.fleet_plan_id)) map.set(event.fleet_plan_id, new Set());
      const dateSet = map.get(event.fleet_plan_id);

      for (let d = 0; d < downtime; d++) {
        dateSet.add(format(addDays(dueDate, d), 'yyyy-MM-dd'));
      }
    }
    return map;
  }

  /**
   * Helper to get traffic growth rate for a given route category
   */
  static getGrowthRateForCategory(category, params) {
    return parseFloat(params.traffic_growth_rate_annual) || 0;
  }

  /**
   * Generate date range for calculations (Start from Base Date)
   */
  static generateDateRange(goLiveDate, baseDate, months) {
    const start = new Date(new Date(baseDate).setHours(0, 0, 0, 0));
    const end = addDays(start, months * 30.44); // More accurate month average

    return eachDayOfInterval({ start, end });
  }

  /**
   * Clear existing calculations for scenario
   */
  static async clearExistingCalculations(client, scenarioId) {
    await client.query('DELETE FROM daily_traffic WHERE scenario_id = $1', [scenarioId]);
    await client.query('DELETE FROM daily_revenue WHERE scenario_id = $1', [scenarioId]);
    await client.query('DELETE FROM monthly_pnl WHERE scenario_id = $1', [scenarioId]);
    await client.query(
      `DELETE FROM maintenance_log 
       WHERE fleet_plan_id IN (SELECT id FROM fleet_plans WHERE scenario_id = $1) 
       AND status = 'simulated'`, 
      [scenarioId]
    );
  }

  /**
   * Calculate daily traffic and revenue with stateful maintenance triggers
   */
  static async calculateDailyTrafficAndRevenue(client, scenarioId, scenarioData, dateRange) {
    let totalDays = 0;
    const batchSize = 100;
    let trafficBatch = [];
    let revenueBatch = [];

    const goLiveDate = new Date(scenarioData.scenario.go_live_date).setHours(0,0,0,0);

    // 1. Initialize state for each aircraft
    const aircraftStates = new Map();
    scenarioData.fleet.forEach(ac => {
      // Get baselines for this aircraft
      const baselines = scenarioData.initialBaselines[ac.id] || [];
      const sinceLastMap = new Map();

      // Seed with initial 'Since Last' values (consumed life)
      baselines.forEach(b => {
        sinceLastMap.set(b.event_type_id, {
          fh: parseFloat(b.last_done_hours || 0),
          fc: parseInt(b.last_done_cycles || 0),
          apu: parseFloat(b.last_done_apu_hours || 0),
          date: new Date(b.last_done_date || scenarioData.scenario.base_date)
        });
      });

      aircraftStates.set(ac.id, {
        sinceLast: sinceLastMap, // Map<event_type_id, { fh, fc, apu, date }>
        groundedUntil: null, 
        triggeredEvents: []   
      });
    });

    // 2. Identify all possible maintenance event types (dict) for each AC type
    const eventTypesByAcType = {};
    scenarioData.allEventTypes.forEach(et => {
      if (!eventTypesByAcType[et.aircraft_type_id]) eventTypesByAcType[et.aircraft_type_id] = [];
      eventTypesByAcType[et.aircraft_type_id].push(et);
    });

    for (const date of dateRange) {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayTime = date.getTime();
      
      // Check if it's a holiday period
      const isHoliday = FlightCalculator.isHolidayPeriod(date, scenarioData.holidays);
      if (isHoliday) continue;

      // Get day of week
      const dayOfWeek = date.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayOfWeek];

      // Identify active fleet and check grounding
      const activeFleet = scenarioData.fleet.filter(ac => {
        const eisStr = format(new Date(ac.eis_date), 'yyyy-MM-dd');
        const redelStr = format(new Date(ac.redelivery_date), 'yyyy-MM-dd');
        const state = aircraftStates.get(ac.id);

        // Grounding logic
        if (state.groundedUntil && dayTime <= state.groundedUntil.getTime()) {
           return false;
        }
        return dateStr >= eisStr && dateStr <= redelStr;
      });

      if (activeFleet.length === 0) {
        totalDays++;
        continue;
      }

      // COMMERCIAL OPS CHECK: Revenue only starts at Go Live
      const isPostGoLive = dayTime >= goLiveDate;

      // Find schedules active on this day
      const activeSchedules = scenarioData.schedules.filter(sched => {
        const schedStartStr = format(new Date(sched.start_date || scenarioData.scenario.go_live_date), 'yyyy-MM-dd');
        const schedEndStr = format(new Date(sched.end_date || '2099-12-31'), 'yyyy-MM-dd');
        return sched[dayName] === true && dateStr >= schedStartStr && dateStr <= schedEndStr;
      });

      // Calculate traffic and revenue for each schedule
      // Group by aircraft to handle rotation-based proration
      const dayRevenueEvents = []; // Temp storage for this day's results

      for (const schedule of activeSchedules) {
        const aircraft = activeFleet.find(ac => ac.id === schedule.fleet_plan_id);
        if (!aircraft) continue;
        const state = aircraftStates.get(aircraft.id);

        // Calculate block hours
        const blockHours = FlightCalculator.calculateBlockHours(
          schedule.distance_km,
          aircraft.speed_knots,
          scenarioData.parameters.avg_taxi_time_hours,
          scenarioData.parameters.non_linear_flight_path_effect_pct
        ) || 0;

        // UPDATE state: Add daily utilization to all 'Since Last' counters
        const acTypeEvents = eventTypesByAcType[aircraft.aircraft_type_id] || [];
        acTypeEvents.forEach(et => {
           if (!state.sinceLast.has(et.id)) {
              state.sinceLast.set(et.id, { fh: 0, fc: 0, apu: 0, date: new Date(scenarioData.scenario.base_date) });
           }
           const counters = state.sinceLast.get(et.id);
           counters.fh += blockHours;
           counters.fc += 1;
           counters.apu += (parseFloat(scenarioData.parameters.apu_op_hour_ratio) || 1.0);
        });

          let revenue = 0;
          let totalUplift = 0;
          const monthNumber = date.getMonth() + 1;
          const seasonalityIndex = FlightCalculator.calculateSeasonalityIndex(
            monthNumber,
            scenarioData.parameters.seasonality_constant,
            scenarioData.parameters.seasonality_slope
          );


          const category = schedule.route_category || 'jkt_one_leg';
          if (isPostGoLive) {
            if (schedule.manifest_items && schedule.manifest_items.length > 0) {
              const daysSinceBase = Math.floor((dayTime - new Date(schedule.start_date).getTime()) / (1000 * 60 * 60 * 24));
              const yearsSinceBase = daysSinceBase / 365.25;
              const growth = ScenarioCalculator.getGrowthRateForCategory(category, scenarioData.parameters);
              const fGrowth = parseFloat(scenarioData.parameters.fare_growth_rate_annual) || 0;

              let totalDemandKg = 0;
              const processedItems = schedule.manifest_items.map(item => {
                const grownWeight = parseFloat(item.weight_kg) * Math.pow(1 + growth, yearsSinceBase) * seasonalityIndex;
                const grownYield = parseFloat(item.yield_usd_per_kg) * Math.pow(1 + fGrowth, yearsSinceBase);
                totalDemandKg += grownWeight;

                // Only attribute revenue to the LEG where the cargo is first uplifted (True Origin).
                // This prevents double-counting in transit segments. 
                // The proration logic below will then distribute this single-counted revenue across legs.
                const isOriginLeg = String(item.od_origin_id) === String(schedule.origin_id);
                const itemRevenue = isOriginLeg ? (grownWeight * grownYield) : 0;

                return { grownWeight, grownYield, itemRevenue };
              });

              let scaleFactor = 1.0;
              if (aircraft.max_payload_kg && totalDemandKg > parseFloat(aircraft.max_payload_kg)) {
                scaleFactor = parseFloat(aircraft.max_payload_kg) / totalDemandKg;
                totalUplift = parseFloat(aircraft.max_payload_kg);
              } else {
                totalUplift = totalDemandKg;
              }

              processedItems.forEach(item => {
                revenue += (parseFloat(item.itemRevenue || 0) * scaleFactor);
              });
            }
          }

          dayRevenueEvents.push({
              scenario_id: scenarioId, calculation_date: dateStr,
              origin_id: schedule.origin_id, destination_id: schedule.destination_id,
              segment: schedule.full_route_string, revenue_usd: revenue,
              fleet_plan_id: schedule.fleet_plan_id,
              rotation_group_id: schedule.rotation_group_id,
              priority: schedule.priority,
              route_category: category,
              distance_km: parseFloat(schedule.distance_km) || 0
            });

            trafficBatch.push({
              scenario_id: scenarioId, calculation_date: dateStr,
              fleet_plan_id: schedule.fleet_plan_id, origin_id: schedule.origin_id,
              destination_id: schedule.destination_id, segment: schedule.full_route_string,
              flights: 1, block_hours: blockHours || 0, flight_cycles: 1,
              distance_km: parseFloat(schedule.distance_km) || 0
            });
          }

      // --- APPLY PRORATION LOGIC ---
      // For JKT Two Legs, shift 50% revenue to the previous priority leg in the rotation
      if (dayRevenueEvents.length > 0) {
        const eventsByAircraft = {};
        dayRevenueEvents.forEach(e => {
          if (!eventsByAircraft[e.fleet_plan_id]) eventsByAircraft[e.fleet_plan_id] = [];
          eventsByAircraft[e.fleet_plan_id].push(e);
        });

        Object.values(eventsByAircraft).forEach(acEvents => {
          acEvents.sort((a, b) => a.priority - b.priority);
          acEvents.forEach((event, idx) => {
            if (event.route_category === 'jkt_two_legs' && event.priority > 1) {
              const prev = acEvents.find(e => e.rotation_group_id === event.rotation_group_id && e.priority === event.priority - 1);
              if (prev) {
                const totalDist = (parseFloat(prev.distance_km) || 0) + (parseFloat(event.distance_km) || 0);
                if (totalDist > 0) {
                  const totalRevenue = parseFloat(prev.revenue_usd || 0) + parseFloat(event.revenue_usd || 0);
                  const prevShare = totalRevenue * (parseFloat(prev.distance_km) / totalDist);
                  const eventShare = totalRevenue * (parseFloat(event.distance_km) / totalDist);
                  
                  prev.revenue_usd = prevShare;
                  event.revenue_usd = eventShare;
                }
              }
            }
          });
        });

        // Push finalized events to revenueBatch
        dayRevenueEvents.forEach(e => {
          revenueBatch.push({
            scenario_id: e.scenario_id, calculation_date: e.calculation_date,
            origin_id: e.origin_id, destination_id: e.destination_id,
            segment: e.segment, revenue_usd: e.revenue_usd
          });
        });
      }

      // 3. Maintenance Logic: Check for triggered events at the end of every day
      for (const [acId, state] of aircraftStates.entries()) {
        const aircraft = scenarioData.fleet.find(a => a.id === acId);
        const eventDict = eventTypesByAcType[aircraft.aircraft_type_id] || [];
        
        for (const eventType of eventDict) {
          const current = state.sinceLast.get(eventType.id) || { fh: 0, fc: 0, apu: 0, date: new Date(scenarioData.scenario.base_date) };
          
          let triggered = false;
          if (eventType.interval_block_hours && current.fh >= eventType.interval_block_hours) triggered = true;
          if (eventType.interval_flight_cycles && current.fc >= eventType.interval_flight_cycles) triggered = true;
          if (eventType.interval_apu_hours && current.apu >= eventType.interval_apu_hours) triggered = true;
          if (eventType.interval_months && differenceInDays(date, current.date) >= (eventType.interval_months * 30)) triggered = true;

          if (triggered) {
            const downtime = parseInt(eventType.downtime_days) || 0;
            if (downtime > 0) {
              state.groundedUntil = addDays(date, downtime);
            }
            // RESET 'Since Last' counter
            state.sinceLast.set(eventType.id, {
              fh: 0,
              fc: 0,
              apu: 0,
              date: new Date(date)
            });
            // Record event for P&L tracking and persistence
            state.triggeredEvents.push({
              fleet_plan_id: acId,
              due_date: format(date, 'yyyy-MM-dd'),
              event_type_id: eventType.id,
              event_name: eventType.event_name,
              event_cost_usd: eventType.event_cost_usd,
              downtime_days: downtime,
              status: 'simulated'
            });
          }
        }
      }

      // Batch DB insertion
      if (trafficBatch.length >= batchSize) {
        await this.insertDailyTrafficBatch(client, trafficBatch);
        trafficBatch = [];
      }
      if (revenueBatch.length >= batchSize) {
        await this.insertDailyRevenueBatch(client, revenueBatch);
        revenueBatch = [];
      }
      totalDays++;
    }

    // Insert remaining batches
    if (trafficBatch.length > 0) await this.insertDailyTrafficBatch(client, trafficBatch);
    if (revenueBatch.length > 0) await this.insertDailyRevenueBatch(client, revenueBatch);

    // Return the aggregated triggered events to use for P&L
    const allTriggeredEvents = [];
    aircraftStates.forEach(state => allTriggeredEvents.push(...state.triggeredEvents));
    
    return { totalDays, triggeredEvents: allTriggeredEvents };
  }

  /**
   * Insert daily traffic batch
   */
  static async insertDailyTrafficBatch(client, batch) {
    const values = batch.map(row =>
      `('${row.scenario_id}', '${row.calculation_date}', '${row.fleet_plan_id}', ` +
      `'${row.origin_id}', '${row.destination_id}', '${row.segment}', ${row.flights}, ${row.block_hours}, ` +
      `${row.flight_cycles}, ${row.distance_km})`
    ).join(',');

    const query = `INSERT INTO daily_traffic 
       (scenario_id, calculation_date, fleet_plan_id, origin_id, destination_id, segment, flights, block_hours, flight_cycles, distance_km) 
       VALUES ${values}
       ON CONFLICT (scenario_id, calculation_date, fleet_plan_id, origin_id, destination_id, segment) 
       DO UPDATE SET flights = EXCLUDED.flights, block_hours = EXCLUDED.block_hours`;
    
    await client.query(query);
  }

  /**
   * Insert daily revenue batch
   */
  static async insertDailyRevenueBatch(client, batch) {
    const values = batch.map(row =>
      `('${row.scenario_id}', '${row.calculation_date}', '${row.origin_id}', ` +
      `'${row.destination_id}', '${row.segment}', ${row.revenue_usd})`
    ).join(',');

    await client.query(
      `INSERT INTO daily_revenue 
       (scenario_id, calculation_date, origin_id, destination_id, segment, revenue_usd) 
       VALUES ${values}
       ON CONFLICT (scenario_id, calculation_date, origin_id, destination_id, segment) 
       DO UPDATE SET revenue_usd = EXCLUDED.revenue_usd`
    );
  }

  /**
   * Calculate monthly P&L using Maintenance Reserve (Accrual) model
   */
  static async calculateMonthlyPnL(client, scenarioId, scenarioData, dateRange, simulatedEvents = []) {
    const monthlyResults = [];

    // Group by month
    const months = new Set(dateRange.map(d => format(d, 'yyyy-MM-01')));

    for (const monthStr of Array.from(months).sort()) {
      const monthDate = new Date(monthStr);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      // Get monthly aggregates from daily_traffic
      const trafficResult = await client.query(
        `SELECT 
           SUM(flights) as total_flights,
           SUM(block_hours) as total_block_hours,
           SUM(flight_cycles) as total_flight_cycles
         FROM daily_traffic
         WHERE scenario_id = $1 
           AND calculation_date >= $2 
           AND calculation_date <= $3`,
        [scenarioId, format(monthStart, 'yyyy-MM-dd'), format(monthEnd, 'yyyy-MM-dd')]
      );

      // Get monthly revenue
      const revenueResult = await client.query(
        `SELECT SUM(revenue_usd) as total_revenue
         FROM daily_revenue
         WHERE scenario_id = $1 
           AND calculation_date >= $2 
           AND calculation_date <= $3`,
        [scenarioId, format(monthStart, 'yyyy-MM-dd'), format(monthEnd, 'yyyy-MM-dd')]
      );

      const blockHours = parseFloat(trafficResult.rows[0].total_block_hours) || 0;
      const flightCycles = parseInt(trafficResult.rows[0].total_flight_cycles) || 0;
      const revenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;

      // NEW: Calculate monthly airport fees (Landing, Parking, Nav)
      const feesAggrResult = await client.query(
        `SELECT 
            SUM(t.flights * COALESCE(saf.landing_fee_usd, a.landing_fee_usd)) as total_landing,
            SUM(t.flights * COALESCE(saf.parking_fee_usd, a.parking_fee_usd)) as total_parking,
            SUM(t.flights * COALESCE(saf.navigation_fee_usd, a.navigation_fee_usd)) as total_nav
         FROM daily_traffic t
         JOIN airports a ON t.destination_id = a.id
         LEFT JOIN scenario_airport_fees saf ON a.id = saf.airport_id AND saf.scenario_id = t.scenario_id
         WHERE t.scenario_id = $1 
           AND t.calculation_date >= $2 
           AND t.calculation_date <= $3`,
        [scenarioId, format(monthStart, 'yyyy-MM-dd'), format(monthEnd, 'yyyy-MM-dd')]
      );

      const monthFees = {
        landingFee: parseFloat(feesAggrResult.rows[0].total_landing) || 0,
        parkingFee: parseFloat(feesAggrResult.rows[0].total_parking) || 0,
        navigationFee: parseFloat(feesAggrResult.rows[0].total_nav) || 0
      };

      // Count active aircraft
      const activeAircraft = scenarioData.fleet.filter(ac => {
        const eisDate = new Date(ac.eis_date);
        const redelDate = new Date(ac.redelivery_date);
        return monthDate >= eisDate && monthDate <= redelDate;
      }).length;

      // Calculate total lease cost and fuel cost accurately for heterogeneous fleet
      const activeFleet = scenarioData.fleet.filter(ac => {
        const eisDate = new Date(ac.eis_date);
        const redelDate = new Date(ac.redelivery_date);
        return monthDate >= eisDate && monthDate <= redelDate;
      });

      const totalLeaseCostMonthly = activeFleet.reduce((sum, ac) =>
        sum + (parseFloat(ac.lease_cost_monthly_usd) || 0), 0
      );

      // Get monthly aggregates from daily_traffic per aircraft for fuel calculation
      const trafficPerAircraftResult = await client.query(
        `SELECT 
           fleet_plan_id,
           SUM(block_hours) as total_block_hours
         FROM daily_traffic
         WHERE scenario_id = $1 
           AND calculation_date >= $2 
           AND calculation_date <= $3
         GROUP BY fleet_plan_id`,
        [scenarioId, format(monthStart, 'yyyy-MM-dd'), format(monthEnd, 'yyyy-MM-dd')]
      );

      let totalFuelCost = 0;
      for (const row of trafficPerAircraftResult.rows) {
        const aircraft = scenarioData.fleet.find(ac => ac.id === row.fleet_plan_id);
        if (aircraft) {
          const fuelCost = FlightCalculator.calculateFuelCost(
            parseFloat(row.total_block_hours),
            parseFloat(aircraft.fuel_burn_liter_per_hour),
            scenarioData.parameters.fuel_price_idr_per_liter,
            scenarioData.parameters.usd_to_idr_rate
          );
          totalFuelCost += fuelCost;
        }
      }

      // --- MAINTENANCE CALCULATION (CASH BASIS - MATCHES DAILY P&L) ---
      const mtxAggrResult = await client.query(
        `SELECT SUM(COALESCE(ml.actual_cost_usd, met.event_cost_usd)) as total_mtx
         FROM maintenance_log ml
         JOIN maintenance_event_types met ON ml.event_type_id = met.id
         JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
         WHERE fp.scenario_id = $1 
           AND ml.due_date >= $2 
           AND ml.due_date <= $3
           AND ml.status IN ('scheduled', 'simulated', 'completed', 'overdue')`,
        [scenarioId, format(monthStart, 'yyyy-MM-dd'), format(monthEnd, 'yyyy-MM-dd')]
      );

      const monthlyMaintenanceCost = parseFloat(mtxAggrResult.rows[0].total_mtx) || 0;

      const totalCrewMonthlySalary = scenarioData.crewMembers.reduce((sum, cm) => sum + (parseFloat(cm.monthly_salary_usd) || 0), 0);

      // Prepare cost inputs
      const costInputs = {
        totalLeaseCost: totalLeaseCostMonthly,
        numberOfAircraft: activeAircraft,
        daysInMonth: monthEnd.getDate(),
        isPartialMonth: false,
        newAircraft: scenarioData.fleet.filter(ac => {
          const eis = new Date(ac.eis_date);
          return eis >= monthStart && eis <= monthEnd;
        }).length, 
        aircraftReturning: scenarioData.fleet.filter(ac => {
          const redel = new Date(ac.redelivery_date);
          return redel >= monthStart && redel <= monthEnd;
        }).length,
        eisCost: scenarioData.parameters.eis_cost_usd,
        redelCost: scenarioData.parameters.redelivery_cost_usd,
        insuranceCostPerAC: scenarioData.parameters.insurance_cost_per_ac_month_usd,
        
        // Maintenance: Use the calculated monthly cash outlay
        maintenanceCostOverride: monthlyMaintenanceCost,

        // Crew Expense: Use actual payroll sum
        crewExpenseOverride: totalCrewMonthlySalary,
        
        // Reporting only
        maintenanceEvents: simulatedEvents.filter(ev => {
          return ev.due_date >= format(monthStart, 'yyyy-MM-dd') && ev.due_date <= format(monthEnd, 'yyyy-MM-dd');
        }),

        flightCycles,
        ghFee: scenarioData.parameters.ground_handling_fee_usd,
        blockHours,
        totalFuelCost,
        fuelPriceIDR: scenarioData.parameters.fuel_price_idr_per_liter,
        usdToIDR: scenarioData.parameters.usd_to_idr_rate,
        crewRates: {
          pilotFATA: scenarioData.parameters.pilot_fata_per_hour_usd,
          pilotAFB: scenarioData.parameters.pilot_afb_per_hour_usd,
          pilotLOT: scenarioData.parameters.pilot_lot_per_hour_usd,
          foFATA: scenarioData.parameters.fo_fata_per_hour_usd,
          foAFB: scenarioData.parameters.fo_afb_per_hour_usd,
          foLOT: scenarioData.parameters.fo_lot_per_hour_usd
        },
        crewHOTAC: 0,
        overheadCostMonth: scenarioData.parameters.overhead_cost_month_usd,
        airportFees: [{
           landing_fee_usd: monthFees.landingFee,
           parking_fee_usd: monthFees.parkingFee,
           navigation_fee_usd: monthFees.navigationFee
        }] 
      };

      // Calculate P&L
      const pnl = PnLCalculator.calculateMonthlyPnL({
        monthDate: monthStr,
        numberOfAircraft: activeAircraft,
        blockHours,
        flightCycles,
        revenue,
        costInputs
      });

      // Add break-even analysis
      const breakEven = PnLCalculator.calculateBreakEven({
        totalCost: pnl.totalCost,
        totalRevenue: pnl.totalRevenue,
        blockHours: pnl.blockHours,
        currentLoadFactor: 1 // Default to 1 for now
      });

      pnl.breakEvenLoadFactor = breakEven.breakEvenLoadFactor;
      pnl.breakEvenBlockHours = breakEven.breakEvenBlockHours;

      monthlyResults.push(pnl);

      // Insert into database
      await client.query(
        `INSERT INTO monthly_pnl 
         (scenario_id, month_date, num_aircraft, block_hours, flight_cycles,
          total_revenue_usd, lease_cost_usd, eis_cost_usd, redelivery_cost_usd,
          insurance_cost_usd, maintenance_cost_usd, ground_handling_cost_usd,
          fuel_cost_usd, landing_fee_usd, parking_fee_usd, navigation_fee_usd,
          route_charge_usd, crew_expense_usd, crew_flight_allowance_usd,
          crew_hotac_usd, overhead_cost_usd, total_cost_usd, profit_loss_usd,
          profit_margin, cost_per_bh_usd, break_even_load_factor, break_even_block_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
         ON CONFLICT (scenario_id, month_date) DO UPDATE SET
          total_revenue_usd = EXCLUDED.total_revenue_usd,
          total_cost_usd = EXCLUDED.total_cost_usd,
          profit_loss_usd = EXCLUDED.profit_loss_usd,
          break_even_load_factor = EXCLUDED.break_even_load_factor,
          break_even_block_hours = EXCLUDED.break_even_block_hours`,
        [scenarioId, monthStr, pnl.numberOfAircraft, pnl.blockHours, pnl.flightCycles,
          pnl.totalRevenue, pnl.leaseCost, pnl.eisCost, pnl.redelCost,
          pnl.insuranceCost, pnl.maintenanceCost, pnl.groundHandlingCost,
          pnl.fuelCost, pnl.landingFee, pnl.parkingFee, pnl.navigationFee,
          pnl.routeCharge, pnl.crewExpense, pnl.crewFlightAllowance,
          pnl.crewHOTAC, pnl.overheadCost, pnl.totalCost, pnl.profitLoss,
          pnl.profitMargin, pnl.costPerBH, pnl.breakEvenLoadFactor, pnl.breakEvenBlockHours]
      );
    }

    // Update with cumulative P&L
    const cumulativeResults = PnLCalculator.calculateCumulativePnL(monthlyResults);

    for (const pnl of cumulativeResults) {
      await client.query(
        `UPDATE monthly_pnl 
         SET cumulative_profit_loss_usd = $1
         WHERE scenario_id = $2 AND month_date = $3`,
        [pnl.cumulativeProfitLoss, scenarioId, pnl.monthDate]
      );
    }

    return cumulativeResults;
  }

  /**
   * Calculate financial metrics
   */
  static calculateFinancialMetrics(monthlyPnL, costOfCapital) {
    const cashFlows = monthlyPnL.map(m => m.profitLoss);

    const npv = PnLCalculator.calculateNPV(cashFlows, costOfCapital);
    const irr = PnLCalculator.calculateIRR([0, ...cashFlows], 0.01); 
    const paybackPeriod = PnLCalculator.calculatePaybackPeriod(
      monthlyPnL.map(m => m.cumulativeProfitLoss)
    );
    
    const annualizedIrr = (irr !== null) ? (Math.pow(1 + irr, 12) - 1) : null;

    return {
      npv: Math.round(npv * 100) / 100,
      irr: (annualizedIrr !== null) ? Math.round(annualizedIrr * 10000) / 100 : null, // Annualized percentage
      paybackPeriod
    };
  }

  /**
   * Validate if the simulation is feasible given the available crew
   */
  static async validateCrewFeasibility(client, scenarioId, scenarioData) {
    const { crewMembers, parameters } = scenarioData;
    
    // 1. Calculate Supply (Split by Role)
    const fatigueReserve = parseFloat(parameters.crew_fatigue_reserve_pct) || 0.20;
    
    const pilotCapacity = crewMembers
      .filter(cm => cm.role === 'pilot')
      .reduce((sum, cm) => sum + ((parseFloat(cm.max_duty_hours_per_month) || 100) * (1 - fatigueReserve)), 0);
      
    const foCapacity = crewMembers
      .filter(cm => cm.role === 'first_officer')
      .reduce((sum, cm) => sum + ((parseFloat(cm.max_duty_hours_per_month) || 100) * (1 - fatigueReserve)), 0);

    if (crewMembers.length === 0) {
      throw new Error(`Insufficient Crew: No crew members assigned to this scenario. Please hire pilots and FOs in the Crew tab.`);
    }

    // 2. Calculate Peak Daily Demand (Ensuring peak duty doesn't exceed any individual's limit)
    const peakTrafficResult = await client.query(
      `SELECT calculation_date, fleet_plan_id, SUM(block_hours) as daily_bh, COUNT(*) as legs
       FROM daily_traffic
       WHERE scenario_id = $1
       GROUP BY calculation_date, fleet_plan_id
       ORDER BY daily_bh DESC LIMIT 1`,
      [scenarioId]
    );

    const dutyBuffer = parseFloat(parameters.crew_duty_buffer_hours) || 1.5;
    if (peakTrafficResult.rows.length > 0) {
      const peak = peakTrafficResult.rows[0];
      // Duty Day = Total Block Hours + One Check-in/Check-out Buffer (not per leg)
      const peakDuty = parseFloat(peak.daily_bh) + dutyBuffer;
      // Determine if we have enough sets for a mid-day crew swap
      const crewSets = Math.min(
        crewMembers.filter(cm => cm.role === 'pilot').length,
        crewMembers.filter(cm => cm.role === 'first_officer').length
      );

      // If we only have 1 crew set, the aircraft is limited to their max duty day.
      // If we have 2+ sets, the aircraft can fly "Relay" (Swap) up to a physical limit (e.g., 22h).
      const effectiveDailyLimit = crewSets >= 2 ? 22 : maxDailyAllowed;
      
      if (peakDuty > effectiveDailyLimit) {
        const reason = crewSets >= 2 
          ? `Physically Impossible: Peak duty on ${format(new Date(peak.calculation_date), 'yyyy-MM-dd')} requires ${peakDuty.toFixed(1)}h (incl. buffers). Even with crew swaps, an aircraft cannot exceed a 24h day.`
          : `Compliance Error: Peak duty on ${format(new Date(peak.calculation_date), 'yyyy-MM-dd')} is ${peakDuty.toFixed(1)}h, exceeding your only crew set's ${maxDailyAllowed}h limit. Assign more crew to allow swaps.`;
        throw new Error(reason);
      }
    }

    // 3. Calculate Total Monthly Demand (Consistent with daily: 1 buffer per active aircraft day)
    const trafficAggr = await client.query(
      `SELECT 
         SUM(block_hours) as total_bh, 
         COUNT(DISTINCT (calculation_date, fleet_plan_id)) as total_active_days
       FROM daily_traffic WHERE scenario_id = $1`,
      [scenarioId]
    );
    
    const totalBH = parseFloat(trafficAggr.rows[0].total_bh) || 0;
    const totalActiveDays = parseFloat(trafficAggr.rows[0].total_active_days) || 0;
    const totalMonths = 60; // 5 years
    
    // Total Duty Demand per Role = (BH + Buffers for each start/end of a duty day)
    const monthlyDutyDemand = (totalBH / totalMonths) + ((totalActiveDays / totalMonths) * dutyBuffer);

    // Validate Pilot Seat
    if (monthlyDutyDemand > pilotCapacity) {
      throw new Error(`Crew Shortage (Captains): Your schedule requires ~${monthlyDutyDemand.toFixed(0)} Captain-hours/month. Your team only provides ${pilotCapacity.toFixed(0)} hours. Please hire more Pilots.`);
    }

    // Validate FO Seat
    if (monthlyDutyDemand > foCapacity) {
      throw new Error(`Crew Shortage (First Officers): Your schedule requires ~${monthlyDutyDemand.toFixed(0)} FO-hours/month. Your team only provides ${foCapacity.toFixed(0)} hours. Please hire more First Officers.`);
    }

    return true;
  }
}

module.exports = ScenarioCalculator;
