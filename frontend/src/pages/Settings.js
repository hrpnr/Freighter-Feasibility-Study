import React, { useState, useEffect } from 'react';
import { 
  aircraftTypeService, 
  airportService, 
  pricingService, 
  holidayService, 
  masterSettingsService 
} from '../services/api';
import toast from 'react-hot-toast';
import MaintenanceEventTypes from '../components/MaintenanceEventTypes';
import './Settings.css';


const formatCoordinate = (value, type) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const val = parseFloat(value);
  const absolute = Math.abs(val);
  const degrees = Math.floor(absolute);
  const minutes = Math.round((absolute - degrees) * 60);

  let direction = '';
  if (type === 'lat') {
    direction = val >= 0 ? 'N' : 'S';
  } else {
    direction = val >= 0 ? 'E' : 'W';
  }

  return `${degrees}°${minutes.toString().padStart(2, '0')}' ${direction}`;
};

function Settings() {
  const [activeTab, setActiveTab] = useState('aircraft');
  const [aircraftTypes, setAircraftTypes] = useState([]);
  const [airports, setAirports] = useState([]);
  const [masterPricing, setMasterPricing] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [masterParameters, setMasterParameters] = useState({});
  const currentParams = masterParameters;
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({});
  const isMasterView = true; // Global settings is always master view

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      if (activeTab === 'aircraft') {
        const response = await aircraftTypeService.getAll();
        setAircraftTypes(response.data);
      } else if (activeTab === 'airports') {
        const [airRes, typesRes] = await Promise.all([
          airportService.getAll(),
          aircraftTypeService.getAll()
        ]);
        setAirports(airRes.data);
        setAircraftTypes(typesRes.data);
      } else if (activeTab === 'pricing') {
        const airportsRes = await airportService.getAll();
        setAirports(airportsRes.data);
        fetchMasterPricing();
      } else if (activeTab === 'holidays') {
        fetchMasterHolidays();
      } else if (activeTab === 'parameters') {
        fetchMasterParameters();
      }
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch settings data');
    }
  };

  const fetchMasterParameters = async () => {
    try {
      const response = await masterSettingsService.getParameters();
      setMasterParameters(response.data);
    } catch (error) { toast.error(error.niceMessage || 'Failed to fetch master parameters'); }
  };

  const fetchMasterPricing = async () => {
    try {
      const response = await pricingService.getAllMaster();
      setMasterPricing(response.data);
    } catch (error) { toast.error(error.niceMessage || 'Failed to fetch master pricing'); }
  };

  const fetchMasterHolidays = async () => {
    try {
      const response = await holidayService.getAllMaster();
      setHolidays(response.data);
    } catch (error) { toast.error(error.niceMessage || 'Failed to fetch global holidays'); }
  };
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      if (activeTab === 'pricing') {
        editing 
          ? await pricingService.updateMaster(editing.id, formData)
          : await pricingService.createMaster(formData);
      } else if (activeTab === 'holidays') {
        editing
          ? await holidayService.updateMaster(editing.id, formData)
          : await holidayService.createMaster(formData);
      } else if (activeTab === 'parameters') {
        await masterSettingsService.updateParameters(formData);
      } else if (activeTab === 'airports') {
        editing
          ? await airportService.update(editing.id, formData)
          : await airportService.create(formData);
      } else if (activeTab === 'aircraft') {
        editing
          ? await aircraftTypeService.update(editing.id, formData)
          : await aircraftTypeService.create(formData);
      }

      toast.success('Successfully saved');
      setShowModal(false);
      setEditing(null);
      setFormData({});

      if (activeTab === 'parameters') fetchMasterParameters();
      else fetchData();
    } catch (error) {
      toast.error(error.niceMessage || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      if (activeTab === 'pricing') await pricingService.deleteMaster(id);
      else if (activeTab === 'holidays') await holidayService.deleteMaster(id);
      else if (activeTab === 'airports') await airportService.delete(id);
      else if (activeTab === 'aircraft') await aircraftTypeService.delete(id);

      toast.success('Deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to delete');
    }
  };

  const handleRemoveAllPricing = async () => {
    if (!window.confirm('Are you sure you want to completely remove ALL master pricing records? This action cannot be undone.')) return;
    try {
      // Use the bulk backend endpoint to avoid 429 Too Many Requests errors
      await pricingService.deleteAllMaster();
      toast.success('Successfully removed all master pricing records');
      fetchMasterPricing();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to remove some pricing records');
      fetchMasterPricing();
    }
  };

  const openModal = (item = null) => {
    setEditing(item);
    if (item) {
      setFormData(item);
    } else {
      setFormData({});
    }
    setShowModal(true);
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="tabs">
        <button
          className={activeTab === 'aircraft' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('aircraft')}
        >
          Aircraft Types
        </button>
        <button
          className={activeTab === 'airports' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('airports')}
        >
          Airports & Fees
        </button>
        <button
          className={activeTab === 'pricing' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('pricing')}
        >
          Pricing
        </button>
        <button
          className={activeTab === 'holidays' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('holidays')}
        >
          Holidays
        </button>
        <button
          className={activeTab === 'parameters' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('parameters')}
        >
          Parameters
        </button>
        <button
          className={activeTab === 'maintenance' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('maintenance')}
        >
          Maintenance Events
        </button>
      </div>

      <div className="tab-content">
        <div className="content-header">
          <h2>
            {activeTab === 'aircraft' ? 'Aircraft Types' :
              activeTab === 'airports' ? 'Airports' :
                activeTab === 'pricing' ? 'Route Pricing' :
                  activeTab === 'fees' ? 'Airport Fees' :
                    activeTab === 'holidays' ? 'Holidays' : 'Parameters'}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {activeTab === 'pricing' && (
              <button 
                onClick={handleRemoveAllPricing}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  padding: '0.6rem 1.2rem',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = '#ef4444';
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
              >
                🗑️ Remove All
              </button>
            )}
            {activeTab !== 'parameters' && (
              <button className="btn-primary" onClick={() => openModal()}>
                + Add New
              </button>
            )}
            {activeTab === 'parameters' && (
              <button className="btn-primary" onClick={() => handleSubmit({ preventDefault: () => { } })}>
                Save Parameters
              </button>
            )}
          </div>
        </div>

        {activeTab === 'aircraft' && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>MTOW (tons)</th>
                <th>Speed (knots)</th>
                <th>Fuel Burn (L/hr)</th>
                <th>Max Payload (kg)</th>
                <th>Range (km)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {aircraftTypes.map(at => (
                <tr key={at.id}>
                  <td>{at.code}</td>
                  <td>{at.name}</td>
                  <td>{at.mtow_tons}</td>
                  <td>{at.speed_knots}</td>
                  <td>{at.fuel_burn_liter_per_hour}</td>
                  <td>{at.max_payload_kg ? parseFloat(at.max_payload_kg).toLocaleString() : '-'}</td>
                  <td>{at.range_km}</td>
                  <td>
                    <button className="btn-small" onClick={() => openModal(at)}>Edit</button>
                    <button className="btn-small btn-danger" onClick={() => handleDelete(at.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'airports' && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Region</th>
                <th>HLL</th>
                <th>Landing (USD)</th>
                <th>Parking (USD)</th>
                <th>Nav (USD)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {airports.map(ap => (
                <tr key={ap.id}>
                  <td>{ap.code}</td>
                  <td>{ap.name}</td>
                  <td>{ap.region}</td>
                  <td>{ap.has_hll ? '✅' : '❌'}</td>
                  <td>${parseFloat(ap.landing_fee_usd || 0).toFixed(2)}</td>
                  <td>${parseFloat(ap.parking_fee_usd || 0).toFixed(2)}</td>
                  <td>${parseFloat(ap.navigation_fee_usd || 0).toFixed(2)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button className="btn-small" onClick={() => openModal(ap)}>Edit</button>
                      <button className="btn-small btn-danger" onClick={() => handleDelete(ap.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'pricing' && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Origin</th>
                <th>Destination</th>
                <th>Distance (km)</th>
                <th>Segment</th>
                <th>Fare (USD)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {masterPricing.map(p => (
                <tr key={p.id}>
                  <td>{p.origin_code}</td>
                  <td>{p.dest_code}</td>
                  <td>{Math.round(p.distance_km)}</td>
                  <td>{p.segment || 'General'}</td>
                  <td>${p.fare_usd}</td>
                  <td>
                    <button className="btn-small" onClick={() => openModal(p)}>Edit</button>
                    <button className="btn-small btn-danger" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'holidays' && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Country</th>
                <th>Impact Period</th>
                <th>Operating?</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map(h => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td>{new Date(h.holiday_date).toLocaleDateString()}</td>
                  <td>{h.country}</td>
                  <td>{new Date(h.impact_start_date).toLocaleDateString()} - {new Date(h.impact_end_date).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {h.is_operating ? '✅' : '❌'}
                    </div>
                  </td>
                  <td>
                    <button className="btn-small" onClick={() => openModal(h)}>Edit</button>
                    <button className="btn-small btn-danger" onClick={() => handleDelete(h.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'parameters' && (
          <div className="parameters-grid">
            <div className="param-section">
              <h3>Market & Growth</h3>
              <div className="form-group">
                <label>Traffic Growth / Yr (%)</label>
                <input type="number" step="0.01" value={(currentParams.traffic_growth_rate_annual * 100) || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) / 100;
                    setMasterParameters({ ...masterParameters, traffic_growth_rate_annual: val });
                    setFormData({ ...formData, traffic_growth_rate_annual: val });
                  }} />
              </div>
              <div className="form-group">
                <label>Fare Growth / Yr (%)</label>
                <input type="number" step="0.01" value={(currentParams.fare_growth_rate_annual * 100) || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) / 100;
                    setMasterParameters({ ...masterParameters, fare_growth_rate_annual: val });
                    setFormData({ ...formData, fare_growth_rate_annual: val });
                  }} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Seasonality (Constant)</label>
                  <input type="number" step="0.01" value={currentParams.seasonality_constant || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, seasonality_constant: val });
                      setFormData({ ...formData, seasonality_constant: val });
                    }} />
                </div>
                <div className="form-group">
                  <label>Seasonality (Slope)</label>
                  <input type="number" step="0.01" value={currentParams.seasonality_slope || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, seasonality_slope: val });
                      setFormData({ ...formData, seasonality_slope: val });
                    }} />
                </div>
              </div>
            </div>

            <div className="param-section">
              <h3>Financials & Rates</h3>
              <div className="form-group">
                <label>USD to IDR Exchange Rate</label>
                <input type="number" value={currentParams.usd_to_idr_rate || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setMasterParameters({ ...masterParameters, usd_to_idr_rate: val });
                    setFormData({ ...formData, usd_to_idr_rate: val });
                  }} />
              </div>
              <div className="form-group">
                <label>Cost of Capital (Annual %)</label>
                <input type="number" step="0.01" value={(currentParams.cost_of_capital * 100) || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) / 100;
                    setMasterParameters({ ...masterParameters, cost_of_capital: val });
                    setFormData({ ...formData, cost_of_capital: val });
                  }} />
              </div>
              <div className="form-group">
                <label>Fuel Price (IDR / Liter)</label>
                <input type="number" value={currentParams.fuel_price_idr_per_liter || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setMasterParameters({ ...masterParameters, fuel_price_idr_per_liter: val });
                    setFormData({ ...formData, fuel_price_idr_per_liter: val });
                  }} />
              </div>
            </div>

            <div className="param-section">
              <h3>Operational Fixed Costs</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>EIS Cost (USD)</label>
                  <input type="number" value={currentParams.eis_cost_usd || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, eis_cost_usd: val });
                      setFormData({ ...formData, eis_cost_usd: val });
                    }} />
                </div>
                <div className="form-group">
                  <label>Redelivery Cost (USD)</label>
                  <input type="number" value={currentParams.redelivery_cost_usd || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, redelivery_cost_usd: val });
                      setFormData({ ...formData, redelivery_cost_usd: val });
                    }} />
                </div>
              </div>
              <div className="form-group">
                <label>Insurance / AC / Month (USD)</label>
                <input type="number" value={currentParams.insurance_cost_per_ac_month_usd || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setMasterParameters({ ...masterParameters, insurance_cost_per_ac_month_usd: val });
                    setFormData({ ...formData, insurance_cost_per_ac_month_usd: val });
                  }} />
              </div>
              <div className="form-group">
                <label>Monthly Overhead (USD)</label>
                <input type="number" value={currentParams.overhead_cost_month_usd || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setMasterParameters({ ...masterParameters, overhead_cost_month_usd: val });
                    setFormData({ ...formData, overhead_cost_month_usd: val });
                  }} />
              </div>
            </div>

            <div className="param-section">
              <h3>Flight Efficiency</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Avg Taxi Time (Hours)</label>
                  <input type="number" step="0.01" value={currentParams.avg_taxi_time_hours || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, avg_taxi_time_hours: val });
                      setFormData({ ...formData, avg_taxi_time_hours: val });
                    }} />
                </div>
                <div className="form-group">
                  <label>Flight Path Nonlinearity (%)</label>
                  <input type="number" step="0.01" value={(currentParams.non_linear_flight_path_effect_pct * 100) || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) / 100;
                      setMasterParameters({ ...masterParameters, non_linear_flight_path_effect_pct: val });
                      setFormData({ ...formData, non_linear_flight_path_effect_pct: val });
                    }} />
                </div>
              </div>
              <div className="form-group">
                  <label>Ground Handling Fee (USD/Airport)</label>
                  <input type="number" value={currentParams.ground_handling_fee_usd || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, ground_handling_fee_usd: val });
                      setFormData({ ...formData, ground_handling_fee_usd: val });
                    }} />
              </div>
            </div>

            <div className="param-section" style={{ gridColumn: 'span 2' }}>
              <h3>Crew Economics</h3>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <h4>Pilot</h4>
                  <div className="form-group">
                    <label>Annual Salary (USD)</label>
                    <input type="number" value={currentParams.pilot_annual_salary_usd || ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setMasterParameters({ ...masterParameters, pilot_annual_salary_usd: val });
                        setFormData({ ...formData, pilot_annual_salary_usd: val });
                      }} />
                  </div>
                  <div className="form-group">
                    <label>Count per AC</label>
                    <input type="number" value={currentParams.pilot_count_per_ac || ''}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setMasterParameters({ ...masterParameters, pilot_count_per_ac: val });
                        setFormData({ ...formData, pilot_count_per_ac: val });
                      }} />
                  </div>
                  <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    <div className="form-group"><label>FATA ($/hr)</label><input type="number" value={currentParams.pilot_fata_per_hour_usd || ''} onChange={e => {const v = parseFloat(e.target.value); setMasterParameters({...masterParameters, pilot_fata_per_hour_usd: v}); setFormData({...formData, pilot_fata_per_hour_usd: v});}} /></div>
                    <div className="form-group"><label>AFB ($/hr)</label><input type="number" value={currentParams.pilot_afb_per_hour_usd || ''} onChange={e => {const v = parseFloat(e.target.value); setMasterParameters({...masterParameters, pilot_afb_per_hour_usd: v}); setFormData({...formData, pilot_afb_per_hour_usd: v});}} /></div>
                    <div className="form-group"><label>LOT ($/hr)</label><input type="number" value={currentParams.pilot_lot_per_hour_usd || ''} onChange={e => {const v = parseFloat(e.target.value); setMasterParameters({...masterParameters, pilot_lot_per_hour_usd: v}); setFormData({...formData, pilot_lot_per_hour_usd: v});}} /></div>
                  </div>
                </div>
                <div>
                  <h4>First Officer</h4>
                  <div className="form-group">
                    <label>Annual Salary (USD)</label>
                    <input type="number" value={currentParams.fo_annual_salary_usd || ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setMasterParameters({ ...masterParameters, fo_annual_salary_usd: val });
                        setFormData({ ...formData, fo_annual_salary_usd: val });
                      }} />
                  </div>
                  <div className="form-group">
                    <label>Count per AC</label>
                    <input type="number" value={currentParams.fo_count_per_ac || ''}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setMasterParameters({ ...masterParameters, fo_count_per_ac: val });
                        setFormData({ ...formData, fo_count_per_ac: val });
                      }} />
                  </div>
                  <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    <div className="form-group"><label>FATA ($/hr)</label><input type="number" value={currentParams.fo_fata_per_hour_usd || ''} onChange={e => {const v = parseFloat(e.target.value); setMasterParameters({...masterParameters, fo_fata_per_hour_usd: v}); setFormData({...formData, fo_fata_per_hour_usd: v});}} /></div>
                    <div className="form-group"><label>AFB ($/hr)</label><input type="number" value={currentParams.fo_afb_per_hour_usd || ''} onChange={e => {const v = parseFloat(e.target.value); setMasterParameters({...masterParameters, fo_afb_per_hour_usd: v}); setFormData({...formData, fo_afb_per_hour_usd: v});}} /></div>
                    <div className="form-group"><label>LOT ($/hr)</label><input type="number" value={currentParams.fo_lot_per_hour_usd || ''} onChange={e => {const v = parseFloat(e.target.value); setMasterParameters({...masterParameters, fo_lot_per_hour_usd: v}); setFormData({...formData, fo_lot_per_hour_usd: v});}} /></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="param-section">
              <h3>Ground Handing Logic</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Ground Time - HLL (Hours)</label>
                  <input type="number" step="0.1" value={currentParams.ground_time_hll_hours || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, ground_time_hll_hours: val });
                      setFormData({ ...formData, ground_time_hll_hours: val });
                    }} />
                </div>
                <div className="form-group">
                  <label>Ground Time - Manual (Hours)</label>
                  <input type="number" step="0.1" value={currentParams.ground_time_manual_hours || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, ground_time_manual_hours: val });
                      setFormData({ ...formData, ground_time_manual_hours: val });
                    }} />
                </div>
              </div>
              <div className="form-group">
                <label>Cargo Density (kg/m3)</label>
                <input type="number" value={currentParams.cargo_density_kg_per_m3 || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setMasterParameters({ ...masterParameters, cargo_density_kg_per_m3: val });
                    setFormData({ ...formData, cargo_density_kg_per_m3: val });
                  }} />
              </div>
            </div>

            <div className="param-section">
              <h3>Initial Uplift (kg)</h3>
              <div className="form-row">
                <div className="form-group"><label>JKT - 2 Legs</label>
                  <input type="number" value={currentParams.initial_uplift_jkt_two_legs || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, initial_uplift_jkt_two_legs: val });
                      setFormData({ ...formData, initial_uplift_jkt_two_legs: val });
                    }} /></div>
                <div className="form-group"><label>JKT - 1 Leg</label>
                  <input type="number" value={currentParams.initial_uplift_jkt_one_leg || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, initial_uplift_jkt_one_leg: val });
                      setFormData({ ...formData, initial_uplift_jkt_one_leg: val });
                    }} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>B.O Domestic</label>
                  <input type="number" value={currentParams.initial_uplift_bo_dom || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, initial_uplift_bo_dom: val });
                      setFormData({ ...formData, initial_uplift_bo_dom: val });
                    }} /></div>
                <div className="form-group"><label>B.O Int</label>
                  <input type="number" value={currentParams.initial_uplift_bo_int || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMasterParameters({ ...masterParameters, initial_uplift_bo_int: val });
                      setFormData({ ...formData, initial_uplift_bo_int: val });
                    }} /></div>
              </div>
            </div>
            <div className="param-section" style={{ gridColumn: 'span 2' }}>
              <h3>🎲 Monte Carlo Risk Model</h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '12px', lineHeight: '1.5' }}>
                These parameters govern how the Monte Carlo simulation models correlation and time-varying uncertainty.
                <br />
                <strong style={{ color: '#a78bfa' }}>Fuel–Traffic Correlation (ρ)</strong>: negative value means higher fuel → compressed demand.
                Range: −1.0 (perfect inverse) to +1.0 (perfect positive).
              </p>
              <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="form-group">
                  <label>Fuel–Traffic Correlation (ρ)</label>
                  <input
                    type="number" step="0.01" min="-1" max="1"
                    value={currentParams.fuel_traffic_correlation_rho ?? -0.35}
                    onChange={e => {
                      const val = Math.max(-1, Math.min(1, parseFloat(e.target.value)));
                      setMasterParameters({ ...masterParameters, fuel_traffic_correlation_rho: val });
                      setFormData({ ...formData, fuel_traffic_correlation_rho: val });
                    }}
                  />
                  <small style={{ color: '#64748b' }}>Default −0.35 (cargo freight empirical estimate)</small>
                </div>
                <div className="form-group">
                  <label>GBM Fuel Volatility σ (Annual)</label>
                  <input
                    type="number" step="0.01" min="0.01" max="0.80"
                    value={currentParams.mc_gbm_fuel_sigma ?? 0.20}
                    onChange={e => {
                      const val = Math.max(0.01, Math.min(0.80, parseFloat(e.target.value)));
                      setMasterParameters({ ...masterParameters, mc_gbm_fuel_sigma: val });
                      setFormData({ ...formData, mc_gbm_fuel_sigma: val });
                    }}
                  />
                  <small style={{ color: '#64748b' }}>Overrides distribution-derived σ if set</small>
                </div>
                <div className="form-group">
                  <label>GBM Traffic Volatility σ (Annual)</label>
                  <input
                    type="number" step="0.01" min="0.01" max="0.80"
                    value={currentParams.mc_gbm_traffic_sigma ?? 0.15}
                    onChange={e => {
                      const val = Math.max(0.01, Math.min(0.80, parseFloat(e.target.value)));
                      setMasterParameters({ ...masterParameters, mc_gbm_traffic_sigma: val });
                      setFormData({ ...formData, mc_gbm_traffic_sigma: val });
                    }}
                  />
                  <small style={{ color: '#64748b' }}>Traffic demand annual volatility</small>
                </div>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'maintenance' && (
          <MaintenanceEventTypes />
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>{editing ? 'Edit' : 'Add'} {
              activeTab === 'aircraft' ? 'Aircraft Type' :
                activeTab === 'airports' ? 'Airport' :
                  activeTab === 'fees' ? 'Airport Fee' :
                    activeTab === 'holidays' ? 'Holiday' : 'Pricing'
            }</h2>

            <form onSubmit={handleSubmit}>
              {activeTab === 'aircraft' && (
                <>
                  <div className="form-group">
                    <label>Code *</label>
                    <input
                      type="text"
                      value={formData.code || ''}
                      onChange={e => setFormData({ ...formData, code: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>MTOW (tons) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.mtow_tons || ''}
                        onChange={e => setFormData({ ...formData, mtow_tons: parseFloat(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Speed (knots) *</label>
                      <input
                        type="number"
                        value={formData.speed_knots || ''}
                        onChange={e => setFormData({ ...formData, speed_knots: parseInt(e.target.value) })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Fuel Burn (L/hr) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.fuel_burn_liter_per_hour || ''}
                        onChange={e => setFormData({ ...formData, fuel_burn_liter_per_hour: parseFloat(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Payload (kg) *</label>
                      <input
                        type="number"
                        value={formData.max_payload_kg || ''}
                        onChange={e => setFormData({ ...formData, max_payload_kg: parseFloat(e.target.value) })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Range (km) *</label>
                      <input
                        type="number"
                        value={formData.range_km || ''}
                        onChange={e => setFormData({ ...formData, range_km: parseFloat(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Year</label>
                      <input
                        type="number"
                        value={formData.year_of_manufacture || ''}
                        onChange={e => setFormData({ ...formData, year_of_manufacture: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'airports' && (
                <>
                  <div className="form-group">
                    <label>Code *</label>
                    <input
                      type="text"
                      value={formData.code || ''}
                      onChange={e => setFormData({ ...formData, code: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>City</label>
                      <input
                        type="text"
                        value={formData.city || ''}
                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Country *</label>
                      <input
                        type="text"
                        value={formData.country || ''}
                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Region *</label>
                      <select
                        value={formData.region || ''}
                        onChange={e => setFormData({ ...formData, region: e.target.value })}
                        required
                      >
                        <option value="">Select</option>
                        <option value="DOM">Domestic</option>
                        <option value="INT">International</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={formData.latitude || ''}
                        onChange={e => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={formData.longitude || ''}
                        onChange={e => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Opening Hour</label>
                      <input
                        type="time"
                        value={formData.opening_hour || ''}
                        onChange={e => setFormData({ ...formData, opening_hour: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Closing Hour</label>
                    <input
                      type="time"
                      value={formData.closing_hour || ''}
                      onChange={e => setFormData({ ...formData, closing_hour: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="has_hll"
                      checked={formData.has_hll || false}
                      onChange={e => setFormData({ ...formData, has_hll: e.target.checked })}
                    />
                    <label htmlFor="has_hll">Has HLL (High Level Loader)</label>
                  </div>

                  <hr style={{ margin: '1.5rem 0', borderColor: 'rgba(255,255,255,0.1)' }} />
                  <h4>Airport Fees (USD)</h4>
                  {!isMasterView && <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>Enter values to override master fees for this scenario.</p>}
                  <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="form-group">
                      <label>Landing Fee</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.landing_fee_usd !== undefined ? formData.landing_fee_usd : ''}
                        onChange={e => setFormData({ ...formData, landing_fee_usd: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Parking Fee</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.parking_fee_usd !== undefined ? formData.parking_fee_usd : ''}
                        onChange={e => setFormData({ ...formData, parking_fee_usd: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Nav Fee</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.navigation_fee_usd !== undefined ? formData.navigation_fee_usd : ''}
                        onChange={e => setFormData({ ...formData, navigation_fee_usd: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </>
              )}


              {activeTab === 'pricing' && (
                <>
                  {!editing ? (
                    <>
                      <div className="form-group">
                        <label>Origin Airport *</label>
                        <select
                          value={formData.origin_id || ''}
                          onChange={e => setFormData({ ...formData, origin_id: e.target.value })}
                          required
                        >
                          <option value="">Select Origin</option>
                          {airports.map(ap => <option key={ap.id} value={ap.id}>{ap.code} - {ap.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Destination Airport *</label>
                        <select
                          value={formData.destination_id || ''}
                          onChange={e => setFormData({ ...formData, destination_id: e.target.value })}
                          required
                        >
                          <option value="">Select Destination</option>
                          {airports.map(ap => <option key={ap.id} value={ap.id}>{ap.code} - {ap.name}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="form-group">
                      <label>Route</label>
                      <input type="text" value={`${formData.origin_code} to ${formData.dest_code}`} disabled />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Segment</label>
                    <input
                      type="text"
                      placeholder="e.g. General, Express"
                      value={formData.segment || ''}
                      onChange={e => setFormData({ ...formData, segment: e.target.value })}
                      disabled={!!editing}
                    />
                  </div>
                  <div className="form-group">
                    <label>Fare (USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.fare_usd || ''}
                      onChange={e => setFormData({ ...formData, fare_usd: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                </>
              )}

              {activeTab === 'holidays' && (
                <>
                  <div className="form-group">
                    <label>Name *</label>
                    <input type="text" value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Date *</label>
                    <input type="date" value={formData.holiday_date ? formData.holiday_date.substring(0, 10) : ''}
                      onChange={e => setFormData({ ...formData, holiday_date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Country *</label>
                    <input type="text" value={formData.country || ''}
                      onChange={e => setFormData({ ...formData, country: e.target.value })} required />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Impact Start</label>
                      <input type="date" value={formData.impact_start_date ? formData.impact_start_date.substring(0, 10) : ''}
                        onChange={e => setFormData({ ...formData, impact_start_date: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Impact End</label>
                      <input type="date" value={formData.impact_end_date ? formData.impact_end_date.substring(0, 10) : ''}
                        onChange={e => setFormData({ ...formData, impact_end_date: e.target.value })} />
                    </div>
                  </div>
                  {!isMasterView && (
                    <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="is_operating"
                        checked={formData.is_operating !== false}
                        onChange={e => setFormData({ ...formData, is_operating: e.target.checked })}
                      />
                      <label htmlFor="is_operating">Is Operating / Available During Period?</label>
                    </div>
                  )}
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )
      }
    </div >
  );
}

export default Settings;
