const pool = require('../database/pool');
const AuditService = require('./auditService');
const ScenarioCalculator = require('../calculations/scenarioCalculator');

class ScenarioService {
  static async getAllScenarios() {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_username
       FROM scenarios s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.is_active = true
       ORDER BY s.created_at DESC`
    );
    return result.rows;
  }

  static async getScenarioById(id) {
    const result = await pool.query(
      `SELECT s.*, u.username as created_by_username
       FROM scenarios s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async createScenario(data, userId) {
    const { name, description, base_date, go_live_date } = data;
    
    const result = await pool.query(
      `INSERT INTO scenarios (name, description, base_date, go_live_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, base_date, go_live_date, userId]
    );

    const newScenario = result.rows[0];

    // Create default parameters for scenario
    await pool.query(
      'INSERT INTO scenario_parameters (scenario_id) VALUES ($1)',
      [newScenario.id]
    );

    // Log action
    await AuditService.log({
      userId,
      scenarioId: newScenario.id,
      tableName: 'scenarios',
      recordId: newScenario.id,
      action: 'CREATE',
      newValue: newScenario
    });

    return newScenario;
  }

  static async updateScenario(id, data, userId) {
    const { name, description, base_date, go_live_date } = data;

    const result = await pool.query(
      `UPDATE scenarios 
       SET name = $1, description = $2, base_date = $3, go_live_date = $4
       WHERE id = $5
       RETURNING *`,
      [name, description, base_date, go_live_date, id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const updatedScenario = result.rows[0];

    // Log action
    await AuditService.log({
      userId,
      scenarioId: id,
      tableName: 'scenarios',
      recordId: id,
      action: 'UPDATE',
      newValue: updatedScenario
    });

    return updatedScenario;
  }

  static async deleteScenario(id, userId) {
    const result = await pool.query(
      'UPDATE scenarios SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Log action
    await AuditService.log({
      userId,
      scenarioId: id,
      tableName: 'scenarios',
      recordId: id,
      action: 'DELETE'
    });
    
    return true;
  }

  static async calculateScenario(id) {
    return await ScenarioCalculator.calculateScenario(id);
  }

  static async getMonthlyPnL(id) {
    const result = await pool.query(
      `SELECT * FROM monthly_pnl
       WHERE scenario_id = $1
       ORDER BY month_date`,
      [id]
    );
    return result.rows;
  }

  static async getParameters(id) {
    const result = await pool.query(
      `SELECT 
          sp.id,
          sp.scenario_id,
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
          COALESCE(sp.fare_growth_rate_annual, mp.fare_growth_rate_annual) as fare_growth_rate_annual,
          sp.seasonality_constant IS NOT NULL as override_seasonality_constant,
          sp.seasonality_slope IS NOT NULL as override_seasonality_slope,
          sp.ground_time_hll_hours IS NOT NULL as override_ground_time_hll_hours,
          sp.ground_time_manual_hours IS NOT NULL as override_ground_time_manual_hours,
          sp.traffic_growth_rate_annual IS NOT NULL as override_traffic_growth_rate_annual,
          sp.fare_growth_rate_annual IS NOT NULL as override_fare_growth_rate_annual,
          sp.eis_cost_usd IS NOT NULL as override_eis_cost_usd,
          sp.redelivery_cost_usd IS NOT NULL as override_redelivery_cost_usd,
          sp.insurance_cost_per_ac_month_usd IS NOT NULL as override_insurance_cost_per_ac_month_usd,
          sp.overhead_cost_month_usd IS NOT NULL as override_overhead_cost_month_usd,
          sp.pilot_annual_salary_usd IS NOT NULL as override_pilot_annual_salary_usd,
          sp.fo_annual_salary_usd IS NOT NULL as override_fo_annual_salary_usd,
          sp.pilot_count_per_ac IS NOT NULL as override_pilot_count_per_ac,
          sp.fo_count_per_ac IS NOT NULL as override_fo_count_per_ac,
          sp.pilot_fata_per_hour_usd IS NOT NULL as override_pilot_fata_per_hour_usd,
          sp.pilot_afb_per_hour_usd IS NOT NULL as override_pilot_afb_per_hour_usd,
          sp.pilot_lot_per_hour_usd IS NOT NULL as override_pilot_lot_per_hour_usd,
          sp.fo_fata_per_hour_usd IS NOT NULL as override_fo_fata_per_hour_usd,
          sp.fo_afb_per_hour_usd IS NOT NULL as override_fo_afb_per_hour_usd,
          sp.fo_lot_per_hour_usd IS NOT NULL as override_fo_lot_per_hour_usd,
          sp.fuel_price_idr_per_liter IS NOT NULL as override_fuel_price_idr_per_liter,
          sp.avg_taxi_time_hours IS NOT NULL as override_avg_taxi_time_hours,
          sp.non_linear_flight_path_effect_pct IS NOT NULL as override_non_linear_flight_path_effect_pct,
          sp.apu_op_hour_ratio IS NOT NULL as override_apu_op_hour_ratio,
          sp.ground_handling_fee_usd IS NOT NULL as override_ground_handling_fee_usd,
          sp.cost_of_capital IS NOT NULL as override_cost_of_capital,
          sp.usd_to_idr_rate IS NOT NULL as override_usd_to_idr_rate
       FROM scenario_parameters sp
       CROSS JOIN (SELECT * FROM master_scenario_parameters LIMIT 1) mp
       WHERE sp.scenario_id = $1`,
      [id]
    );
    return result.rows[0] || {};
  }

  static async getMasterParameters() {
    const result = await pool.query('SELECT * FROM master_scenario_parameters LIMIT 1');
    return result.rows[0] || {};
  }

  static async updateMasterParameters(params) {
    const fields = Object.keys(params).filter(k => k !== 'id');
    const values = fields.map(f => params[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE master_scenario_parameters SET ${setClause}, updated_at = NOW() RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async updateParameters(id, params) {
    const fields = Object.keys(params).filter(k => k !== 'id' && k !== 'scenario_id');
    const values = fields.map(f => params[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE scenario_parameters SET ${setClause} WHERE scenario_id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    return result.rows[0];
  }
}

module.exports = ScenarioService;
