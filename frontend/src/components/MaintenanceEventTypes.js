import React, { useState, useEffect } from 'react';
import { aircraftTypeService, maintenanceService } from '../services/api';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  event_name: '',
  interval_months: '',
  interval_block_hours: '',
  interval_flight_cycles: '',
  interval_apu_hours: '',
  event_cost_usd: '',
  downtime_days: 0,
};

function MaintenanceEventTypes() {
  const [aircraftTypes, setAircraftTypes] = useState([]);
  const [selectedAcType, setSelectedAcType] = useState('');
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchAircraftTypes();
  }, []);

  const fetchAircraftTypes = async () => {
    try {
      const response = await aircraftTypeService.getAll();
      setAircraftTypes(response.data);
    } catch (error) {
      toast.error('Failed to fetch aircraft types');
    }
  };

  const fetchEventTypes = async (acTypeId) => {
    setLoading(true);
    try {
      const response = await maintenanceService.getEventTypes(acTypeId);
      setEventTypes(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch event types');
    } finally {
      setLoading(false);
    }
  };

  const handleAcTypeChange = (e) => {
    const val = e.target.value;
    setSelectedAcType(val);
    if (val) fetchEventTypes(val);
    else setEventTypes([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      aircraft_type_id: selectedAcType,
      event_name: formData.event_name,
      interval_months: formData.interval_months || null,
      interval_block_hours: formData.interval_block_hours || null,
      interval_flight_cycles: formData.interval_flight_cycles || null,
      interval_apu_hours: formData.interval_apu_hours || null,
      event_cost_usd: formData.event_cost_usd,
      downtime_days: formData.downtime_days || 0,
    };

    try {
      if (editing) {
        await maintenanceService.updateEventType(editing.id, payload);
        toast.success('Event type updated');
      } else {
        await maintenanceService.createEventType(payload);
        toast.success('Event type added');
      }
      setShowModal(false);
      setEditing(null);
      setFormData(EMPTY_FORM);
      fetchEventTypes(selectedAcType);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to save event type');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this maintenance event type?')) return;
    try {
      await maintenanceService.deleteEventType(id);
      toast.success('Event type deleted');
      fetchEventTypes(selectedAcType);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to delete event type');
    }
  };
  const handleNukeAll = async () => {
    if (!window.confirm('⚠️ CRITICAL: This will permanently delete EVERY maintenance event dictionary across ALL aircraft types. This cannot be undone. \n\nAre you sure you want to nuke everything?')) return;
    
    try {
      await maintenanceService.deleteAllEventTypes();
      toast.success('All maintenance event dictionaries cleared');
      if (selectedAcType) fetchEventTypes(selectedAcType);
      else setEventTypes([]);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to clear event dictionaries');
    }
  };

  const openModal = (ev = null) => {
    setEditing(ev);
    setFormData(ev ? {
      event_name: ev.event_name,
      interval_months: ev.interval_months || '',
      interval_block_hours: ev.interval_block_hours || '',
      interval_flight_cycles: ev.interval_flight_cycles || '',
      interval_apu_hours: ev.interval_apu_hours || '',
      event_cost_usd: ev.event_cost_usd || '',
      downtime_days: ev.downtime_days || 0,
    } : EMPTY_FORM);
    setShowModal(true);
  };

  return (
    <div className="parameters-management">
      <div className="parameters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>Maintenance Event Dictionary</h3>
          <p className="hint">
            These are master regulatory/manufacturer intervals. They apply globally to all scenarios using the same aircraft type.
          </p>
        </div>
        <button 
          className="btn-danger btn-small" 
          style={{ opacity: 0.7 }}
          onClick={handleNukeAll}
        >
          🗑️ Clear All Dictionaries
        </button>
      </div>

      {/* Aircraft Type Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ margin: 0, minWidth: '280px' }}>
          <label>Aircraft Type</label>
          <select value={selectedAcType} onChange={handleAcTypeChange} className="scenario-select">
            <option value="">— Select Aircraft Type —</option>
            {aircraftTypes.map(at => (
              <option key={at.id} value={at.id}>{at.code} — {at.name}</option>
            ))}
          </select>
        </div>
        {selectedAcType && (
          <button
            className="btn-primary"
            style={{ marginTop: '1.5rem' }}
            onClick={() => openModal()}
          >
            + Add Event
          </button>
        )}
      </div>

      {!selectedAcType ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Select an aircraft type to view and manage its maintenance event dictionary.
        </div>
      ) : loading ? (
        <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading events...</div>
      ) : eventTypes.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No maintenance events registered for this aircraft type yet.
        </div>
      ) : (
        <table className="parameters-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Event Name</th>
              <th>FH Interval</th>
              <th>FC Interval</th>
              <th>Month Interval</th>
              <th>APU Hours</th>
              <th>Downtime (Days)</th>
              <th style={{ textAlign: 'right' }}>Cost (USD)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {eventTypes.map(ev => (
              <tr key={ev.id}>
                <td><strong>{ev.event_name}</strong></td>
                <td>{ev.interval_block_hours || '—'}</td>
                <td>{ev.interval_flight_cycles || '—'}</td>
                <td>{ev.interval_months || '—'}</td>
                <td>{ev.interval_apu_hours || '—'}</td>
                <td>
                  {ev.downtime_days > 0
                    ? <span className="badge override">{ev.downtime_days}d</span>
                    : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>${Number(ev.event_cost_usd).toLocaleString()}</td>
                <td>
                  <button className="btn-small" onClick={() => openModal(ev)}>Edit</button>
                  <button className="btn-small btn-danger" onClick={() => handleDelete(ev.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>{editing ? 'Edit Event Type' : 'Add Maintenance Event'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Event Name *</label>
                <input
                  type="text"
                  value={formData.event_name}
                  onChange={e => setFormData({ ...formData, event_name: e.target.value })}
                  required
                  placeholder="e.g. C-Check"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Block Hours Interval</label>
                  <input
                    type="number"
                    value={formData.interval_block_hours}
                    onChange={e => setFormData({ ...formData, interval_block_hours: e.target.value })}
                    placeholder="e.g. 7500"
                  />
                </div>
                <div className="form-group">
                  <label>Flight Cycles Interval</label>
                  <input
                    type="number"
                    value={formData.interval_flight_cycles}
                    onChange={e => setFormData({ ...formData, interval_flight_cycles: e.target.value })}
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Month Interval</label>
                  <input
                    type="number"
                    value={formData.interval_months}
                    onChange={e => setFormData({ ...formData, interval_months: e.target.value })}
                    placeholder="e.g. 24"
                  />
                </div>
                <div className="form-group">
                  <label>APU Hours Interval</label>
                  <input
                    type="number"
                    value={formData.interval_apu_hours}
                    onChange={e => setFormData({ ...formData, interval_apu_hours: e.target.value })}
                    placeholder="e.g. 3000"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Event Cost (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.event_cost_usd}
                    onChange={e => setFormData({ ...formData, event_cost_usd: e.target.value })}
                    required
                    placeholder="150000"
                  />
                </div>
                <div className="form-group">
                  <label>Downtime (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.downtime_days}
                    onChange={e => setFormData({ ...formData, downtime_days: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  {editing ? 'Update Event' : 'Register Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaintenanceEventTypes;
