const pool = require('../database/pool');

class HolidaysService {
  static async getByScenario(scenarioId) {
    const result = await pool.query(
      `SELECT 
         h.id, h.scenario_id, h.name, h.holiday_date, h.country, 
         h.impact_start_date, h.impact_end_date, h.is_operating, 
         true as is_override 
       FROM holidays h
       WHERE h.scenario_id = $1
       
       UNION ALL
       
       SELECT 
         mh.id, null as scenario_id, mh.name, mh.holiday_date, mh.country, 
         mh.impact_start_date, mh.impact_end_date, true as is_operating, 
         false as is_override
       FROM master_holidays mh
       WHERE NOT EXISTS (
         SELECT 1 FROM holidays h 
         WHERE h.scenario_id = $1 AND h.name = mh.name AND h.holiday_date = mh.holiday_date
       )
       ORDER BY holiday_date`,
      [scenarioId]
    );
    return result.rows;
  }

  static async getAllMaster() {
    const result = await pool.query('SELECT * FROM master_holidays ORDER BY holiday_date');
    return result.rows;
  }

  static async createMaster(data) {
    const { name, holiday_date, country, impact_start_date, impact_end_date } = data;
    const result = await pool.query(
      `INSERT INTO master_holidays (name, holiday_date, country, impact_start_date, impact_end_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, holiday_date, country, impact_start_date, impact_end_date]
    );
    return result.rows[0];
  }

  static async updateMaster(id, data) {
    const { name, holiday_date, country, impact_start_date, impact_end_date } = data;
    const result = await pool.query(
      `UPDATE master_holidays SET name = $1, holiday_date = $2, country = $3, 
       impact_start_date = $4, impact_end_date = $5 WHERE id = $6 RETURNING *`,
      [name, holiday_date, country, impact_start_date, impact_end_date, id]
    );
    return result.rows[0];
  }

  static async deleteMaster(id) {
    await pool.query('DELETE FROM master_holidays WHERE id = $1', [id]);
    return true;
  }

  static async create(scenarioId, data) {
    const { name, holiday_date, country, impact_start_date, impact_end_date, is_operating } = data;
    const result = await pool.query(
      `INSERT INTO holidays (scenario_id, name, holiday_date, country, impact_start_date, impact_end_date, is_operating)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [scenarioId, name, holiday_date, country, impact_start_date, impact_end_date, is_operating !== undefined ? is_operating : true]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { name, holiday_date, country, impact_start_date, impact_end_date, is_operating } = data;
    const result = await pool.query(
      `UPDATE holidays 
       SET name = $1, holiday_date = $2, country = $3, 
           impact_start_date = $4, impact_end_date = $5, is_operating = $6
       WHERE id = $7
       RETURNING *`,
      [name, holiday_date, country, impact_start_date, impact_end_date, is_operating, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM holidays WHERE id = $1', [id]);
    return true;
  }

  static async bulkCreate(scenarioId, holidays) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const holiday of holidays) {
        const result = await client.query(
          `INSERT INTO holidays (scenario_id, name, holiday_date, country, impact_start_date, impact_end_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [scenarioId, holiday.name, holiday.holiday_date, holiday.country,
            holiday.impact_start_date, holiday.impact_end_date]
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

module.exports = HolidaysService;
