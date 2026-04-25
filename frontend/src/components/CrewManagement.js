import React, { useState, useEffect } from 'react';
import { crewService } from '../services/api';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  employee_id: '',
  name: '',
  role: 'pilot',
  monthly_salary_usd: '',
  max_duty_hours_per_day: 10,
  min_rest_hours: 12,
  max_duty_hours_per_month: 100,
};

function CrewManagement({ scenarioId }) {
  const [crew, setCrew] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    if (scenarioId) fetchCrew();
  }, [scenarioId]);

  const fetchCrew = async () => {
    setLoading(true);
    try {
      const response = await crewService.getByScenario(scenarioId);
      setCrew(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch crew');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...formData, scenario_id: scenarioId };
    try {
      if (editing) {
        await crewService.update(editing.id, payload);
        toast.success('Crew member updated');
      } else {
        await crewService.create(payload);
        toast.success('Crew member added');
      }
      setShowModal(false);
      setEditing(null);
      setFormData(EMPTY_FORM);
      fetchCrew();
    } catch (error) {
      toast.error(error.niceMessage || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this crew member?')) return;
    try {
      await crewService.delete(id);
      toast.success('Crew member deleted');
      fetchCrew();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to delete crew member');
    }
  };

  const openModal = (member = null) => {
    setEditing(member);
    setFormData(member ? { ...member } : EMPTY_FORM);
    setShowModal(true);
  };

  const pilots = crew.filter(c => c.role === 'pilot');
  const fos = crew.filter(c => c.role === 'first_officer');

  const totalMonthlyCost = crew.reduce((sum, c) => sum + parseFloat(c.monthly_salary_usd || 0), 0);

  return (
    <div className="parameters-management">
      <div className="parameters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>Crew Roster</h3>
          <p className="hint">Crew members are specific to this scenario. Changes here do not affect other scenarios.</p>
        </div>
        <button className="btn-primary" onClick={() => openModal()}>+ Add Crew Member</button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Crew', value: crew.length },
          { label: 'Pilots', value: pilots.length },
          { label: 'First Officers', value: fos.length },
          { label: 'Monthly Salary Cost', value: `$${totalMonthlyCost.toLocaleString(undefined, { minimumFractionDigits: 0 })}` },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--surface-light)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1.25rem',
            minWidth: '140px',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{stat.label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading crew...</div>
      ) : crew.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No crew members assigned to this scenario yet.
        </div>
      ) : (
        <table className="parameters-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Role</th>
              <th>Monthly Salary (USD)</th>
              <th>Max Duty/Day (h)</th>
              <th>Min Rest (h)</th>
              <th>Max Duty/Month (h)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {crew.map(member => (
              <tr key={member.id}>
                <td><code>{member.employee_id}</code></td>
                <td><strong>{member.name}</strong></td>
                <td>
                  <span className={`badge ${member.role === 'pilot' ? 'override' : 'global'}`}>
                    {member.role === 'pilot' ? 'Pilot' : 'First Officer'}
                  </span>
                </td>
                <td>${parseFloat(member.monthly_salary_usd || 0).toLocaleString()}</td>
                <td>{member.max_duty_hours_per_day}h</td>
                <td>{member.min_rest_hours}h</td>
                <td>{member.max_duty_hours_per_month}h</td>
                <td>
                  <button className="btn-small" onClick={() => openModal(member)}>Edit</button>
                  <button className="btn-small btn-danger" onClick={() => handleDelete(member.id)}>Delete</button>
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
            <h2>{editing ? 'Edit Crew Member' : 'Add Crew Member'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Employee ID *</label>
                <input
                  type="text"
                  value={formData.employee_id}
                  onChange={e => setFormData({ ...formData, employee_id: e.target.value })}
                  required
                  placeholder="e.g. EMP-001"
                />
              </div>
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g. Budi Santoso"
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="pilot">Pilot</option>
                  <option value="first_officer">First Officer</option>
                </select>
              </div>
              <div className="form-group">
                <label>Monthly Salary (USD) *</label>
                <input
                  type="number"
                  value={formData.monthly_salary_usd}
                  onChange={e => setFormData({ ...formData, monthly_salary_usd: parseFloat(e.target.value) || 0 })}
                  required
                  min="0"
                  step="100"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Max Duty / Day (h)</label>
                  <input
                    type="number"
                    value={formData.max_duty_hours_per_day}
                    onChange={e => setFormData({ ...formData, max_duty_hours_per_day: parseFloat(e.target.value) })}
                    min="1" max="24"
                  />
                </div>
                <div className="form-group">
                  <label>Min Rest (h)</label>
                  <input
                    type="number"
                    value={formData.min_rest_hours}
                    onChange={e => setFormData({ ...formData, min_rest_hours: parseFloat(e.target.value) })}
                    min="8" max="24"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Max Duty / Month (h)</label>
                <input
                  type="number"
                  value={formData.max_duty_hours_per_month}
                  onChange={e => setFormData({ ...formData, max_duty_hours_per_month: parseFloat(e.target.value) })}
                  min="1"
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Add'} Crew Member</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CrewManagement;
