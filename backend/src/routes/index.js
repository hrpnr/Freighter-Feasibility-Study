const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const AuthController = require('../controllers/authController');
const ScenarioController = require('../controllers/scenarioController');
const FleetController = require('../controllers/fleetController');
const AircraftTypeController = require('../controllers/aircraftTypeController');
const AirportController = require('../controllers/airportController');
const SchedulesController = require('../controllers/schedulesController');
const PricingController = require('../controllers/pricingController');
const HolidaysController = require('../controllers/holidaysController');
const MaintenanceController = require('../controllers/maintenanceController');
const CrewController = require('../controllers/crewController');
const ImportController = require('../controllers/importController');
const CashFlowController = require('../controllers/cashFlowController');
const MonteCarloController = require('../controllers/monteCarloController');
const AirportFeesController = require('../controllers/airportFeesController');
const DailyPnLController = require('../controllers/dailyPnLController');

const router = express.Router();

// Auth routes
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.get('/auth/profile', authMiddleware, AuthController.getProfile);

// Scenario routes
router.get('/scenarios', authMiddleware, ScenarioController.getAllScenarios);
router.get('/scenarios/:id', authMiddleware, ScenarioController.getScenarioById);
router.post('/scenarios', authMiddleware, ScenarioController.createScenario);
router.put('/scenarios/:id', authMiddleware, ScenarioController.updateScenario);
router.delete('/scenarios/:id', authMiddleware, adminOnly, ScenarioController.deleteScenario);
router.post('/scenarios/:id/calculate', authMiddleware, ScenarioController.calculateScenario);
router.get('/scenarios/:id/pnl', authMiddleware, ScenarioController.getMonthlyPnL);
router.get('/scenarios/:id/daily-pnl', authMiddleware, DailyPnLController.getDailyPnL);
router.get('/scenarios/:id/daily-analysis', authMiddleware, DailyPnLController.getDailyAnalysis);
router.get('/scenarios/:id/export', authMiddleware, ScenarioController.exportToExcel);
router.get('/scenarios/:id/parameters', authMiddleware, ScenarioController.getParameters);
router.put('/scenarios/:id/parameters', authMiddleware, ScenarioController.updateParameters);
router.get('/master-parameters', authMiddleware, adminOnly, ScenarioController.getMasterParameters);
router.put('/master-parameters', authMiddleware, adminOnly, ScenarioController.updateMasterParameters);

// Monte Carlo simulation routes
router.post('/scenarios/:id/montecarlo/simulate', authMiddleware, MonteCarloController.runSimulation);
router.post('/scenarios/:id/montecarlo/histogram', authMiddleware, MonteCarloController.getHistogram);
router.post('/scenarios/:id/montecarlo/risk', authMiddleware, MonteCarloController.getRiskAnalysis);
router.post('/scenarios/:id/montecarlo/distribution', authMiddleware, MonteCarloController.getProbabilityDistribution);

// Fleet routes
router.get('/scenarios/:scenarioId/fleet', authMiddleware, FleetController.getFleetPlans);
router.post('/scenarios/:scenarioId/fleet', authMiddleware, FleetController.createFleetPlan);
router.put('/fleet/:id', authMiddleware, FleetController.updateFleetPlan);
router.delete('/fleet/:id', authMiddleware, FleetController.deleteFleetPlan);
router.get('/fleet/:id/initial-maintenance', authMiddleware, FleetController.getInitialMaintenance);
router.post('/fleet/:id/initial-maintenance', authMiddleware, FleetController.setInitialMaintenance);

// Maintenance routes
router.get('/aircraft-types/:aircraftTypeId/maintenance-events', authMiddleware, MaintenanceController.getEventTypes);
router.post('/maintenance-events', authMiddleware, adminOnly, MaintenanceController.createEventType);
router.put('/maintenance-events/:id', authMiddleware, adminOnly, MaintenanceController.updateEventType);
router.delete('/maintenance-events/:id', authMiddleware, adminOnly, MaintenanceController.deleteEventType);
router.delete('/maintenance-events', authMiddleware, adminOnly, MaintenanceController.deleteAllEventTypes);
router.get('/fleet/:fleetPlanId/maintenance', authMiddleware, MaintenanceController.getMaintenanceLog);
router.post('/fleet/:fleetPlanId/maintenance/schedule', authMiddleware, MaintenanceController.scheduleMaintenance);
router.put('/maintenance/:id', authMiddleware, MaintenanceController.updateMaintenanceStatus);
router.get('/scenarios/:scenarioId/maintenance/upcoming', authMiddleware, MaintenanceController.getUpcomingMaintenance);

// Crew routes
router.get('/scenarios/:scenarioId/crew', authMiddleware, CrewController.getByScenario);
router.get('/crew', authMiddleware, CrewController.getAll);
router.post('/crew', authMiddleware, CrewController.create);
router.post('/crew/bulk', authMiddleware, CrewController.bulkCreate);
router.put('/crew/:id', authMiddleware, CrewController.update);
router.delete('/crew/:id', authMiddleware, CrewController.delete);
router.get('/scenarios/:scenarioId/crew/cost', authMiddleware, CrewController.getCrewCost);

