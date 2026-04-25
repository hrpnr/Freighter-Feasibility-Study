import React, { useState, useEffect } from 'react';
import api, { importService } from '../services/api';
import './Import.css';

function Import() {
  const [file, setFile] = useState(null);
  const [importType, setImportType] = useState('aircraft-types');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async (e) => {
    e.preventDefault();

    if (!file) {
      alert('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    let endpoint = '';
    switch (importType) {
      case 'aircraft-types':
        endpoint = '/import/aircraft-types';
        break;
      case 'airports':
        endpoint = '/import/airports';
        break;

      case 'master-pricing':
        endpoint = '/import/master-pricing';
        break;
      case 'maintenance-events':
        endpoint = '/import/maintenance-events';
        break;
      default:
        return;
    }

    setLoading(true);
    try {
      const response = await importService.importData(endpoint, formData);
      setResult(response.data);
      setFile(null);
    } catch (error) {
      console.error('Error importing:', error);
      alert(error.niceMessage || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const renderGuide = () => {
    switch (importType) {
      case 'aircraft-types':
        return (
          <div className="guide-table-container">
            <h4>Aircraft Types Excel Layout</h4>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>MTOW (tons)</th>
                  <th>Speed (knots)</th>
                  <th>Fuel Burn (L/hr)</th>
                  <th>Payload (kg)</th>
                  <th>Range (km)</th>
                  <th>Year</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>B738F</td>
                  <td>Boeing 737-800BCF</td>
                  <td>79.0</td>
                  <td>450</td>
                  <td>2500.0</td>
                  <td>23900</td>
                  <td>3700</td>
                  <td>2015</td>
                </tr>
                <tr>
                  <td>A321F</td>
                  <td>Airbus A321P2F</td>
                  <td>89.0</td>
                  <td>460</td>
                  <td>2800.0</td>
                  <td>27000</td>
                  <td>4100</td>
                  <td>2018</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      case 'airports':
        return (
          <div className="guide-table-container">
            <h4>Airports Excel Layout</h4>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Region</th>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>Opening</th>
                  <th>Closing</th>
                  <th>HAS HLL</th>
                  <th>Landing Fee</th>
                  <th>Parking Fee</th>
                  <th>Nav Fee</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>CGK</td>
                  <td>Soekarno-Hatta</td>
                  <td>Jakarta</td>
                  <td>Indonesia</td>
                  <td>DOM</td>
                  <td>-6.1256</td>
                  <td>106.6558</td>
                  <td>00:00</td>
                  <td>23:59</td>
                  <td>TRUE</td>
                  <td>1200.00</td>
                  <td>300.00</td>
                  <td>250.00</td>
                </tr>
                <tr>
                  <td>SIN</td>
                  <td>Changi</td>
                  <td>Singapore</td>
                  <td>Singapore</td>
                  <td>INT</td>
                  <td>1.3644</td>
                  <td>103.9915</td>
                  <td>00:00</td>
                  <td>23:59</td>
                  <td>TRUE</td>
                  <td>1500.00</td>
                  <td>500.00</td>
                  <td>400.00</td>
                </tr>
              </tbody>
            </table>
            <p className="guide-note">Note: Lat/Lon in decimal. Opening/Closing as HH:mm. Fees are per aircraft flight cycle (landing/parking/navigation).</p>
          </div>
        );

      case 'master-pricing':
        return (
          <div className="guide-table-container">
            <h4>Master Pricing Excel Layout</h4>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Segment</th>
                  <th>Fare (USD)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>CGK-SUB</td>
                  <td>General</td>
                  <td>551.0</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      case 'maintenance-events':
        return (
          <div className="guide-table-container">
            <h4>Maintenance Events (Event Dictionary) Excel Layout</h4>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>AC Type Code</th>
                  <th>Event Name</th>
                  <th>Block Hrs Interval</th>
                  <th>Flight Cycles Interval</th>
                  <th>Months Interval</th>
                  <th>APU Hours</th>
                  <th>Cost (USD) *</th>
                  <th>Downtime (Days)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>B738F</td>
                  <td>C-Check</td>
                  <td>7500</td>
                  <td>5000</td>
                  <td>24</td>
                  <td></td>
                  <td>1500000</td>
                  <td>21</td>
                </tr>
                <tr>
                  <td>B738F</td>
                  <td>A-Check</td>
                  <td>600</td>
                  <td></td>
                  <td>6</td>
                  <td></td>
                  <td>35000</td>
                  <td>3</td>
                </tr>
                <tr>
                  <td>A320F</td>
                  <td>Engine Overhaul</td>
                  <td>20000</td>
                  <td></td>
                  <td>48</td>
                  <td>3000</td>
                  <td>2500000</td>
                  <td>45</td>
                </tr>
              </tbody>
            </table>
            <p className="guide-note">
              ⚠️ <strong>Required:</strong> AC Type Code, Event Name, Cost (USD). All interval fields are optional — leave blank if not applicable.<br/>
              📌 AC Type Code must match an existing Aircraft Type in the system (e.g. B738F, A320F).<br/>
              🔄 If an event with the same name already exists for that aircraft type, it will be <strong>updated</strong>.<br/>
              ✈️ <strong>Downtime (Days):</strong> The aircraft will be <strong>grounded</strong> (no flights, no variable revenue) for this many days starting from the maintenance due date. Fixed costs (lease, insurance, crew) still apply. Enter 0 or leave blank if no grounding occurs.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="import-page">
      <h1>Import Data</h1>

      <form onSubmit={handleImport}>
        <div className="form-group">
          <label>Import Type:</label>
          <select value={importType} onChange={(e) => setImportType(e.target.value)}>
            <option value="aircraft-types">Aircraft Types</option>
            <option value="airports">Airports</option>

            <option value="master-pricing">Master Pricing</option>
            <option value="maintenance-events">Maintenance Events (Event Dictionary)</option>
          </select>
        </div>



        <div className="form-group">
          <label>Excel File:</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files[0])}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Importing...' : 'Import Data'}
        </button>
      </form>

      {result && (
        <div className="result">
          <h3>{result.message}</h3>
          <p>Records processed: {result.count}</p>
        </div>
      )}

      <div className="import-guide">
        <h3>Excel Format Guide (Selected: {importType.replace(/-/g, ' ').toUpperCase()})</h3>
        {renderGuide()}
      </div>
    </div>
  );
}

export default Import;
