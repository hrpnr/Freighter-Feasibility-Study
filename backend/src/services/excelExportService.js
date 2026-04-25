const ExcelJS = require('exceljs');
const pool = require('../database/pool');

class ExcelExportService {
  /**
   * Generates a monthly P&L excel export stream or buffer based on scenarioId
   */
  static async exportMonthlyPnL(scenarioId, responseStream) {
    // Fetch P&L data
    const pnlResult = await pool.query(
      `SELECT * FROM monthly_pnl WHERE scenario_id = $1 ORDER BY month_date`,
      [scenarioId]
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('P&L');

    // Add headers
    worksheet.columns = [
      { header: 'Month', key: 'month_date', width: 15 },
      { header: 'Aircraft', key: 'num_aircraft', width: 10 },
      { header: 'Block Hours', key: 'block_hours', width: 12 },
      { header: 'Flight Cycles', key: 'flight_cycles', width: 12 },
      { header: 'Revenue', key: 'total_revenue_usd', width: 15 },
      { header: 'Lease', key: 'lease_cost_usd', width: 12 },
      { header: 'Fuel', key: 'fuel_cost_usd', width: 12 },
      { header: 'Maintenance', key: 'maintenance_cost_usd', width: 12 },
      { header: 'Total Cost', key: 'total_cost_usd', width: 15 },
      { header: 'Profit/Loss', key: 'profit_loss_usd', width: 15 },
      { header: 'Cumulative P&L', key: 'cumulative_profit_loss_usd', width: 15 },
      { header: 'BE Load Factor', key: 'break_even_load_factor', width: 15 },
      { header: 'BE Block Hours', key: 'break_even_block_hours', width: 15 }
    ];

    // Add data
    worksheet.addRows(pnlResult.rows);

    // Format as currency
    const currencyCols = ['E', 'F', 'G', 'H', 'I', 'J', 'K'];
    currencyCols.forEach(col => {
      worksheet.getColumn(col).numFmt = '$#,##0.00';
    });

    // Write to the provided stream/response
    await workbook.xlsx.write(responseStream);
  }
}

module.exports = ExcelExportService;
