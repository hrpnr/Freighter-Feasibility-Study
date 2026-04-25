import React, { useState, useEffect } from 'react';
import api, { maintenanceService } from '../services/api';
import toast from 'react-hot-toast';
import './Maintenance.css';

function Maintenance() {
  const [activeTab, setActiveTab] = useState('upcoming');

  // Dashboard / Upcoming State
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState('');
  const [upcomingMaintenance, setUpcomingMaintenance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Master Data State
  const [aircraftTypes, setAircraftTypes] = useState([]);
  const [selectedAcType, setSelectedAcType] = useState('');
  const [eventTypes, setEventTypes] = useState([]);
  const [newEvent, setNewEvent] = useState({
    event_name: '', interval_months: '', interval_block_hours: '',
    interval_flight_cycles: '', interval_apu_hours: '', event_cost_usd: '',
    downtime_days: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchScenarios();
    fetchAircraftTypes();
  }, []);

  const fetchScenarios = async () => {
    try {
      const response = await api.get(`/scenarios`);
      setScenarios(response.data);
      if (response.data.length > 0) {
        setScenarioId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching scenarios:', error);
    }
  };

  const fetchAircraftTypes = async () => {
    try {
      const response = await api.get(`/aircraft-types`);
      setAircraftTypes(response.data);
    } catch (error) {
      console.error('Error fetching aircraft types:', error);
    }
  };

  const fetchEventTypes = async (acTypeId) => {
    try {
      const response = await api.get(`/aircraft-types/${acTypeId}/maintenance-events`);
      setEventTypes(response.data);
    } catch (error) {
      console.error('Error fetching event types:', error);
    }
  };

  const handleAcTypeChange = (e) => {
    const val = e.target.value;
    setSelectedAcType(val);
    if (val) fetchEventTypes(val);
    else setEventTypes([]);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!selectedAcType) return toast.error('Select an aircraft type first');

    const payload = {
      aircraft_type_id: selectedAcType,
      event_name: newEvent.event_name,
      interval_months: newEvent.interval_months || null,
      interval_block_hours: newEvent.interval_block_hours || null,
      interval_flight_cycles: newEvent.interval_flight_cycles || null,
      interval_apu_hours: newEvent.interval_apu_hours || null,
      event_cost_usd: newEvent.event_cost_usd,
      downtime_days: newEvent.downtime_days || 0
    };

    try {
      if (isEditing) {
        await api.put(`/maintenance-events/${editingId}`, payload);
        toast.success('Event type updated');
      } else {
        await api.post(`/maintenance-events`, payload);
        toast.success('Event type added');
      }

      setNewEvent({
        event_name: '', interval_months: '', interval_block_hours: '',
        interval_flight_cycles: '', interval_apu_hours: '', event_cost_usd: '',
        downtime_days: ''
      });
      setIsEditing(false);
      setEditingId(null);
      setShowForm(false);
      fetchEventTypes(selectedAcType);
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error(error.niceMessage || 'Failed to save event');
    }
  };

  const handleEditClick = (ev) => {
    setNewEvent({
      event_name: ev.event_name,
      interval_months: ev.interval_months || '',
      interval_block_hours: ev.interval_block_hours || '',
      interval_flight_cycles: ev.interval_flight_cycles || '',
      interval_apu_hours: ev.interval_apu_hours || '',
      event_cost_usd: ev.event_cost_usd || '',
      downtime_days: ev.downtime_days || ''
    });
    setEditingId(ev.id);
    setIsEditing(true);
    setShowForm(true);
  };

  const cancelEdit = () => {
    setNewEvent({
      event_name: '', interval_months: '', interval_block_hours: '',
      interval_flight_cycles: '', interval_apu_hours: '', event_cost_usd: '',
      downtime_days: ''
    });
    setIsEditing(false);
    setEditingId(null);
    setShowForm(false);
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Delete this event type?')) return;
    try {
      await api.delete(`/maintenance-events/${id}`);
      toast.success('Event deleted');
      fetchEventTypes(selectedAcType);
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error(error.niceMessage || 'Failed to delete event');
    }
  };

  const fetchUpcomingMaintenance = async () => {
    if (!scenarioId) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await maintenanceService.getUpcoming(scenarioId, 60);
      setUpcomingMaintenance(response.data);
    } catch (error) {
      console.error('Error fetching maintenance:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maintenance-container">
      <div className="maintenance-header">
        <h1>Maintenance Management</h1>
      </div>

      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >📅 Upcoming Events</button>
        <button
          className={`tab-btn ${activeTab === 'master' ? 'active' : ''}`}
          onClick={() => setActiveTab('master')}
        >⚙️ Master Data (Event Dictionary)</button>
      </div>

      {activeTab === 'upcoming' && (
        <>
          <div className="controls-card">
            <div className="form-group">
              <label>Select Scenario</label>
              <select className="form-control" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                <option value="" disabled>Select a scenario...</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={fetchUpcomingMaintenance} disabled={loading || !scenarioId}>
              {loading ? 'Loading...' : 'Load Upcoming Maintenance'}
            </button>
          </div>

          <div className="data-card">
            <div className="card-header">
              <h2>Upcoming Maintenance (Next 60 Days)</h2>
            </div>
            {loading ? (
              <div className="loading-state"><span className="spinner">⚙️</span> Analyzing maintenance cycles...</div>
            ) : !hasSearched ? (
              <div className="empty-state"><p>Select a scenario and click "Load" to view upcoming maintenance.</p></div>
            ) : upcomingMaintenance.length === 0 ? (
              <div className="empty-state"><p>✅ All clear! No maintenance events required within the next 60 days.</p></div>
            ) : (
              <div className="table-responsive">
                <table className="styled-table">
                  <thead>
                    <tr>
                      <th>Aircraft</th>
                      <th>Event</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingMaintenance.map((event) => (
                      <tr key={event.id}>
                        <td><span className="badge badge-ac">✈️ {event.tail_number}</span></td>
                        <td><span className="badge badge-event">🔧 {event.event_name}</span></td>
                        <td>{new Date(event.due_date).toLocaleDateString()}</td>
                        <td><span className={`badge badge-status ${event.status === 'Completed' ? 'completed' : ''}`}>{event.status || 'Pending'}</span></td>
                        <td className="cost-cell" style={{ textAlign: 'right' }}>
                          ${(event.event_cost_usd || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'master' && (
        <>
          <div className="controls-card">
            <div className="form-group">
              <label>Select Aircraft Type</label>
              <select className="form-control" value={selectedAcType} onChange={handleAcTypeChange}>
                <option value="" disabled>Select an aircraft type...</option>
                {aircraftTypes.map(at => <option key={at.id} value={at.id}>{at.code} - {at.name}</option>)}
              </select>
            </div>
          </div>

          {selectedAcType && (
            <div className={`master-data-grid ${!showForm ? 'full-width' : ''}`}>
              <div className="data-card dictionary-card">
                <div className="card-header">
                  <h2>Registered Events</h2>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
                    {showForm ? '✕ Close Form' : '➕ Add New Event'}
                  </button>
                </div>
                {eventTypes.length === 0 ? (
                  <div className="empty-state"><p>No events registered for this aircraft type yet.</p></div>
                ) : (
                  <div className="table-responsive">
                    <table className="styled-table">
                      <thead>
                        <tr>
                          <th>Event Name</th>
                          <th>FH Interval</th>
                          <th>FC Interval</th>
                          <th>Month Interval</th>
                          <th>Downtime (Days)</th>
                          <th style={{ textAlign: 'right' }}>Cost ($)</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventTypes.map(ev => (
                          <tr key={ev.id}>
                            <td><strong>{ev.event_name}</strong></td>
                            <td>{ev.interval_block_hours || '-'}</td>
                            <td>{ev.interval_flight_cycles || '-'}</td>
                            <td>{ev.interval_months || '-'}</td>
                            <td>
                              <span className={`badge ${ev.downtime_days > 0 ? 'badge-downtime' : ''}`}>
                                {ev.downtime_days > 0 ? `${ev.downtime_days}d` : '-'}
                              </span>
                            </td>
                            <td className="cost-cell" style={{ textAlign: 'right' }}>${Number(ev.event_cost_usd).toLocaleString()}</td>
                            <td className="action-cell">
                              <button className="icon-btn info" onClick={() => handleEditClick(ev)} title="Edit Event">✏️</button>
                              <button className="icon-btn danger" onClick={() => handleDeleteEvent(ev.id)} title="Delete Event">🗑️</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {showForm && (
                <div className="data-card form-card">
                  <div className="card-header">
                    <h2>{isEditing ? 'Edit Event' : 'Add New Event'}</h2>
                    {isEditing && <button className="icon-btn" onClick={cancelEdit}>✕</button>}
                  </div>
                  <form className="event-form" onSubmit={handleCreateEvent}>
                    <div className="form-group">
                      <label>Event Name *</label>
                      <input type="text" className="form-control" required value={newEvent.event_name} onChange={e => setNewEvent({ ...newEvent, event_name: e.target.value })} placeholder="e.g. C-Check" />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Block Hours Interval</label>
                        <input type="number" className="form-control" value={newEvent.interval_block_hours} onChange={e => setNewEvent({ ...newEvent, interval_block_hours: e.target.value })} placeholder="e.g. 7500" />
                      </div>
                      <div className="form-group">
                        <label>Flight Cycles Interval</label>
                        <input type="number" className="form-control" value={newEvent.interval_flight_cycles} onChange={e => setNewEvent({ ...newEvent, interval_flight_cycles: e.target.value })} placeholder="e.g. 5000" />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Months Interval</label>
                        <input type="number" className="form-control" value={newEvent.interval_months} onChange={e => setNewEvent({ ...newEvent, interval_months: e.target.value })} placeholder="e.g. 24" />
                      </div>
                      <div className="form-group">
                        <label>APU Hours</label>
                        <input type="number" className="form-control" value={newEvent.interval_apu_hours} onChange={e => setNewEvent({ ...newEvent, interval_apu_hours: e.target.value })} placeholder="e.g. 3000" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Event Cost (USD) *</label>
                      <input type="number" step="0.01" className="form-control cost-input" required value={newEvent.event_cost_usd} onChange={e => setNewEvent({ ...newEvent, event_cost_usd: e.target.value })} placeholder="150000" />
                    </div>
                    <div className="form-group">
                      <label>Downtime (Days)</label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={newEvent.downtime_days}
                        onChange={e => setNewEvent({ ...newEvent, downtime_days: e.target.value })}
                        placeholder="e.g. 7 (leave 0 if no grounding)"
                      />
                      <small style={{ color: 'var(--text-muted, #888)', fontSize: '0.75rem' }}>
                        Days the aircraft cannot operate during this event.
                      </small>
                    </div>
                    <div className="form-actions">
                      {isEditing && <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>}
                      <button type="submit" className="btn btn-primary submit-btn">
                        {isEditing ? '💾 Update Event' : '➕ Register Event'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Maintenance;
