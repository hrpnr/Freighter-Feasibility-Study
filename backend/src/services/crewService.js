const pool = require('../database/pool');

class CrewService {
  static async getByScenario(scenarioId) {
    const result = await pool.query(
      `SELECT * FROM crew_members WHERE scenario_id = $1 ORDER BY role, name`,
      [scenarioId]
    );
    return result.rows;
  }

  static async getAll() {
    const result = await pool.query(`SELECT * FROM crew_members ORDER BY role, name`);
    return result.rows;
  }

  static async create(data) {
    const {
      employee_id, name, role, monthly_salary_usd,
      max_duty_hours_per_day, min_rest_hours, max_duty_hours_per_month, scenario_id
    } = data;

    const result = await pool.query(
      `INSERT INTO crew_members 
       (employee_id, name, role, monthly_salary_usd, 
        max_duty_hours_per_day, min_rest_hours, max_duty_hours_per_month, scenario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [employee_id, name, role, monthly_salary_usd,
        max_duty_hours_per_day, min_rest_hours, max_duty_hours_per_month, scenario_id || null]
    );

    return result.rows[0];
  }

  static async update(id, data) {
    const {
      employee_id, name, role, monthly_salary_usd,
      max_duty_hours_per_day, min_rest_hours, max_duty_hours_per_month
    } = data;

    const result = await pool.query(
      `UPDATE crew_members 
       SET employee_id = $1, name = $2, role = $3, monthly_salary_usd = $4,
           max_duty_hours_per_day = $5, min_rest_hours = $6, max_duty_hours_per_month = $7
       WHERE id = $8
       RETURNING *`,
      [employee_id, name, role, monthly_salary_usd, max_duty_hours_per_day,
        min_rest_hours, max_duty_hours_per_month, id]
    );

    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM crew_members WHERE id = $1', [id]);
    return true;
  }

  static async bulkCreate(crew) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const member of crew) {
        const result = await client.query(
          `INSERT INTO crew_members 
           (employee_id, name, role, monthly_salary_usd,
            max_duty_hours_per_day, min_rest_hours, max_duty_hours_per_month, scenario_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [member.employee_id, member.name, member.role,
          member.monthly_salary_usd, member.max_duty_hours_per_day,
          member.min_rest_hours, member.max_duty_hours_per_month, member.scenario_id || null]
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

  static async getCrewCost(scenarioId) {
    const result = await pool.query(
      `SELECT 
         SUM(monthly_salary_usd) as total_monthly_salary,
         COUNT(*) as total_crew,
         COUNT(*) FILTER (WHERE role = 'pilot') as total_pilots,
         COUNT(*) FILTER (WHERE role = 'first_officer') as total_fos
       FROM crew_members
       WHERE scenario_id = $1`,
      [scenarioId]
    );
    return result.rows[0];
  }
}

module.exports = CrewService;
