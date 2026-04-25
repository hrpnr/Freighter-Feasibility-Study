const pool = require('../database/pool');
const { addMonths, addDays } = require('date-fns');

class MaintenanceService {
  /**
   * Schedule all maintenance events for an aircraft
   * @param {string} fleetPlanId - UUID of fleet plan
   * @returns {Array} Created maintenance events
   */
  static async scheduleMaintenance(fleetPlanId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get fleet plan details
      const fleetResult = await client.query(
        `SELECT fp.*, at.id as aircraft_type_id
         FROM fleet_plans fp
         JOIN aircraft_types at ON fp.aircraft_type_id = at.id
         WHERE fp.id = $1`,
        [fleetPlanId]
      );

      if (fleetResult.rows.length === 0) {
        throw new Error('Fleet plan not found');
      }

      const fleet = fleetResult.rows[0];
      const eisDate = new Date(fleet.eis_date);
      const redelDate = new Date(fleet.redelivery_date);

      // Get maintenance event types for this aircraft type
      const eventTypesResult = await client.query(
        `SELECT * FROM maintenance_event_types WHERE aircraft_type_id = $1`,
        [fleet.aircraft_type_id]
      );

      const events = [];

      // Schedule calendar-based events
      for (const eventType of eventTypesResult.rows) {
        if (eventType.interval_months) {
          const scheduledEvents = this.scheduleCalendarEvents(
            eventType,
            eisDate,
            redelDate,
            fleetPlanId
          );
          events.push(...scheduledEvents);
        }
      }

      // Insert all events
      for (const event of events) {
        await client.query(
          `INSERT INTO maintenance_log 
           (fleet_plan_id, event_type_id, due_date, due_block_hours, due_flight_cycles, due_apu_hours, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [event.fleet_plan_id, event.event_type_id, event.due_date,
           event.due_block_hours, event.due_flight_cycles, event.due_apu_hours, 'scheduled']
        );
      }

      await client.query('COMMIT');
      return events;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Schedule calendar-based maintenance events
   */
  static scheduleCalendarEvents(eventType, eisDate, redelDate, fleetPlanId) {
    const events = [];
    let currentDate = addMonths(eisDate, eventType.interval_months);

    while (currentDate <= redelDate) {
      events.push({
        fleet_plan_id: fleetPlanId,
        event_type_id: eventType.id,
        due_date: currentDate,
        due_block_hours: null,
        due_flight_cycles: null,
        due_apu_hours: null
      });

      currentDate = addMonths(currentDate, eventType.interval_months);
    }

    return events;
  }

  /**
   * Check usage-based maintenance and update due status
   * @param {string} fleetPlanId
   * @param {number} currentBlockHours
   * @param {number} currentFlightCycles
   * @param {number} currentAPUHours
   */
  static async checkUsageBasedMaintenance(fleetPlanId, currentBlockHours, currentFlightCycles, currentAPUHours) {
    const client = await pool.connect();
    
    try {
      // Get maintenance events that need usage tracking
      const result = await client.query(
        `SELECT ml.*, met.interval_block_hours, met.interval_flight_cycles, met.interval_apu_hours
         FROM maintenance_log ml
         JOIN maintenance_event_types met ON ml.event_type_id = met.id
         WHERE ml.fleet_plan_id = $1
           AND ml.status = 'scheduled'
           AND (met.interval_block_hours IS NOT NULL 
                OR met.interval_flight_cycles IS NOT NULL
                OR met.interval_apu_hours IS NOT NULL)`,
        [fleetPlanId]
      );

      const overdueEvents = [];

      for (const event of result.rows) {
        let isOverdue = false;

        if (event.interval_block_hours && currentBlockHours >= event.interval_block_hours) {
          isOverdue = true;
        }
        if (event.interval_flight_cycles && currentFlightCycles >= event.interval_flight_cycles) {
          isOverdue = true;
        }
        if (event.interval_apu_hours && currentAPUHours >= event.interval_apu_hours) {
          isOverdue = true;
        }

        if (isOverdue) {
          await client.query(
            `UPDATE maintenance_log SET status = 'overdue' WHERE id = $1`,
            [event.id]
          );
          overdueEvents.push(event);
        }
      }

      return overdueEvents;

    } finally {
      client.release();
    }
  }

  /**
   * Get maintenance cost for a period
   * @param {string} scenarioId
   * @param {Date} startDate
   * @param {Date} endDate
   */
  static async getMaintenanceCost(scenarioId, startDate, endDate) {
    const result = await pool.query(
      `SELECT SUM(met.event_cost_usd) as total_cost
       FROM maintenance_log ml
       JOIN maintenance_event_types met ON ml.event_type_id = met.id
       JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
       WHERE fp.scenario_id = $1
         AND ml.due_date >= $2
         AND ml.due_date <= $3
         AND ml.status IN ('scheduled', 'overdue')`,
      [scenarioId, startDate, endDate]
    );

    return parseFloat(result.rows[0]?.total_cost || 0);
  }

  /**
   * Get maintenance events for a month
   */
  static async getMonthlyMaintenanceEvents(scenarioId, monthDate) {
    const startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    const result = await pool.query(
      `SELECT ml.*, met.event_name, met.event_cost_usd,
              fp.tail_number, fp.aircraft_number
       FROM maintenance_log ml
       JOIN maintenance_event_types met ON ml.event_type_id = met.id
       JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
       WHERE fp.scenario_id = $1
         AND ml.due_date >= $2
         AND ml.due_date <= $3`,
      [scenarioId, startDate, endDate]
    );

    return result.rows;
  }
  static async getEventTypes(aircraftTypeId) {
    const result = await pool.query(
      `SELECT * FROM maintenance_event_types 
       WHERE aircraft_type_id = $1
       ORDER BY event_name`,
      [aircraftTypeId]
    );
    return result.rows;
  }

  static async createEventType(data) {
    const {
      aircraft_type_id, event_name, interval_months, interval_block_hours,
      interval_flight_cycles, interval_apu_hours, event_cost_usd, downtime_days
    } = data;
    
    const result = await pool.query(
      `INSERT INTO maintenance_event_types 
       (aircraft_type_id, event_name, interval_months, interval_block_hours, 
        interval_flight_cycles, interval_apu_hours, event_cost_usd, downtime_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [aircraft_type_id, event_name, interval_months, interval_block_hours,
       interval_flight_cycles, interval_apu_hours, event_cost_usd,
       parseInt(downtime_days) || 0]
    );
    return result.rows[0];
  }

  static async updateEventType(id, data) {
    const {
      event_name, interval_months, interval_block_hours,
      interval_flight_cycles, interval_apu_hours, event_cost_usd, downtime_days
    } = data;
    
    const result = await pool.query(
      `UPDATE maintenance_event_types 
       SET event_name = $1, interval_months = $2, interval_block_hours = $3,
           interval_flight_cycles = $4, interval_apu_hours = $5, event_cost_usd = $6,
           downtime_days = $7
       WHERE id = $8
       RETURNING *`,
      [event_name, interval_months, interval_block_hours, interval_flight_cycles,
       interval_apu_hours, event_cost_usd, parseInt(downtime_days) || 0, id]
    );
    return result.rows[0];
  }

  static async deleteEventType(id) {
    await pool.query('DELETE FROM maintenance_event_types WHERE id = $1', [id]);
    return true;
  }

  static async getMaintenanceLog(fleetPlanId) {
    const result = await pool.query(
      `SELECT ml.*, met.event_name, met.event_cost_usd
       FROM maintenance_log ml
       JOIN maintenance_event_types met ON ml.event_type_id = met.id
       WHERE ml.fleet_plan_id = $1
       ORDER BY ml.due_date`,
      [fleetPlanId]
    );
    return result.rows;
  }

  static async updateMaintenanceStatus(id, data) {
    const { status, completed_date, actual_cost_usd } = data;
    const result = await pool.query(
      `UPDATE maintenance_log 
       SET status = $1, completed_date = $2, actual_cost_usd = $3
       WHERE id = $4
       RETURNING *`,
      [status, completed_date, actual_cost_usd, id]
    );
    return result.rows[0];
  }

  static async getUpcomingMaintenance(scenarioId, days) {
    let query = `
      SELECT ml.*, met.event_name, met.event_cost_usd,
              fp.tail_number, fp.aircraft_number
       FROM maintenance_log ml
       JOIN maintenance_event_types met ON ml.event_type_id = met.id
       JOIN fleet_plans fp ON ml.fleet_plan_id = fp.id
       WHERE fp.scenario_id = $1
         AND ml.status IN ('scheduled', 'simulated')`;
    
    const params = [scenarioId];
    
    if (days && days > 0) {
      query += ` AND ml.due_date <= CURRENT_DATE + INTERVAL '1 day' * $2`;
      params.push(days);
    }
    
    query += ` ORDER BY ml.due_date`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }
  static async deleteAllEventTypes() {
    await pool.query('DELETE FROM maintenance_event_types');
    return true;
  }
}

module.exports = MaintenanceService;
