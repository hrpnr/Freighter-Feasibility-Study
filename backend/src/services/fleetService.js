const pool = require('../database/pool');

class FleetService {
  static async getFleetPlans(scenarioId) {
    const result = await pool.query(
      `SELECT fp.*, 
              at.code as aircraft_type_code, 
              at.name as aircraft_type_name,
              at.speed_knots,
              at.range_km,
              at.max_payload_kg
       FROM fleet_plans fp
       JOIN aircraft_types at ON fp.aircraft_type_id = at.id
       WHERE fp.scenario_id = $1
       ORDER BY fp.aircraft_number`,
      [scenarioId]
    );
    return result.rows;
  }

  static async createFleetPlan(scenarioId, data) {
    const { 
      aircraft_number, tail_number, aircraft_type_id, 
      eis_date, redelivery_date, lease_cost_monthly_usd
    } = data;
    
    const result = await pool.query(
      `INSERT INTO fleet_plans 
       (scenario_id, aircraft_number, tail_number, aircraft_type_id, eis_date, redelivery_date, lease_cost_monthly_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [scenarioId, aircraft_number, tail_number, aircraft_type_id, eis_date, redelivery_date, lease_cost_monthly_usd]
    );
    return result.rows[0];
  }

  static async updateFleetPlan(id, data) {
    const { 
      tail_number, aircraft_type_id, eis_date, redelivery_date, lease_cost_monthly_usd
    } = data;
    
    const result = await pool.query(
      `UPDATE fleet_plans 
       SET tail_number = $1, aircraft_type_id = $2, eis_date = $3, redelivery_date = $4, lease_cost_monthly_usd = $5
       WHERE id = $6
       RETURNING *`,
      [tail_number, aircraft_type_id, eis_date, redelivery_date, lease_cost_monthly_usd, id]
    );
    return result.rows[0];
  }

  static async deleteFleetPlan(id) {
    await pool.query('DELETE FROM fleet_plans WHERE id = $1', [id]);
    return true;
  }

  static async setInitialMaintenance(id, baselines) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing baselines for this aircraft first
      await client.query('DELETE FROM fleet_initial_mtx WHERE fleet_plan_id = $1', [id]);
      
      // Insert new baselines
      for (const b of baselines) {
        const lastDoneDate = (b.last_done_date && b.last_done_date.trim() !== '') ? b.last_done_date : null;
        
        await client.query(
          `INSERT INTO fleet_initial_mtx 
           (fleet_plan_id, event_type_id, last_done_date, last_done_hours, last_done_cycles, last_done_apu_hours)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, b.event_type_id, lastDoneDate, b.last_done_hours || 0, b.last_done_cycles || 0, b.last_done_apu_hours || 0]
        );
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getInitialMaintenance(id) {
    const result = await pool.query(
      `SELECT * FROM fleet_initial_mtx WHERE fleet_plan_id = $1`,
      [id]
    );
    return result.rows;
  }
}

module.exports = FleetService;
