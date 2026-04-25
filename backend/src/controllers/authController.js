const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AuthService = require('../services/authService');

class AuthController {
  static async register(req, res) {
    try {
      const { username, email, password, role } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = await AuthService.createUser(username, email, hashedPassword, role);
      res.status(201).json(user);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  static async login(req, res) {
    try {
      const { username, password } = req.body;
      
      const user = await AuthService.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const validPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      
      await AuthService.updateLastLogin(user.id);
      
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  }

  static async getProfile(req, res) {
    try {
      const profile = await AuthService.getProfile(req.user.id);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}

module.exports = AuthController;
