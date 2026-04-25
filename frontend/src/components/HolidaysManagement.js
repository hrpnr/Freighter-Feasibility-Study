import React, { useState, useEffect } from 'react';
import { holidayService } from '../services/api';
import toast from 'react-hot-toast';

function HolidaysManagement({ scenarioId }) {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (scenarioId) fetchHolidays();
  }, [scenarioId]);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const response = await holidayService.getByScenario(scenarioId);
      setHolidays(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch holidays');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOperating = async (h) => {
    try {
      const newVal = !h.is_operating;
      if (h.is_override) {
        // Update existing override
        await holidayService.update(h.id, { ...h, is_operating: newVal });
      } else {
        // Create new override
        await holidayService.create(scenarioId, {
          name: h.name,
          holiday_date: h.holiday_date,
          country: h.country,
          impact_start_date: h.impact_start_date,
          impact_end_date: h.impact_end_date,
          is_operating: newVal
        });
      }
      toast.success(`Holiday status updated to ${newVal ? 'Operating' : 'Non-Operating'}`);
      fetchHolidays();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to update holiday status');
    }
  };

  const handleReset = async (h) => {
    if (!h.is_override) return;
    if (!window.confirm('Revert to master holiday settings?')) return;

    try {
      await holidayService.delete(h.id);
      toast.success('Holiday reset to master');
      fetchHolidays();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to reset holiday');
    }
  };

  if (loading) return <div>Loading holidays...</div>;

  return (
    <div className="holidays-management">
      <div className="pricing-header">
        <h3>Holidays Management</h3>
        <p className="hint">Master holidays are shown by default. Toggle "Operating?" to override for this scenario.</p>
      </div>

      <table className="pricing-table">
        <thead>
          <tr>
            <th>Holiday Name</th>
            <th>Date</th>
            <th>Country</th>
            <th>Type</th>
            <th>Operating?</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {holidays.map(h => (
            <tr key={h.id || `${h.name}-${h.holiday_date}`} className={h.is_override ? 'override' : ''}>
              <td>{h.name}</td>
              <td>{new Date(h.holiday_date).toLocaleDateString()}</td>
              <td>{h.country}</td>
              <td>
                <span className={h.is_override ? 'badge override' : 'badge global'}>
                  {h.is_override ? 'Scenario Override' : 'Global Master'}
                </span>
              </td>
              <td>
                <span className={h.is_operating ? 'status-pill success' : 'status-pill danger'}>
                  {h.is_operating ? '✅ Yes' : '❌ No'}
                </span>
              </td>
              <td>
                <button className="btn-small" onClick={() => handleToggleOperating(h)}>
                  Toggle Op
                </button>
                {h.is_override && (
                  <button className="btn-small btn-danger" onClick={() => handleReset(h)}>Reset</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HolidaysManagement;
