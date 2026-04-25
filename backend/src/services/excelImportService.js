const ExcelJS = require('exceljs');
const pool = require('../database/pool');

class ExcelImportService {

  /**
   * Import aircraft types from Excel
   * Expected columns: Code, Name, MTOW(tons), Speed(knots), Fuel Burn(L/hr), Payload(kg), Range(km), Year
   */
  static async importAircraftTypes(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const aircraftTypes = [];

    try {
      await client.query('BEGIN');

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push(row);
      });

      for (const row of rows) {
        const code = row.getCell(1).value;
        const name = row.getCell(2).value;
        const mtowTons = parseFloat(row.getCell(3).value);
        const speedKnots = parseInt(row.getCell(4).value);
        const fuelBurn = parseFloat(row.getCell(5).value);
        const maxPayload = parseFloat(row.getCell(6).value);
        const rangeKm = parseFloat(row.getCell(7).value);
        const year = parseInt(row.getCell(8).value);

        const result = await client.query(
          `INSERT INTO aircraft_types 
           (code, name, mtow_tons, speed_knots, fuel_burn_liter_per_hour, 
            max_payload_kg, range_km, year_of_manufacture)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (code) DO UPDATE SET 
             name = $2, mtow_tons = $3, speed_knots = $4, 
             fuel_burn_liter_per_hour = $5, max_payload_kg = $6, 
             range_km = $7, year_of_manufacture = $8
           RETURNING *`,
          [code, name, mtowTons, speedKnots, fuelBurn, maxPayload, rangeKm, year]
        );
        aircraftTypes.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return aircraftTypes;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import airports from Excel
   * Expected columns: Code, Name, City, Country, Region, Lat, Lon, Opening, Closing, HAS HLL
   */
  static async importAirports(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const airports = [];

    try {
      await client.query('BEGIN');

      const headers = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString().trim();
      });

      const aircraftTypesRes = await client.query('SELECT id, code FROM aircraft_types');
      const aircraftTypes = aircraftTypesRes.rows;

      const feeMappings = [];
      headers.forEach((header, colIdx) => {
        if (!header) return;
        const match = header.match(/^([A-Z0-9]+)\s+(Landing|Parking|Nav)/i);
        if (match) {
          const type = aircraftTypes.find(at => at.code.toLowerCase() === match[1].toLowerCase());
          if (type) {
            feeMappings.push({
              colIdx,
              aircraftTypeId: type.id,
              feeType: match[2].toLowerCase()
            });
          }
        }
      });

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push(row);
      });

      for (const row of rows) {
        const code = row.getCell(1).value;
        const name = row.getCell(2).value;
        const city = row.getCell(3).value;
        const country = row.getCell(4).value;
        const region = row.getCell(5).value;
        const latVal = row.getCell(6).value;
        const lonVal = row.getCell(7).value;
        const opening = row.getCell(8).value;
        const closing = row.getCell(9).value;
        const hllVal = row.getCell(10).value;
        const hasHLL = hllVal === 1 || hllVal === true || (typeof hllVal === 'string' && hllVal.toLowerCase() === 'true');

        const latitude = typeof latVal === 'string' ? parseFloat(latVal) : latVal;
        const longitude = typeof lonVal === 'string' ? parseFloat(lonVal) : lonVal;

        // Helper to format Excel time/date objects for Postgres TIME column
        const formatTime = (val) => {
          if (val instanceof Date) {
            const h = String(val.getUTCHours()).padStart(2, '0');
            const m = String(val.getUTCMinutes()).padStart(2, '0');
            const s = String(val.getUTCSeconds()).padStart(2, '0');
            return `${h}:${m}`;
          }
          return val;
        };

        const landingFee = parseFloat(row.getCell(11).value) || 0;
        const parkingFee = parseFloat(row.getCell(12).value) || 0;
        const navFee = parseFloat(row.getCell(13).value) || 0;

        const result = await client.query(
          `INSERT INTO airports 
           (code, name, city, country, region, latitude, longitude, opening_hour, closing_hour, has_hll, 
            landing_fee_usd, parking_fee_usd, navigation_fee_usd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (code) DO UPDATE SET 
             name = $2, city = $3, country = $4, region = $5,
             latitude = $6, longitude = $7, opening_hour = $8, closing_hour = $9, has_hll = $10,
             landing_fee_usd = $11, parking_fee_usd = $12, navigation_fee_usd = $13
           RETURNING *`,
          [code, name, city, country, region, latitude, longitude, formatTime(opening), formatTime(closing), hasHLL, 
           landingFee, parkingFee, navFee]
        );
        const airport = result.rows[0];
        airports.push(airport);
      }

      await client.query('COMMIT');
      return airports;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import fleet plan from Excel
   * Expected columns: Aircraft #, Tail Number, Aircraft Type Code, EIS Date, Redel Date, Monthly Lease
   */
  static async importFleetPlan(filePath, scenarioId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const fleet = [];

    try {
      await client.query('BEGIN');

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push(row);
      });

      for (const row of rows) {
        const aircraftNumber = parseInt(row.getCell(1).value);
        const tailNumber = row.getCell(2).value;
        const aircraftTypeCode = row.getCell(3).value;
        const eisDate = row.getCell(4).value;
        const redelDate = row.getCell(5).value;
        const leaseCost = parseFloat(row.getCell(6).value);
        
        // New utilization columns (Safe for formulas)
        const getVal = (cell) => {
          const v = cell.value;
          if (v && typeof v === 'object' && v.result !== undefined) return v.result;
          return v;
        };
        
        const initialFH = parseFloat(getVal(row.getCell(7))) || 0;
        const initialFC = parseInt(getVal(row.getCell(8))) || 0;
        const initialAPU = parseFloat(getVal(row.getCell(9))) || 0;

        // Get aircraft type ID
        const typeResult = await client.query(
          'SELECT id FROM aircraft_types WHERE code = $1',
          [aircraftTypeCode]
        );

        if (typeResult.rows.length > 0) {
          const result = await client.query(
            `INSERT INTO fleet_plans 
             (scenario_id, aircraft_number, tail_number, aircraft_type_id, 
              eis_date, redelivery_date, lease_cost_monthly_usd,
              initial_total_hours, initial_total_cycles, initial_total_apu_hours)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (scenario_id, aircraft_number) DO UPDATE SET
               tail_number = $3, aircraft_type_id = $4, eis_date = $5,
               redelivery_date = $6, lease_cost_monthly_usd = $7,
               initial_total_hours = $8, initial_total_cycles = $9, initial_total_apu_hours = $10
             RETURNING *`,
            [scenarioId, aircraftNumber, tailNumber, typeResult.rows[0].id,
              eisDate, redelDate, leaseCost, initialFH, initialFC, initialAPU]
          );
          fleet.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');
      return fleet;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import schedules from Excel
   * Expected columns: Aircraft #, Route String, Priority, Mon, Tue, Wed, Thu, Fri, Sat, Sun, Start Date
   */
  static async importSchedules(filePath, scenarioId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const schedules = [];

    try {
      await client.query('BEGIN');

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push(row);
      });

      for (const row of rows) {
        const aircraftNumber = parseInt(row.getCell(1).value);
        const routeString = row.getCell(2).value;
        const priority = parseInt(row.getCell(3).value);
        const monday = row.getCell(4).value === 1 || row.getCell(4).value === true;
        const tuesday = row.getCell(5).value === 1 || row.getCell(5).value === true;
        const wednesday = row.getCell(6).value === 1 || row.getCell(6).value === true;
        const thursday = row.getCell(7).value === 1 || row.getCell(7).value === true;
        const friday = row.getCell(8).value === 1 || row.getCell(8).value === true;
        const saturday = row.getCell(9).value === 1 || row.getCell(9).value === true;
        const sunday = row.getCell(10).value === 1 || row.getCell(10).value === true;
        const startDate = row.getCell(11).value;

        // Get fleet plan ID
        const fleetResult = await client.query(
          'SELECT id FROM fleet_plans WHERE scenario_id = $1 AND aircraft_number = $2',
          [scenarioId, aircraftNumber]
        );

        if (!routeString) continue;

        // Parse route string to get origin and destination codes
        const [originCode, destCode] = routeString.split('-');

        const originRes = await client.query('SELECT id FROM airports WHERE code = $1', [originCode]);
        const destRes = await client.query('SELECT id FROM airports WHERE code = $1', [destCode]);

        if (fleetResult.rows.length > 0 && originRes.rows.length > 0 && destRes.rows.length > 0) {
          const result = await client.query(
            `INSERT INTO schedules 
             (scenario_id, fleet_plan_id, origin_id, destination_id, full_route_string, priority,
              monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [scenarioId, fleetResult.rows[0].id, originRes.rows[0].id, destRes.rows[0].id, routeString,
              priority, monday, tuesday, wednesday, thursday, friday, saturday, sunday, startDate]
          );
          schedules.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');
      return schedules;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import pricing from Excel
   * Expected columns: Route String, Segment, Fare (USD), Effective Date
   */
  static async importPricing(filePath, scenarioId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const pricing = [];

    try {
      await client.query('BEGIN');

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push(row);
      });

      for (const row of rows) {
        const routeString = row.getCell(1).value;
        const segment = row.getCell(2).value;
        const fareVal = row.getCell(3).value;
        const effectiveDate = row.getCell(4).value;

        if (!routeString) continue;

        const fareUSD = typeof fareVal === 'string' ? parseFloat(fareVal) : fareVal;
        const [originCode, destCode] = routeString.split('-');

        const originRes = await client.query('SELECT id FROM airports WHERE code = $1', [originCode]);
        const destRes = await client.query('SELECT id FROM airports WHERE code = $1', [destCode]);

        if (originRes.rows.length > 0 && destRes.rows.length > 0) {
          const result = await client.query(
            `INSERT INTO pricing (scenario_id, origin_id, destination_id, segment, fare_usd, effective_date)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (scenario_id, origin_id, destination_id, segment) DO UPDATE SET
               fare_usd = $5, effective_date = EXCLUDED.effective_date
             RETURNING *`,
            [scenarioId, originRes.rows[0].id, destRes.rows[0].id, segment || 'General', fareUSD, effectiveDate || new Date()]
          );
          pricing.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');
      return pricing;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import master pricing from Excel
   * Expected columns: Route String, Segment, Fare (USD)
   */
  static async importMasterPricing(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const pricing = [];

    try {
      await client.query('BEGIN');

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push(row);
      });

      for (const row of rows) {
        const routeString = row.getCell(1).value;
        const segment = row.getCell(2).value;
        const fareVal = row.getCell(3).value;

        if (!routeString) continue;

        const fareUSD = typeof fareVal === 'string' ? parseFloat(fareVal) : fareVal;
        const [originCode, destCode] = routeString.split('-');

        const originRes = await client.query('SELECT id FROM airports WHERE code = $1', [originCode]);
        const destRes = await client.query('SELECT id FROM airports WHERE code = $1', [destCode]);

        if (originRes.rows.length > 0 && destRes.rows.length > 0) {
          const result = await client.query(
            `INSERT INTO master_pricing (origin_id, destination_id, segment, fare_usd)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (origin_id, destination_id, segment) DO UPDATE SET
               fare_usd = $4, updated_at = NOW()
             RETURNING *`,
            [originRes.rows[0].id, destRes.rows[0].id, segment || 'General', fareUSD]
          );
          pricing.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');
      return pricing;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import maintenance event types (Event Dictionary) from Excel
   * Expected columns: Aircraft Type Code, Event Name, Block Hours Interval,
   *                   Flight Cycles Interval, Months Interval, APU Hours,
   *                   Event Cost (USD), Downtime (Days) [optional col 8]
   *
   * Handles formula cells: ExcelJS returns { formula, result } for computed cells.
   */
  static async importMaintenanceEvents(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    const client = await pool.connect();
    const events = [];

    // Helper: safely extract numeric value from a cell, handling formula objects
    const cellNum = (row, col) => {
      const raw = row.getCell(col).value;
      if (raw === null || raw === undefined) return null;
      // ExcelJS formula cell: { formula: '...', result: <value> }
      const resolved = (raw !== null && typeof raw === 'object' && 'result' in raw)
        ? raw.result
        : raw;
      const n = parseFloat(resolved);
      return isNaN(n) ? null : n;
    };

    const cellStr = (row, col) => {
      const raw = row.getCell(col).value;
      if (raw === null || raw === undefined) return null;
      const resolved = (raw !== null && typeof raw === 'object' && 'result' in raw)
        ? raw.result
        : raw;
      return resolved?.toString().trim() || null;
    };

    try {
      await client.query('BEGIN');

      // Detect if downtime_days column exists (migration may not have been run yet)
      const colCheck = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'maintenance_event_types' AND column_name = 'downtime_days'`
      );
      const hasDowntimeDays = colCheck.rows.length > 0;

      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) rows.push({ row, rowNumber });
      });

      for (const { row, rowNumber } of rows) {
        const acTypeCode   = cellStr(row, 1);
        const eventName    = cellStr(row, 2);
        const blockHours   = cellNum(row, 3);
        const flightCycles = cellNum(row, 4);
        const intervalMonths = cellNum(row, 5);
        const apuHours     = cellNum(row, 6);
        const eventCost    = cellNum(row, 7);
        const downtimeDays = hasDowntimeDays ? (Math.round(cellNum(row, 8) || 0)) : 0;

        // Validation: skip rows missing required fields
        if (!acTypeCode || !eventName || eventCost === null || isNaN(eventCost)) {
          continue;
        }

        const typeRes = await client.query(
          'SELECT id FROM aircraft_types WHERE code = $1',
          [acTypeCode]
        );

        if (typeRes.rows.length === 0) {
          continue;
        }
        const aircraftTypeId = typeRes.rows[0].id;

        // Safe upsert: no unique constraint on the table → SELECT first
        const existRes = await client.query(
          `SELECT id FROM maintenance_event_types
           WHERE aircraft_type_id = $1 AND event_name = $2`,
          [aircraftTypeId, eventName]
        );

        let result;
        if (existRes.rows.length > 0) {
          const updateQuery = hasDowntimeDays
            ? `UPDATE maintenance_event_types
               SET interval_block_hours   = $1,
                   interval_flight_cycles = $2,
                   interval_months        = $3,
                   interval_apu_hours     = $4,
                   event_cost_usd         = $5,
                   downtime_days          = $6,
                   updated_at             = NOW()
               WHERE id = $7
               RETURNING *`
            : `UPDATE maintenance_event_types
               SET interval_block_hours   = $1,
                   interval_flight_cycles = $2,
                   interval_months        = $3,
                   interval_apu_hours     = $4,
                   event_cost_usd         = $5,
                   updated_at             = NOW()
               WHERE id = $6
               RETURNING *`;

          const updateParams = hasDowntimeDays
            ? [blockHours, flightCycles, intervalMonths, apuHours, eventCost, downtimeDays, existRes.rows[0].id]
            : [blockHours, flightCycles, intervalMonths, apuHours, eventCost, existRes.rows[0].id];

          result = await client.query(updateQuery, updateParams);
        } else {
          const insertQuery = hasDowntimeDays
            ? `INSERT INTO maintenance_event_types
               (aircraft_type_id, event_name, interval_block_hours, interval_flight_cycles,
                interval_months, interval_apu_hours, event_cost_usd, downtime_days)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *`
            : `INSERT INTO maintenance_event_types
               (aircraft_type_id, event_name, interval_block_hours, interval_flight_cycles,
                interval_months, interval_apu_hours, event_cost_usd)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *`;

          const insertParams = hasDowntimeDays
            ? [aircraftTypeId, eventName, blockHours, flightCycles, intervalMonths, apuHours, eventCost, downtimeDays]
            : [aircraftTypeId, eventName, blockHours, flightCycles, intervalMonths, apuHours, eventCost];

          result = await client.query(insertQuery, insertParams);
        }
        events.push(result.rows[0]);
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
}

module.exports = ExcelImportService;
