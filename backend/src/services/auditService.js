const pool = require('../database/pool');

class AuditService {
    /**
     * Log an action to the audit_log table
     * @param {Object} entry - Audit entry details
     * @param {string} entry.userId - UUID of the user performing the action
     * @param {string} entry.scenarioId - UUID of the scenario involved
     * @param {string} entry.tableName - Name of the table modified
     * @param {string} entry.recordId - UUID of the record modified
     * @param {string} entry.action - Action performed (CREATE, UPDATE, DELETE)
     * @param {Object} entry.oldValue - Previous state of the record
     * @param {Object} entry.newValue - New state of the record
     */
    static async log(entry) {
        try {
            await pool.query(
                `INSERT INTO audit_log (user_id, scenario_id, table_name, record_id, action, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    entry.userId,
                    entry.scenarioId,
                    entry.tableName,
                    entry.recordId,
                    entry.action,
                    entry.oldValue ? JSON.stringify(entry.oldValue) : null,
                    entry.newValue ? JSON.stringify(entry.newValue) : null
                ]
            );
        } catch (error) {
            console.error('Failed to write audit log:', error);
            // We don't throw here to avoid failing the main transaction for a logging error
        }
    }
}

module.exports = AuditService;
