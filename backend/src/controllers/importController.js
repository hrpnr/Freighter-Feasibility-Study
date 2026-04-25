const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelImportService = require('../services/excelImportService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only Excel files are allowed'));
    }
    cb(null, true);
  }
});

class ImportController {
  static getUploadMiddleware() {
    return upload.single('file');
  }


  // Import aircraft types
  static async importAircraftTypes(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const aircraftTypes = await ExcelImportService.importAircraftTypes(req.file.path);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Aircraft types imported successfully',
        count: aircraftTypes.length,
        aircraftTypes
      });
    } catch (error) {
      console.error('Error importing aircraft types:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import aircraft types', details: error.message });
    }
  }

  // Import airports
  static async importAirports(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const airports = await ExcelImportService.importAirports(req.file.path);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Airports imported successfully',
        count: airports.length,
        airports
      });
    } catch (error) {
      console.error('Error importing airports:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import airports', details: error.message });
    }
  }

  // Import fleet plan
  static async importFleetPlan(req, res) {
    try {
      const { scenarioId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fleet = await ExcelImportService.importFleetPlan(req.file.path, scenarioId);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Fleet plan imported successfully',
        count: fleet.length,
        fleet
      });
    } catch (error) {
      console.error('Error importing fleet plan:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import fleet plan', details: error.message });
    }
  }

  // Import schedules
  static async importSchedules(req, res) {
    try {
      const { scenarioId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const schedules = await ExcelImportService.importSchedules(req.file.path, scenarioId);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Schedules imported successfully',
        count: schedules.length,
        schedules
      });
    } catch (error) {
      console.error('Error importing schedules:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import schedules', details: error.message });
    }
  }

  // Import pricing
  static async importPricing(req, res) {
    try {
      const { scenarioId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const pricing = await ExcelImportService.importPricing(req.file.path, scenarioId);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Pricing imported successfully',
        count: pricing.length,
        pricing
      });
    } catch (error) {
      console.error('Error importing pricing:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import pricing', details: error.message });
    }
  }

  // Import master pricing
  static async importMasterPricing(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const pricing = await ExcelImportService.importMasterPricing(req.file.path);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Master pricing imported successfully',
        count: pricing.length,
        pricing
      });
    } catch (error) {
      console.error('Error importing master pricing:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import master pricing', details: error.message });
    }
  }

  // Import maintenance event types (Event Dictionary)
  static async importMaintenanceEvents(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const events = await ExcelImportService.importMaintenanceEvents(req.file.path);

      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Maintenance events imported successfully',
        count: events.length,
        events
      });
    } catch (error) {
      console.error('Error importing maintenance events:', error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to import maintenance events', details: error.message });
    }
  }
}

module.exports = ImportController;
