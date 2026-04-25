const pool = require('../database/pool');

class SchedulesService {
  static async getByScenario(scenarioId) {
    const result = await pool.query(
      `SELECT s.*, 
              s.departure_time,
              ROUND(CAST(
                6371 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                    cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
                    cos(radians(d.longitude) - radians(o.longitude)) + 
                    sin(radians(o.latitude)) * sin(radians(d.latitude))
                  ))
                ) AS numeric), 0) as distance_km,
              ROUND(CAST(
                (6371 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                    cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
                    cos(radians(d.longitude) - radians(o.longitude)) + 
                    sin(radians(o.latitude)) * sin(radians(d.latitude))
                  ))
                ) / 1.852 / NULLIF(at.speed_knots, 0)) * (1 + 0.10)
              AS numeric), 1) as flight_time,
              0.25 as taxi_time, 
              ROUND(CAST(
                (6371 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                    cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
                    cos(radians(d.longitude) - radians(o.longitude)) + 
                    sin(radians(o.latitude)) * sin(radians(d.latitude))
                  ))
                ) / 1.852 / NULLIF(at.speed_knots, 0)) * (1 + 0.10) + 0.25
              AS numeric), 1) as block_hours,
              o.code as origin_code, d.code as dest_code,
              o.opening_hour as origin_op_start, o.closing_hour as origin_op_end,
              d.opening_hour as dest_op_start, d.closing_hour as dest_op_end,
              d.has_hll as dest_has_hll, d.region,
              fp.aircraft_number, fp.tail_number,
              at.code as aircraft_type_code,
              at.speed_knots, at.range_km
       FROM schedules s
       JOIN airports o ON s.origin_id = o.id
       JOIN airports d ON s.destination_id = d.id
       JOIN fleet_plans fp ON s.fleet_plan_id = fp.id
       JOIN aircraft_types at ON fp.aircraft_type_id = at.id
       WHERE s.scenario_id = $1
       ORDER BY fp.aircraft_number, s.priority`,
      [scenarioId]
    );

    const schedules = result.rows;
    if (schedules.length === 0) return [];

    // Fetch manifest items for all these schedules
    const schedIds = schedules.map(s => s.id);
    const manifestResult = await pool.query(
      `SELECT sm.*, a.code as dest_code
       FROM schedule_manifest sm
       JOIN airports a ON sm.od_destination_id = a.id
       WHERE sm.schedule_id = ANY($1)`,
      [schedIds]
    );

    const manifestMap = {};
    manifestResult.rows.forEach(row => {
      if (!manifestMap[row.schedule_id]) manifestMap[row.schedule_id] = [];
      manifestMap[row.schedule_id].push(row);
    });

    return schedules.map(s => ({
      ...s,
      manifest_items: manifestMap[s.id] || []
    }));
  }

