import React, { useState, useEffect } from 'react';
import { fleetService, aircraftTypeService, maintenanceService } from '../services/api';
import toast from 'react-hot-toast';
import './FleetManagement.css';

function FleetManagement({ scenarioId }) {
  const [fleet, setFleet] = useState([]);
  const [aircraftTypes, setAircraftTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    aircraft_number: '',
    tail_number: '',
    aircraft_type_id: '',
    eis_date: '',
    redelivery_date: '',
    lease_cost_monthly_usd: ''
  });
  const [mtxBaselines, setMtxBaselines] = useState([]); // Array of dict events with user-input 'since last' fields
  const [availableEventTypes, setAvailableEventTypes] = useState([]);

  useEffect(() => {
    fetchAircraftTypes();
    if (scenarioId) {
      fetchFleet();
    }
  }, [scenarioId]);

  const fetchAircraftTypes = async () => {
    try {
      const response = await aircraftTypeService.getAll();
      setAircraftTypes(response.data);
    } catch (error) {
      toast.error('Failed to load aircraft types');
    }
  };

  const fetchBaselinesForType = async (typeId) => {
    try {
      const response = await maintenanceService.getEventTypes(typeId);
      setAvailableEventTypes(response.data);
      
      // Initialize baselines if not editing
      if (!editing) {
        const initial = response.data.map(et => ({
          event_type_id: et.id,
          event_name: et.event_name,
          interval_months: et.interval_months,
          interval_block_hours: et.interval_block_hours,
          interval_flight_cycles: et.interval_flight_cycles,
          interval_apu_hours: et.interval_apu_hours,
          last_done_date: '',
          last_done_hours: 0,
          last_done_cycles: 0,
          last_done_apu_hours: 0
        }));
        setMtxBaselines(initial);
      }
    } catch (error) {
      console.error('Error fetching event types:', error);
    }
  };

  const fetchFleet = async () => {
    try {
      const response = await fleetService.getAll(scenarioId);
      setFleet(response.data);
    } catch (error) {
      toast.error('Failed to load fleet');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Check if maintenance events exist for this aircraft type first
      if (!editing && formData.aircraft_type_id) {
        const eventsCheck = await maintenanceService.getEventTypes(formData.aircraft_type_id);
        if (eventsCheck.data.length === 0) {
          alert('⚠️ Cannot add aircraft. No Maintenance Events registered for this Aircraft Type.\n\nPlease go to Maintenance -> Master Data to register at least one maintenance event interval for this aircraft type first.');
          return;
        }
      }
      let fleetPlanId = editing?.id;

      if (editing) {
        await fleetService.update(editing.id, formData);
        toast.success('Aircraft updated');
      } else {
        const response = await fleetService.create(scenarioId, formData);
        fleetPlanId = response.data.id;
        toast.success('Aircraft added');
      }

      // Save Baselines
      if (fleetPlanId && mtxBaselines.length > 0) {
        await fleetService.setInitialMaintenance(fleetPlanId, { baselines: mtxBaselines });
      }

      setShowModal(false);
      setEditing(null);
      resetForm();
      fetchFleet();
    } catch (error) {
      toast.error(error.niceMessage || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this aircraft from fleet?')) return;

    try {
      await fleetService.delete(id);
      toast.success('Aircraft removed');
      fetchFleet();
    } catch (error) {
      toast.error('Failed to remove aircraft');
    }
  };

  const resetForm = () => {
    setFormData({
      aircraft_number: '',
      tail_number: '',
      aircraft_type_id: '',
      eis_date: '',
      redelivery_date: '',
      lease_cost_monthly_usd: ''
    });
    setMtxBaselines([]);
    setAvailableEventTypes([]);
  };

  const openModal = async (aircraft = null) => {
    if (aircraft) {
      setEditing(aircraft);
      setFormData({
        aircraft_number: aircraft.aircraft_number,
        tail_number: aircraft.tail_number,
        aircraft_type_id: aircraft.aircraft_type_id,
        eis_date: aircraft.eis_date ? new Date(aircraft.eis_date).toISOString().split('T')[0] : '',
        redelivery_date: aircraft.redelivery_date ? new Date(aircraft.redelivery_date).toISOString().split('T')[0] : '',
        lease_cost_monthly_usd: aircraft.lease_cost_monthly_usd
      });

      // Fetch baselines
      await fetchBaselinesForType(aircraft.aircraft_type_id);
      try {
        const res = await fleetService.getInitialMaintenance(aircraft.id);
        if (res.data.length > 0) {
          // Merge dictionary names with saved values
          setMtxBaselines(prev => prev.map(p => {
             const saved = res.data.find(s => s.event_type_id === p.event_type_id);
             return saved ? { 
               ...p, 
               last_done_date: saved.last_done_date ? new Date(saved.last_done_date).toISOString().split('T')[0] : '',
               last_done_hours: saved.last_done_hours,
               last_done_cycles: saved.last_done_cycles,
               last_done_apu_hours: saved.last_done_apu_hours,
               // Ensure interval metadata is present
               interval_months: p.interval_months,
               interval_block_hours: p.interval_block_hours,
               interval_flight_cycles: p.interval_flight_cycles,
               interval_apu_hours: p.interval_apu_hours
             } : p;
          }));
        }
      } catch (err) { console.error(err); }
    } else {
      setEditing(null);
      resetForm();
    }
    setShowModal(true);
  };

  const handleBaselineChange = (index, field, value) => {
    const updated = [...mtxBaselines];
    updated[index] = { ...updated[index], [field]: value };
    setMtxBaselines(updated);
  };

  return (
    <div className="fleet-management">
      <div className="fleet-header">
        <h2>Fleet Management</h2>
        <button className="btn-primary" onClick={() => openModal()} disabled={!scenarioId}>
          + Add Aircraft
        </button>
      </div>

      {!scenarioId && (
        <div className="warning-box">
          <p>⚠️ Please select a scenario first to manage fleet</p>
        </div>
      )}

      {fleet.length > 0 ? (
        <div className="fleet-grid">
          {fleet.map(aircraft => (
            <div key={aircraft.id} className="aircraft-card">
              <div className="aircraft-header">
                <h3>Aircraft #{aircraft.aircraft_number}</h3>
                <span className="aircraft-type">{aircraft.aircraft_type_code}</span>
              </div>

              <div className="aircraft-details">
                <div className="detail-row">
                  <strong>Tail Number:</strong>
                  <span>{aircraft.tail_number}</span>
                </div>
                <div className="detail-row">
                  <strong>Type:</strong>
                  <span>{aircraft.aircraft_type_name}</span>
                </div>
                <div className="detail-row">
                  <strong>EIS Date:</strong>
                  <span>{new Date(aircraft.eis_date).toLocaleDateString()}</span>
                </div>
                <div className="detail-row">
                  <strong>Redelivery Date:</strong>
                  <span>{new Date(aircraft.redelivery_date).toLocaleDateString()}</span>
                </div>
                <div className="detail-row">
                  <strong>Monthly Lease:</strong>
                  <span>${aircraft.lease_cost_monthly_usd?.toLocaleString()}</span>
                </div>
              </div>

              <div className="aircraft-actions">
                <button className="btn-small" onClick={() => openModal(aircraft)}>Edit</button>
                <button className="btn-small btn-danger" onClick={() => handleDelete(aircraft.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        scenarioId && (
          <div className="empty-state">
            <p>No aircraft in fleet. Add your first aircraft to get started.</p>
          </div>
        )
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editing ? 'Edit Aircraft' : 'Add Aircraft'}</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Aircraft Number *</label>
                  <input
                    type="number"
                    value={formData.aircraft_number}
                    onChange={e => setFormData({ ...formData, aircraft_number: parseInt(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Tail Number *</label>
                  <input
                    type="text"
                    value={formData.tail_number}
                    onChange={e => setFormData({ ...formData, tail_number: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Aircraft Type *</label>
                <select
                  value={formData.aircraft_type_id}
                  onChange={e => {
                    setFormData({ ...formData, aircraft_type_id: e.target.value });
                    if (e.target.value) fetchBaselinesForType(e.target.value);
                  }}
                  required
                >
                  <option value="">Select Aircraft Type</option>
                  {aircraftTypes.map(at => (
                    <option key={at.id} value={at.id}>
                      {at.code} - {at.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>EIS Date *</label>
                  <input
                    type="date"
                    value={formData.eis_date}
                    onChange={e => setFormData({ ...formData, eis_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Redelivery Date *</label>
                  <input
                    type="date"
                    value={formData.redelivery_date}
                    onChange={e => setFormData({ ...formData, redelivery_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Monthly Lease Cost (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.lease_cost_monthly_usd}
                  onChange={e => setFormData({ ...formData, lease_cost_monthly_usd: parseFloat(e.target.value) })}
                  required
                />
              </div>

              {mtxBaselines.length > 0 && (
                <div className="baselines-section">
                  <div className="form-divider">Maintenance Baselines (Since Last Done)</div>
                  <p className="section-hint">Enter how much life (FH/FC/APU) has been <strong>spent</strong> for each event type at the point of EIS.</p>
                  
                  {mtxBaselines.map((bl, idx) => (
                    <div key={bl.event_type_id} className="baseline-row">
                      <div className="baseline-name">{bl.event_name}</div>
                      <div className="baseline-inputs">
                        {(bl.interval_months > 0) && (
                          <div className="mini-group">
                            <label>Last Accomplished Date</label>
                            <input 
                              type="date" 
                              title="Date when this event was last performed"
                              value={bl.last_done_date} 
                              onChange={e => handleBaselineChange(idx, 'last_done_date', e.target.value)}
                            />
                          </div>
                        )}
                        {(bl.interval_block_hours > 0) && (
                          <div className="mini-group">
                            <label>FH Since Last</label>
                            <input 
                              type="number" 
                              step="0.1"
                              title="Block hours flown since this event was last done"
                              value={bl.last_done_hours} 
                              onChange={e => handleBaselineChange(idx, 'last_done_hours', parseFloat(e.target.value))}
                            />
                          </div>
                        )}
                        {(bl.interval_flight_cycles > 0) && (
                          <div className="mini-group">
                            <label>FC Since Last</label>
                            <input 
                              type="number" 
                              title="Flight cycles since this event was last done"
                              value={bl.last_done_cycles} 
                              onChange={e => handleBaselineChange(idx, 'last_done_cycles', parseInt(e.target.value))}
                            />
                          </div>
                        )}
                        {(bl.interval_apu_hours > 0) && (
                          <div className="mini-group">
                            <label>APU Since Last</label>
                            <input 
                              type="number" 
                              step="0.1"
                              title="APU hours used since this event was last done"
                              value={bl.last_done_apu_hours} 
                              onChange={e => handleBaselineChange(idx, 'last_done_apu_hours', parseFloat(e.target.value))}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default FleetManagement;