// Aircraft type routes (Settings)
router.get('/aircraft-types', authMiddleware, AircraftTypeController.getAll);
router.get('/aircraft-types/:id', authMiddleware, AircraftTypeController.getById);
router.post('/aircraft-types', authMiddleware, adminOnly, AircraftTypeController.create);
router.put('/aircraft-types/:id', authMiddleware, adminOnly, AircraftTypeController.update);
router.delete('/aircraft-types/:id', authMiddleware, adminOnly, AircraftTypeController.delete);

// Airport routes (Settings)
router.get('/airports', authMiddleware, AirportController.getAll);
router.post('/airports', authMiddleware, adminOnly, AirportController.create);
router.put('/airports/:id', authMiddleware, adminOnly, AirportController.update);
router.delete('/airports/:id', authMiddleware, adminOnly, AirportController.delete);

// Airport Fees routes (Scenario Overrides)
router.get('/scenarios/:scenarioId/airport-fees', authMiddleware, AirportFeesController.getByScenario);
router.post('/scenarios/:scenarioId/airport-fees', authMiddleware, AirportFeesController.upsertScenarioOverride);
router.delete('/airport-fees-override/:id', authMiddleware, AirportFeesController.deleteScenarioOverride);



// Schedule routes (per scenario)
router.get('/scenarios/:scenarioId/schedules', authMiddleware, SchedulesController.getByScenario);
router.post('/scenarios/:scenarioId/schedules', authMiddleware, SchedulesController.create);
router.post('/scenarios/:scenarioId/schedules/bulk-rotation', authMiddleware, SchedulesController.bulkCreateRotation);
router.delete('/scenarios/:scenarioId/schedules', authMiddleware, SchedulesController.deleteAll);
router.put('/schedules/:id', authMiddleware, SchedulesController.update);
router.put('/schedules/rotation/:rotationGroupId', authMiddleware, SchedulesController.updateRotation);
router.delete('/schedules/:id', authMiddleware, SchedulesController.delete);
router.delete('/schedules/rotation/:rotationGroupId', authMiddleware, SchedulesController.deleteRotation);
router.delete('/schedules/:id/week', authMiddleware, SchedulesController.deleteWeek);
router.delete('/schedules/:id/month', authMiddleware, SchedulesController.deleteMonth);

// Pricing routes (per scenario)
router.get('/scenarios/:scenarioId/pricing', authMiddleware, PricingController.getByScenario);
router.post('/scenarios/:scenarioId/pricing', authMiddleware, PricingController.create);
router.post('/scenarios/:scenarioId/pricing/bulk', authMiddleware, PricingController.bulkCreate);
router.put('/pricing/:id', authMiddleware, PricingController.update);
router.delete('/pricing/:id', authMiddleware, PricingController.delete);

// Master Pricing routes
router.get('/master-pricing', authMiddleware, PricingController.getAllMaster);
router.post('/master-pricing', authMiddleware, adminOnly, PricingController.createMaster);
router.put('/master-pricing/:id', authMiddleware, adminOnly, PricingController.updateMaster);
router.delete('/master-pricing/:id', authMiddleware, adminOnly, PricingController.deleteMaster);
router.delete('/master-pricing', authMiddleware, adminOnly, PricingController.deleteAllMaster);

// Holidays routes (per scenario)
router.get('/scenarios/:scenarioId/holidays', authMiddleware, HolidaysController.getByScenario);
router.post('/scenarios/:scenarioId/holidays', authMiddleware, HolidaysController.create);
router.post('/scenarios/:scenarioId/holidays/bulk', authMiddleware, HolidaysController.bulkCreate);
router.put('/holidays/:id', authMiddleware, HolidaysController.update);
router.delete('/holidays/:id', authMiddleware, HolidaysController.delete);
router.get('/master-holidays', authMiddleware, HolidaysController.getAllMaster);
router.post('/master-holidays', authMiddleware, adminOnly, HolidaysController.createMaster);
router.put('/master-holidays/:id', authMiddleware, adminOnly, HolidaysController.updateMaster);
router.delete('/master-holidays/:id', authMiddleware, adminOnly, HolidaysController.deleteMaster);

// Import routes (Excel uploads)
router.post('/import/routes', authMiddleware, adminOnly, ImportController.getUploadMiddleware(), ImportController.importPricing);
router.post('/import/aircraft-types', authMiddleware, adminOnly, ImportController.getUploadMiddleware(), ImportController.importAircraftTypes);
router.post('/import/airports', authMiddleware, adminOnly, ImportController.getUploadMiddleware(), ImportController.importAirports);
router.post('/scenarios/:scenarioId/import/fleet', authMiddleware, ImportController.getUploadMiddleware(), ImportController.importFleetPlan);
router.post('/scenarios/:scenarioId/import/schedules', authMiddleware, ImportController.getUploadMiddleware(), ImportController.importSchedules);
router.post('/scenarios/:scenarioId/import/pricing', authMiddleware, ImportController.getUploadMiddleware(), ImportController.importPricing);
router.post('/import/master-pricing', authMiddleware, adminOnly, ImportController.getUploadMiddleware(), ImportController.importMasterPricing);
router.post('/import/maintenance-events', authMiddleware, adminOnly, ImportController.getUploadMiddleware(), ImportController.importMaintenanceEvents);

module.exports = router;