  static async create(scenarioId, data) {
    const {
      fleet_plan_id, origin_id, destination_id, full_route_string, route_category, priority,
      monday, tuesday, wednesday, thursday, friday, saturday, sunday,
      start_date, end_date, departure_time
    } = data;

    let rotation_group_id = null;
    if (priority === 1) {
      const uuidRes = await pool.query('SELECT uuid_generate_v4() as uuid');
      rotation_group_id = uuidRes.rows[0].uuid;
    } else {
      const prevRes = await pool.query(
        'SELECT rotation_group_id FROM schedules WHERE scenario_id = $1 AND fleet_plan_id = $2 AND priority = $3 LIMIT 1',
        [scenarioId, fleet_plan_id, priority - 1]
      );
      if (prevRes.rows.length > 0 && prevRes.rows[0].rotation_group_id) {
        rotation_group_id = prevRes.rows[0].rotation_group_id;
      } else {
        const uuidRes = await pool.query('SELECT uuid_generate_v4() as uuid');
        rotation_group_id = uuidRes.rows[0].uuid;
      }
    }

    const result = await pool.query(
      `INSERT INTO schedules 
       (scenario_id, fleet_plan_id, origin_id, destination_id, full_route_string, route_category, priority,
        monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        start_date, end_date, departure_time, rotation_group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [scenarioId, fleet_plan_id, origin_id, destination_id, full_route_string, route_category, priority,
        monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        start_date, end_date, departure_time, rotation_group_id]
    );

    const newSchedId = result.rows[0].id;
    const fullRes = await pool.query(
      `SELECT s.*, 
              ROUND(CAST(
                (6371 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                    cos(radians(o.latitude)) * cos(radians(d.latitude)) * 
                    cos(radians(d.longitude) - radians(o.longitude)) + 
                    sin(radians(o.latitude)) * sin(radians(d.latitude))
                  ))
                ) / 1.852 / NULLIF(at.speed_knots, 0)) * (1 + 0.10) + 0.25
              AS numeric), 1) as block_hours,
              o.code as origin_code, d.code as dest_code,
              o.opening_hour as origin_op_start, o.closing_hour as origin_op_end,
              d.opening_hour as dest_op_start, d.closing_hour as dest_op_end,
              d.has_hll as dest_has_hll,
              fp.aircraft_number, fp.tail_number,
              at.code as aircraft_type_code,
              at.speed_knots, at.range_km
       FROM schedules s
       JOIN airports o ON s.origin_id = o.id
       JOIN airports d ON s.destination_id = d.id
       JOIN fleet_plans fp ON s.fleet_plan_id = fp.id
       JOIN aircraft_types at ON fp.aircraft_type_id = at.id
       WHERE s.id = $1`,
      [newSchedId]
    );

    return fullRes.rows[0];
  }

  static async update(id, data) {
    const {
      origin_id, destination_id, full_route_string, route_category, priority,
      monday, tuesday, wednesday, thursday, friday, saturday, sunday,
      start_date, end_date, departure_time
    } = data;

    const result = await pool.query(
      `UPDATE schedules 
       SET origin_id = $1, destination_id = $2, full_route_string = $3, route_category = $4, priority = $5,
           monday = $6, tuesday = $7, wednesday = $8, thursday = $9,
           friday = $10, saturday = $11, sunday = $12,
           start_date = $13, end_date = $14, departure_time = $15
       WHERE id = $16
       RETURNING *`,
      [origin_id, destination_id, full_route_string, route_category, priority,
        monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        start_date, end_date, departure_time, id]
    );
    return result.rows[0];
  }

  static async updateRotation(rotationGroupId, data) {
    const {
      route_category, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date
    } = data;

    await pool.query(
      `UPDATE schedules 
       SET route_category = $1,
           monday = $2, tuesday = $3, wednesday = $4, thursday = $5, friday = $6, saturday = $7, sunday = $8,
           start_date = $9, end_date = $10
       WHERE rotation_group_id = $11`,
      [route_category, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date, rotationGroupId]
    );
    return true;
  }

  static async delete(id) {
    await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
    return true;
  }

  static async deleteRotation(rotationGroupId) {
    await pool.query('DELETE FROM schedules WHERE rotation_group_id = $1', [rotationGroupId]);
    return true;
  }

  static async bulkCreateRotation(scenarioId, segments) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const uuidRes = await client.query('SELECT uuid_generate_v4() as uuid');
      const rotation_group_id = uuidRes.rows[0].uuid;
      const createdSegments = [];

      for (const segment of segments) {
        // 1. Insert the schedule leg
        const schedResult = await client.query(
          `INSERT INTO schedules 
           (scenario_id, fleet_plan_id, origin_id, destination_id, full_route_string, route_category, priority,
            monday, tuesday, wednesday, thursday, friday, saturday, sunday,
            start_date, end_date, departure_time, rotation_group_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           RETURNING *`,
          [scenarioId, segment.fleet_plan_id, segment.origin_id, segment.destination_id, segment.full_route_string, segment.route_category || 'bo_dom', segment.priority,
            segment.monday, segment.tuesday, segment.wednesday, segment.thursday, segment.friday, segment.saturday, segment.sunday,
            segment.start_date, segment.end_date, segment.departure_time, rotation_group_id]
        );
        
        const newSched = schedResult.rows[0];
        
        // 2. Insert manifest items for this leg
        if (segment.manifest_items && Array.isArray(segment.manifest_items)) {
          for (const item of segment.manifest_items) {
            await client.query(
              `INSERT INTO schedule_manifest 
               (schedule_id, od_origin_id, od_destination_id, weight_kg, yield_usd_per_kg, is_transit)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [newSched.id, item.od_origin_id || newSched.origin_id, item.od_destination_id || newSched.destination_id, 
               item.weight_kg, item.yield_usd_per_kg, item.is_transit || false]
            );
          }
        }
        
        createdSegments.push(newSched);
      }
      await client.query('COMMIT');
      return { rotation_group_id, segments: createdSegments };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteAll(scenarioId) {
    await pool.query('DELETE FROM schedules WHERE scenario_id = $1', [scenarioId]);
    return true;
  }

  static async deleteWeek(id, dayField) {
    const row = await pool.query(`SELECT * FROM schedules WHERE id = $1`, [id]);
    if (row.rows.length === 0) return null;
    const sched = row.rows[0];
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const remainingDays = validDays.filter(d => d !== dayField && sched[d]);
    
    if (remainingDays.length === 0) {
      await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
      return { deleted: true };
    }
    await pool.query(`UPDATE schedules SET ${dayField} = false WHERE id = $1`, [id]);
    return { modified: true };
  }

  static async deleteMonth(id, d) {
    // d is the Date object for the month to delete
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    
    const monthStart = `${yStr}-${mStr}-01`;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
    const nextMonthStart = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const nextMonthStartStr = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}-${String(nextMonthStart.getDate()).padStart(2, '0')}`;

    const row = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    if (row.rows.length === 0) return null;

    const sched = row.rows[0];
    const toDateStr = (date) => (date instanceof Date ? date.toISOString().split('T')[0] : date?.substring(0, 10)) || '0000-01-01';
    const schedStart = toDateStr(sched.start_date);
    const schedEnd = toDateStr(sched.end_date);

    if (schedStart >= monthStart && schedEnd <= monthEndStr) {
      await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
      return { action: 'deleted' };
    }

    if (schedStart < monthStart) {
      const dayBefore = new Date(d.getFullYear(), d.getMonth(), 0);
      const dayBeforeStr = `${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, '0')}-${String(dayBefore.getDate()).padStart(2, '0')}`;
      await pool.query('UPDATE schedules SET end_date = $1 WHERE id = $2', [dayBeforeStr, id]);
      return { action: 'trimmed_end' };
    } else {
      await pool.query('UPDATE schedules SET start_date = $1 WHERE id = $2', [nextMonthStartStr, id]);
      return { action: 'moved_start' };
    }
  }
}

module.exports = SchedulesService;
