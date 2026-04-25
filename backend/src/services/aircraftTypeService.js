const pool = require('../database/pool');

class AircraftTypeService {
  static async getAll() {
    const result = await pool.query('SELECT * FROM aircraft_types ORDER BY code');
    return result.rows;
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM aircraft_types WHERE id = $1', [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  static async create(data) {
    const { code, name, mtow_tons, speed_knots, fuel_burn_liter_per_hour, max_payload_kg, range_km, year_of_manufacture } = data;
    const result = await pool.query(
      `INSERT INTO aircraft_types (code, name, mtow_tons, speed_knots, fuel_burn_liter_per_hour, max_payload_kg, range_km, year_of_manufacture)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [code, name, mtow_tons, speed_knots, fuel_burn_liter_per_hour, max_payload_kg, range_km, year_of_manufacture]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { code, name, mtow_tons, speed_knots, fuel_burn_liter_per_hour, max_payload_kg, range_km, year_of_manufacture } = data;
    const result = await pool.query(
      `UPDATE aircraft_types 
       SET code = $1, name = $2, mtow_tons = $3, speed_knots = $4, fuel_burn_liter_per_hour = $5, 
           max_payload_kg = $6, range_km = $7, year_of_manufacture = $8
       WHERE id = $9
       RETURNING *`,
      [code, name, mtow_tons, speed_knots, fuel_burn_liter_per_hour, max_payload_kg, range_km, year_of_manufacture, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM aircraft_types WHERE id = $1', [id]);
    return true;
  }
}

module.exports = AircraftTypeService;
