import React, { useState, useEffect } from 'react';
import { maintenanceService } from '../services/api';
import toast from 'react-hot-toast';

function ScenarioMaintenancePanel({ scenarioId }) {
  const [upcomingMaintenance, setUpcomingMaintenance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Auto-load when panel mounts / scenarioId changes
  useEffect(() => {
    if (scenarioId) fetchUpcoming();
  }, [scenarioId]);

  const fetchUpcoming = async () => {
    if (!scenarioId) return;
    setLoading(true);
    try {
      // Fetch without days parameter to get ALL upcoming events
      const response = await maintenanceService.getUpcoming(scenarioId);
      setUpcomingMaintenance(response.data);
      setLoaded(true);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch maintenance events');
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status) => {
    if (status === 'Completed') return 'badge-status completed';
    if (status === 'In Progress') return 'badge-status in-progress';
    return 'badge-status pending';
  };

  const getDaysUntil = (dueDateStr) => {
    const due = new Date(dueDateStr);
    const now = new Date();
    // Normalize to midnight for accurate day counting
    const d1 = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getUrgencyClass = (daysUntil) => {
    if (daysUntil <= 7) return 'urgency-critical';
    if (daysUntil <= 21) return 'urgency-warning';
    return 'urgency-ok';
  };

  return (
    <div className="parameters-management card-modern">
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Planned Maintenance Timeline</h3>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Full schedule of all upcoming maintenance events for the fleet.
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={fetchUpcoming}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {loading ? 'Refreshing...' : '🔄 Sync Schedule'}
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="spinner-modern" style={{ marginBottom: '1rem' }}></div>
          ⚙️ Calculating maintenance requirements...
        </div>
      ) : !loaded ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Initial loading...
        </div>
      ) : upcomingMaintenance.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h4 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>No Maintenance Events found</h4>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
            There are no maintenance events currently scheduled for the aircraft in this fleet plan.
          </p>
        </div>
      ) : (
        <div className="table-responsive-modern">
          <table className="parameters-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Aircraft</th>
                <th>Maintenance Event</th>
                <th>Due Date</th>
                <th>Days Until</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Est. Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {upcomingMaintenance.map(event => {
                const daysUntil = getDaysUntil(event.due_date);
                return (
                  <tr key={event.id} className={getUrgencyClass(daysUntil)}>
                    <td>
                      <div className="tail-badge">
                        <span>✈️ {event.tail_number}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{event.event_name}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(event.due_date).toLocaleDateString(undefined, { 
                        year: 'numeric', month: 'short', day: 'numeric' 
                      })}
                    </td>
                    <td>
                      <span className={`days-badge ${daysUntil <= 7 ? 'danger' : daysUntil <= 21 ? 'warning' : 'success'}`}>
                        {daysUntil <= 0 ? 'DUE NOW' : `${daysUntil} days`}
                      </span>
                    </td>
                    <td>
                      <span className={getStatusClass(event.status)}>
                        {event.status || 'Pending'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ${Number(event.event_cost_usd || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ScenarioMaintenancePanel;
