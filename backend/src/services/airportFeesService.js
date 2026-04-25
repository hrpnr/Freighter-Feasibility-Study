const pool = require('../database/pool');

class AirportFeesService {
  static async getByScenario(scenarioId) {
    const result = await pool.query(
      `SELECT 
          a.id as airport_id,
          a.code as airport_code,
          a.name as airport_name,
          COALESCE(saf.landing_fee_usd, a.landing_fee_usd) as landing_fee_usd,
          COALESCE(saf.parking_fee_usd, a.parking_fee_usd) as parking_fee_usd,
          COALESCE(saf.navigation_fee_usd, a.navigation_fee_usd) as navigation_fee_usd,
          saf.id IS NOT NULL as is_override,
          saf.id as override_id
       FROM airports a
       LEFT JOIN scenario_airport_fees saf ON a.id = saf.airport_id AND saf.scenario_id = $1
       ORDER BY a.code`,
      [scenarioId]
    );
    return result.rows;
  }

  static async upsertScenarioOverride(scenarioId, data) {
    const { airport_id, landing_fee_usd, parking_fee_usd, navigation_fee_usd } = data;
    const result = await pool.query(
      `INSERT INTO scenario_airport_fees (scenario_id, airport_id, landing_fee_usd, parking_fee_usd, navigation_fee_usd)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scenario_id, airport_id) 
       DO UPDATE SET 
          landing_fee_usd = EXCLUDED.landing_fee_usd, 
          parking_fee_usd = EXCLUDED.parking_fee_usd, 
          navigation_fee_usd = EXCLUDED.navigation_fee_usd
       RETURNING *`,
      [scenarioId, airport_id, landing_fee_usd, parking_fee_usd, navigation_fee_usd]
    );
    return result.rows[0];
  }

  static async deleteScenarioOverride(id) {
    await pool.query('DELETE FROM scenario_airport_fees WHERE id = $1', [id]);
    return true;
  }
}

module.exports = AirportFeesService;
