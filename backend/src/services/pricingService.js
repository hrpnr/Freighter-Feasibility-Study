const pool = require('../database/pool');

class PricingService {
  static async getByScenario(scenarioId) {
    const result = await pool.query(
      `SELECT 
          p.id, p.origin_id, p.destination_id, p.segment, p.fare_usd, 
          true as is_override,
          o.code as origin_code, d.code as dest_code,
          COALESCE(6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
              cos(radians(d.longitude) - radians(o.longitude)) + 
              sin(radians(o.latitude)) * sin(radians(d.latitude))
            ))
          ), 0) as distance_km
       FROM pricing p
       JOIN airports o ON p.origin_id = o.id
       JOIN airports d ON p.destination_id = d.id
       WHERE p.scenario_id = $1
       
       UNION ALL
       
       SELECT 
          mp.id, mp.origin_id, mp.destination_id, mp.segment, mp.fare_usd,
          false as is_override,
          o.code as origin_code, d.code as dest_code,
          COALESCE(6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
              cos(radians(d.longitude) - radians(o.longitude)) + 
              sin(radians(o.latitude)) * sin(radians(d.latitude))
            ))
          ), 0) as distance_km
       FROM master_pricing mp
       JOIN airports o ON mp.origin_id = o.id
       JOIN airports d ON mp.destination_id = d.id
       WHERE NOT EXISTS (
          SELECT 1 FROM pricing p 
          WHERE p.scenario_id = $1 
          AND p.origin_id = mp.origin_id 
          AND p.destination_id = mp.destination_id 
          AND (p.segment = mp.segment OR (p.segment IS NULL AND mp.segment IS NULL))
       )
       ORDER BY origin_code, dest_code, segment`,
      [scenarioId]
    );
    return result.rows;
  }

  static async getAllMaster() {
    const result = await pool.query(
      `SELECT mp.*, 
              o.code as origin_code, d.code as dest_code,
              CASE 
                WHEN o.latitude IS NULL OR o.longitude IS NULL OR d.latitude IS NULL OR d.longitude IS NULL THEN 0
                ELSE COALESCE(6371 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                    cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
                    cos(radians(d.longitude) - radians(o.longitude)) + 
                    sin(radians(o.latitude)) * sin(radians(d.latitude))
                  ))
                ), 0)
              END as distance_km
       FROM master_pricing mp
       JOIN airports o ON mp.origin_id = o.id
       JOIN airports d ON mp.destination_id = d.id
       ORDER BY origin_code, dest_code, mp.segment`
    );
    return result.rows;
  }

  static async createMaster(data) {
    const { origin_id, destination_id, segment, fare_usd } = data;
    const segmentValue = (segment !== null && segment !== undefined) ? segment : 'General';

    const result = await pool.query(
      `INSERT INTO master_pricing (origin_id, destination_id, segment, fare_usd)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [origin_id, destination_id, segmentValue, fare_usd]
    );
    return result.rows[0];
  }

  static async updateMaster(id, data) {
    const { fare_usd } = data;
    const result = await pool.query(
      `UPDATE master_pricing SET fare_usd = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [fare_usd, id]
    );
    return result.rows[0];
  }

  static async deleteMaster(id) {
    await pool.query('DELETE FROM master_pricing WHERE id = $1', [id]);
    return true;
  }

  static async deleteAllMaster() {
    await pool.query('DELETE FROM master_pricing');
    return true;
  }

  static async create(scenarioId, data) {
    const { origin_id, destination_id, segment, fare_usd, effective_date } = data;
    const segmentValue = (segment !== null && segment !== undefined) ? segment : 'General';

    const result = await pool.query(
      `INSERT INTO pricing (scenario_id, origin_id, destination_id, segment, fare_usd, effective_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [scenarioId, origin_id, destination_id, segmentValue, fare_usd, effective_date || new Date()]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { fare_usd, effective_date } = data;
    const result = await pool.query(
      `UPDATE pricing SET fare_usd = $1, effective_date = COALESCE($2, effective_date) WHERE id = $3 RETURNING *`,
      [fare_usd, effective_date || null, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM pricing WHERE id = $1', [id]);
    return true;
  }

  static async bulkCreate(scenarioId, items) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const item of items) {
        const result = await client.query(
          `INSERT INTO pricing (scenario_id, origin_id, destination_id, segment, fare_usd, effective_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [scenarioId, item.origin_id, item.destination_id, item.segment, item.fare_usd, item.effective_date || new Date()]
        );
        results.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = PricingService;
