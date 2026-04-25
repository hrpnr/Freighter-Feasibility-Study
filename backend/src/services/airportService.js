const pool = require('../database/pool');

class AirportService {
  static async getAll() {
    const result = await pool.query('SELECT * FROM airports ORDER BY code');
    return result.rows;
  }

  static async create(data) {
    const { 
      code, name, city, country, region, latitude, longitude, 
      opening_hour, closing_hour, has_hll,
      landing_fee_usd, parking_fee_usd, navigation_fee_usd 
    } = data;
    const result = await pool.query(
      `INSERT INTO airports (
        code, name, city, country, region, latitude, longitude, 
        opening_hour, closing_hour, has_hll,
        landing_fee_usd, parking_fee_usd, navigation_fee_usd
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        code, 
        name, 
        city || null, 
        country, 
        region, 
        latitude !== '' && latitude !== null ? latitude : null,
        longitude !== '' && longitude !== null ? longitude : null,
        opening_hour !== '' && opening_hour !== null ? opening_hour : null,
        closing_hour !== '' && closing_hour !== null ? closing_hour : null,
        has_hll || false,
        landing_fee_usd || 0,
        parking_fee_usd || 0,
        navigation_fee_usd || 0
      ]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { 
      code, name, city, country, region, latitude, longitude, 
      opening_hour, closing_hour, has_hll,
      landing_fee_usd, parking_fee_usd, navigation_fee_usd 
    } = data;
    const result = await pool.query(
      `UPDATE airports SET 
        code = $1, name = $2, city = $3, country = $4, region = $5, 
        latitude = $6, longitude = $7, opening_hour = $8, closing_hour = $9, has_hll = $10,
        landing_fee_usd = $11, parking_fee_usd = $12, navigation_fee_usd = $13
       WHERE id = $14 RETURNING *`,
      [
        code, 
        name, 
        city || null, 
        country, 
        region, 
        latitude !== '' && latitude !== null ? latitude : null,
        longitude !== '' && longitude !== null ? longitude : null,
        opening_hour !== '' && opening_hour !== null ? opening_hour : null,
        closing_hour !== '' && closing_hour !== null ? closing_hour : null,
        has_hll || false,
        landing_fee_usd || 0,
        parking_fee_usd || 0,
        navigation_fee_usd || 0,
        id
      ]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM airports WHERE id = $1', [id]);
    return true;
  }
}

module.exports = AirportService;
