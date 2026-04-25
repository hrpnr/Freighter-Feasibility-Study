import React, { useState, useEffect, useMemo } from 'react';
import { airportFeesService } from '../services/api';
import toast from 'react-hot-toast';

function AirportFeesManagement({ scenarioId }) {
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('code');
  const [sortOrder, setSortOrder] = useState('asc');

  const filteredAndSortedAirports = useMemo(() => {
    let result = [...airports];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(ap => 
        ap.airport_code?.toLowerCase().includes(lower) ||
        ap.airport_name?.toLowerCase().includes(lower) ||
        (ap.is_override ? 'override' : 'default').includes(lower)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'code':
          comparison = (a.airport_code || '').localeCompare(b.airport_code || '');
          break;
        case 'airport':
          comparison = (a.airport_name || '').localeCompare(b.airport_name || '');
          break;
        case 'status':
          comparison = (a.is_override === b.is_override) ? 0 : (a.is_override ? -1 : 1);
          break;
        case 'landing':
          comparison = (a.landing_fee_usd || 0) - (b.landing_fee_usd || 0);
          break;
        case 'parking':
          comparison = (a.parking_fee_usd || 0) - (b.parking_fee_usd || 0);
          break;
        case 'navigation':
          comparison = (a.navigation_fee_usd || 0) - (b.navigation_fee_usd || 0);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [airports, searchTerm, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return ' ↕';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  useEffect(() => {
    if (scenarioId) fetchFees();
  }, [scenarioId]);

  const fetchFees = async () => {
    setLoading(true);
    try {
      const response = await airportFeesService.getByScenario(scenarioId);
      setAirports(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch airport fees');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (airport) => {
    setEditingId(airport.airport_id);
    setEditValues({
      landing_fee_usd: airport.landing_fee_usd,
      parking_fee_usd: airport.parking_fee_usd,
      navigation_fee_usd: airport.navigation_fee_usd,
    });
  };

  const handleSave = async (airportId) => {
    try {
      await airportFeesService.upsertOverride(scenarioId, {
        airport_id: airportId,
        landing_fee_usd: parseFloat(editValues.landing_fee_usd) || 0,
        parking_fee_usd: parseFloat(editValues.parking_fee_usd) || 0,
        navigation_fee_usd: parseFloat(editValues.navigation_fee_usd) || 0,
      });
      toast.success('Fee override saved');
      setEditingId(null);
      fetchFees();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to save fee override');
    }
  };

  const handleReset = async (overrideId) => {
    if (!window.confirm('Remove this scenario override and revert to master airport fee?')) return;
    try {
      await airportFeesService.deleteOverride(overrideId);
      toast.success('Reverted to master fee');
      fetchFees();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to remove override');
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading airport fees...</div>;

  return (
    <div className="parameters-management" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="parameters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 700 }}>Scenario Airport Fee Overrides</h3>
          <p className="hint" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Master airport fees are used by default. Set overrides here to test different fee structures for this scenario.
          </p>
        </div>
        <div className="pricing-toolbar" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search airport or status..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                background: 'var(--surface-light)', border: '1px solid var(--border-color)', 
                color: 'var(--text-primary)', padding: '0.5rem 1rem 0.5rem 2.2rem', 
                borderRadius: 'var(--radius-md)', outline: 'none', width: '250px'
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        <table className="parameters-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-light)', boxShadow: '0 1px 0 var(--border-color)' }}>
            <tr>
              <th onClick={() => handleSort('code')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code{getSortIcon('code')}</th>
              <th onClick={() => handleSort('airport')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Airport{getSortIcon('airport')}</th>
              <th onClick={() => handleSort('status')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status{getSortIcon('status')}</th>
              <th onClick={() => handleSort('landing')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Landing (USD){getSortIcon('landing')}</th>
              <th onClick={() => handleSort('parking')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parking (USD){getSortIcon('parking')}</th>
              <th onClick={() => handleSort('navigation')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Navigation (USD){getSortIcon('navigation')}</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
          {filteredAndSortedAirports.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No airport records found.</td>
            </tr>
          ) : filteredAndSortedAirports.map(ap => {
            const isEditing = editingId === ap.airport_id;
            const isOverride = ap.is_override;

            return (
              <tr key={ap.airport_id} className={isOverride ? 'override' : ''}>
                <td><strong>{ap.airport_code}</strong></td>
                <td>{ap.airport_name}</td>
                <td>
                  <span className={isOverride ? 'badge override' : 'badge global'}>
                    {isOverride ? 'Scenario Override' : 'Global Default'}
                  </span>
                </td>

                {isEditing ? (
                  <>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.landing_fee_usd}
                        onChange={e => setEditValues({ ...editValues, landing_fee_usd: e.target.value })}
                        className="edit-input"
                        style={{ width: '90px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.parking_fee_usd}
                        onChange={e => setEditValues({ ...editValues, parking_fee_usd: e.target.value })}
                        className="edit-input"
                        style={{ width: '90px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.navigation_fee_usd}
                        onChange={e => setEditValues({ ...editValues, navigation_fee_usd: e.target.value })}
                        className="edit-input"
                        style={{ width: '90px' }}
                      />
                    </td>
                    <td>
                      <button className="btn-small btn-primary" onClick={() => handleSave(ap.airport_id)}>Save</button>
                      <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>${parseFloat(ap.landing_fee_usd || 0).toFixed(2)}</td>
                    <td>${parseFloat(ap.parking_fee_usd || 0).toFixed(2)}</td>
                    <td>${parseFloat(ap.navigation_fee_usd || 0).toFixed(2)}</td>
                    <td>
                      <button className="btn-small" onClick={() => handleEdit(ap)}>
                        {isOverride ? 'Edit Override' : 'Set Override'}
                      </button>
                      {isOverride && (
                        <button className="btn-small btn-danger" onClick={() => handleReset(ap.override_id)}>
                          Reset
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default AirportFeesManagement;
