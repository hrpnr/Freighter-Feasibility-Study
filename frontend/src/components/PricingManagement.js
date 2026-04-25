import React, { useState, useEffect, useMemo } from 'react';
import { pricingService } from '../services/api';
import toast from 'react-hot-toast';

function PricingManagement({ scenarioId }) {
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editFare, setEditFare] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('route');
  const [sortOrder, setSortOrder] = useState('asc');

  const filteredAndSortedPricing = useMemo(() => {
    let result = [...pricing];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.origin_code?.toLowerCase().includes(lower) ||
        p.dest_code?.toLowerCase().includes(lower) ||
        p.segment?.toLowerCase().includes(lower) ||
        (p.is_override ? 'override' : 'master').includes(lower)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'route':
          const routeA = `${a.origin_code}-${a.dest_code}-${a.segment}`;
          const routeB = `${b.origin_code}-${b.dest_code}-${b.segment}`;
          comparison = routeA.localeCompare(routeB);
          break;
        case 'type':
          comparison = (a.is_override === b.is_override) ? 0 : (a.is_override ? -1 : 1);
          break;
        case 'fare':
          comparison = (a.fare_usd || 0) - (b.fare_usd || 0);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [pricing, searchTerm, sortBy, sortOrder]);

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
    if (scenarioId) fetchPricing();
  }, [scenarioId]);

  const fetchPricing = async () => {
    setLoading(true);
    try {
      const response = await pricingService.getByScenario(scenarioId);
      setPricing(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (p) => {
    setEditingId(p.id || `new-${p.origin_id}-${p.destination_id}-${p.segment}`);
    setEditFare(p.fare_usd);
  };

  const handleSave = async (p) => {
    try {
      if (p.is_override) {
        // Update existing override
        await pricingService.update(p.id, { fare_usd: parseFloat(editFare) });
      } else {
        // Create new override
        await pricingService.create(scenarioId, {
          origin_id: p.origin_id,
          destination_id: p.destination_id,
          segment: p.segment,
          fare_usd: parseFloat(editFare)
        });
      }
      toast.success('Price updated');
      setEditingId(null);
      fetchPricing();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to save price');
    }
  };

  const handleReset = async (p) => {
    if (!p.is_override) return;
    if (!window.confirm('Revert to master price?')) return;

    try {
      await pricingService.delete(p.id);
      toast.success('Price reset to master');
      fetchPricing();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to reset price');
    }
  };

  if (loading) return <div>Loading pricing...</div>;

  return (
    <div className="pricing-management" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="pricing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 700 }}>Pricing Management</h3>
          <p className="hint" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Master prices are shown as default. Add overrides to customize for this scenario.
          </p>
        </div>
        <div className="pricing-toolbar" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={fetchPricing}
            disabled={loading}
            style={{ 
              background: 'var(--glass-bg)', 
              backdropFilter: 'blur(10px)', 
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid var(--glass-border)', 
              color: 'var(--text-primary)',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'var(--transition)',
              boxShadow: 'var(--shadow-sm)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-color)';
              e.currentTarget.style.boxShadow = '0 0 10px rgba(99,102,241,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }}
          >
            {loading ? 'Refreshing...' : '🔄 Refetch Master Data'}
          </button>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search route or type..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                background: 'var(--glass-bg)', 
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid var(--glass-border)', 
                color: 'var(--text-primary)', padding: '0.5rem 1rem 0.5rem 2.2rem', 
                borderRadius: 'var(--radius-md)', outline: 'none', width: '250px'
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        <table className="pricing-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-light)', boxShadow: '0 1px 0 var(--border-color)' }}>
            <tr>
              <th onClick={() => handleSort('route')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Route{getSortIcon('route')}</th>
              <th onClick={() => handleSort('type')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type{getSortIcon('type')}</th>
              <th onClick={() => handleSort('fare')} style={{ padding: '1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Effective Fare{getSortIcon('fare')}</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedPricing.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No pricing records found.</td>
              </tr>
            ) : filteredAndSortedPricing.map(p => {
            const isEditing = editingId === (p.id || `new-${p.origin_id}-${p.destination_id}-${p.segment}`);
            return (
              <tr key={p.id || `new-${p.origin_id}-${p.destination_id}-${p.segment}`} className={p.is_override ? 'override' : ''}>
                <td>{p.origin_code} - {p.dest_code} ({p.segment})</td>
                <td>
                  <span className={p.is_override ? 'badge override' : 'badge global'}>
                    {p.is_override ? 'Scenario Override' : 'Global Master'}
                  </span>
                </td>
                <td>${p.fare_usd.toLocaleString()}</td>
                <td>
                  {isEditing ? (
                    <input 
                      type="number" 
                      value={editFare} 
                      onChange={e => setEditFare(e.target.value)}
                      className="edit-input"
                    />
                  ) : (
                    <strong>${p.fare_usd.toLocaleString()}</strong>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <>
                      <button className="btn-small btn-primary" onClick={() => handleSave(p)}>Save</button>
                      <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-small" onClick={() => handleEdit(p)}>
                        {p.is_override ? 'Edit Override' : 'Add Override'}
                      </button>
                      {p.is_override && (
                        <button className="btn-small btn-danger" onClick={() => handleReset(p)}>Reset</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PricingManagement;
