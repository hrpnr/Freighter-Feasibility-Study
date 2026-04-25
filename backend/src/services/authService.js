const pool = require('../database/pool');

class AuthService {
  static async createUser(username, email, hashedPassword, role) {
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, hashedPassword, role || 'analyst']
    );
    return result.rows[0];
  }

  static async getUserByUsername(username) {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows.length ? result.rows[0] : null;
  }

  static async updateLastLogin(userId) {
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
    return true;
  }

  static async getProfile(userId) {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = $1',
      [userId]
    );
    return result.rows.length ? result.rows[0] : null;
  }
}

module.exports = AuthService;
