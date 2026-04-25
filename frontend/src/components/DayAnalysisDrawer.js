import React, { useState, useEffect } from 'react';
import { dailyPnLService } from '../services/api';
import { X, Activity, Briefcase, Zap, Truck, Wrench } from 'lucide-react';

const DayAnalysisDrawer = ({ scenarioId, date, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (scenarioId && date) {
      fetchAnalysis();
    }
  }, [scenarioId, date]);

  const fetchDataAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dailyPnLService.getDailyAnalysis(scenarioId, date);
      setData(response.data);
    } catch (err) {
      console.error('Error fetching daily analysis:', err);
      setError(err.niceMessage || 'Failed to fetch analysis data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysis = fetchDataAnalysis;

  if (!date) return null;

  return (
    <div className="analysis-drawer-overlay" onClick={onClose}>
      <div className="analysis-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>Daily Analysis</h2>
            <p className="hint" style={{ color: 'var(--text-muted)' }}>{new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="drawer-body">
          {loading ? (
            <div className="chart-placeholder">Analyzing operational data...</div>
          ) : error ? (
            <div className="chart-placeholder" style={{ color: '#f43f5e' }}>{error}</div>
          ) : data ? (
            <>
              <div className="analysis-summary">
                <div className="analysis-card">
                  <span className="analysis-card-label">Revenue</span>
                  <div className="analysis-card-value">${(data.summary.revenue || 0).toLocaleString()}</div>
                </div>
                <div className="analysis-card">
                  <span className="analysis-card-label">Expenses</span>
                  <div className="analysis-card-value">${(data.summary.cost || 0).toLocaleString()}</div>
                </div>
                <div className="analysis-card">
                  <span className="analysis-card-label">Net Profit</span>
                  <div className={`analysis-card-value ${data.summary.profit >= 0 ? 'value-profit' : 'value-loss'}`}>
                    ${(data.summary.profit || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="analysis-section-title">
                Flight Economics
                <span>{data.legs.length} Operations</span>
              </div>

              <div className="leg-audit-list">
                {Object.entries(data.legs.reduce((acc, leg) => {
                  const type = leg.ac_type || 'Unknown Type';
                  if (!acc[type]) acc[type] = {};
                  const tail = leg.ac_number || 'Unknown Tail';
                  if (!acc[type][tail]) acc[type][tail] = [];
                  acc[type][tail].push(leg);
                  return acc;
                }, {})).map(([typeName, tails]) => (
                  <div key={typeName} className="ac-type-group" style={{ marginBottom: '32px' }}>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: '800', 
                      color: 'var(--text-primary)', 
                      padding: '8px 16px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      borderLeft: '4px solid var(--primary-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <Zap size={14} /> {typeName.toUpperCase()} OPERATIONS
                    </div>

                    {Object.entries(tails).map(([tailNum, tailLegs]) => (
                      <div key={tailNum} className="tail-group" style={{ marginLeft: '12px', marginBottom: '24px' }}>
                         <div style={{ 
                           fontSize: '11px', 
                           fontWeight: '700', 
                           color: 'var(--text-muted)', 
                           marginBottom: '12px',
                           paddingLeft: '4px',
                           display: 'flex',
                           alignItems: 'center',
                           gap: '8px'
                         }}>
                           <Activity size={12} /> TAIL: {tailNum}
                         </div>

                         {Object.entries(tailLegs.reduce((acc, leg) => {
                            const rId = leg.rotation_group_id || ('unlinked-' + leg.segment);
                            if (!acc[rId]) acc[rId] = [];
                            acc[rId].push(leg);
                            return acc;
                         }, {})).map(([groupId, groupLegsRaw]) => {
                           const groupLegs = [...groupLegsRaw].sort((a, b) => (parseInt(a.priority) || 0) - (parseInt(b.priority) || 0));
                           return (
                             <div key={groupId} className="rotation-group-wrapper" style={{ 
                               marginBottom: '16px', 
                               background: 'rgba(255,255,255,0.02)', 
                               padding: '12px', 
                               borderRadius: '12px', 
                               border: '1px solid rgba(255, 255, 255, 0.05)' 
                             }}>
                               {groupLegs.length > 1 && (
                                 <div style={{ 
                                   fontSize: '10px', 
                                   color: 'var(--primary-color)', 
                                   marginBottom: '10px', 
                                   textTransform: 'uppercase', 
                                   fontWeight: '600'
                                 }}>
                                   Rotation: {groupLegs.map(l => l.segment).join(' ➔ ')}
                                 </div>
                               )}
                               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                 {groupLegs.map((leg, i) => {
                                   const profit = leg.revenue - leg.total_doc;
                                   const margin = leg.revenue > 0 ? (profit / leg.revenue) * 100 : 0;
                                   return (
                                     <div key={i} className="leg-audit-card" style={{ marginBottom: 0 }}>
                                       <div className="leg-card-header">
                                         <div className="leg-route-info">
                                           <h3>{leg.segment}</h3>
                                           <div className="leg-id-tag" style={{ color: 'var(--primary-color)', background: 'rgba(57, 137, 255, 0.1)' }}>
                                             <Truck size={10} style={{ marginRight: '4px' }} />
                                             {(leg.uplift_kg || 0).toLocaleString()} KG
                                           </div>
                                         </div>
                                         <div className={`pnl-badge ${profit >= 0 ? 'badge-profit' : 'badge-loss'}`}>
                                           {profit >= 0 ? 'PROFIT' : 'LOSS'}
                                         </div>
                                       </div>

                                       <div className="cargo-details-strip">
                                         <div className="cargo-manifest-stack">
                                           {leg.manifest?.map((item, mIdx) => (
                                             <div key={mIdx} className="manifest-item">
                                               <div className="m-route-info">
                                                 <span className="m-od">{item.od}</span>
                                                 <span className={`m-type-tag ${item.type.toLowerCase()}`}>
                                                   {item.type} {item.is_transit && '(TRN)'}
                                                 </span>
                                               </div>
                                               <div className="m-stats">
                                                 <div className="m-stat">
                                                   <span className="m-stat-label">WEIGHT</span>
                                                   <span className="m-stat-value">{Math.round(item.weight).toLocaleString()} KG</span>
                                                 </div>
                                                 <div className="m-stat">
                                                   <span className="m-stat-label">YIELD</span>
                                                   <span className="m-stat-value">${(item.price || 0).toFixed(2)}</span>
                                                 </div>
                                               </div>
                                             </div>
                                           ))}
                                         </div>
                                       </div>

                                       <div className="leg-card-grid">
                                         <div className="leg-financial-summary">
                                           <div className="leg-metric-main" style={{ color: '#10b981' }}>
                                             ${leg.revenue.toLocaleString()}
                                           </div>
                                           <div className="leg-metric-sub">Gross Revenue</div>
                                           <div className="margin-analysis">
                                              <div className="leg-details-row" style={{ border: 'none' }}>
                                                <span className="leg-details-label">Margin</span>
                                                <span className="leg-details-value" style={{ color: margin >= 0 ? '#10b981' : '#f43f5e' }}>
                                                  {margin.toFixed(1)}%
                                                </span>
                                              </div>
                                              <div className="margin-bar-container">
                                                <div className="margin-bar-fill" style={{
                                                  width: `${Math.min(100, Math.max(0, margin))}%`,
                                                  background: margin >= 0 ? '#10b981' : '#f43f5e'
                                                }} />
                                              </div>
                                           </div>
                                         </div>
                                         <div className="leg-cost-breakdown-details">
                                           <div className="leg-details-row">
                                              <span className="leg-details-label">Fuel Cost</span>
                                              <span className="leg-details-value">${(leg.fuel || 0).toLocaleString()}</span>
                                           </div>
                                           <div className="leg-details-row">
                                              <span className="leg-details-label">Ground Handling</span>
                                              <span className="leg-details-value">${(leg.handling || 0).toLocaleString()}</span>
                                           </div>
                                           <div className="leg-details-row" style={{ border: 'none' }}>
                                              <span className="leg-details-label">Crew Variable</span>
                                              <span className="leg-details-value">${(leg.crew || 0).toLocaleString()}</span>
                                           </div>
                                           <div className="leg-metric-sub" style={{ textAlign: 'right', marginTop: '8px', color: '#fff', fontWeight: 600 }}>
                                              Total DOC: ${(leg.total_doc || 0).toLocaleString()}
                                           </div>
                                         </div>
                                       </div>
                                       <div className="hint" style={{ fontSize: '10px', marginTop: '8px', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '12px' }}>
                                         <span><Activity size={10} /> {(leg.block_hours || 0).toFixed(2)} BH</span>
                                         <span><Zap size={10} /> {((leg.total_doc || 0) / (leg.block_hours || 1)).toFixed(0)} USD/BH</span>
                                       </div>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           )
                         })}
                      </div>
                    ))}
                  </div>
                ))}

                {data.legs.length === 0 && (
                  <div className="chart-placeholder">No active operations on this date.</div>
                )}
              </div>

              <div className="analysis-section-title">Daily Fixed Allocation</div>
              <div className="fixed-costs-grid">
                <div className="fixed-cost-item">
                  <div className="f-label-group">
                    <Briefcase size={14} />
                    <span className="f-label">Aircraft Lease</span>
                  </div>
                  <span className="f-value">${data.fixed_costs.lease.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="fixed-cost-item">
                  <div className="f-label-group">
                    <Zap size={14} />
                    <span className="f-label">Insurance</span>
                  </div>
                  <span className="f-value">${data.fixed_costs.insurance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="fixed-cost-item">
                  <div className="f-label-group">
                    <Truck size={14} />
                    <span className="f-label">Crew Salaries</span>
                  </div>
                  <span className="f-value">${data.fixed_costs.crew_fixed.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="fixed-cost-item">
                  <div className="f-label-group">
                    <Activity size={14} />
                    <span className="f-label">Admin Overhead</span>
                  </div>
                  <span className="f-value">${data.fixed_costs.overhead.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              {data.maintenance.length > 0 && (
                <>
                  <div className="analysis-section-title">Maintenance Impact</div>
                  <div className="maintenance-list">
                    {data.maintenance.map((mtx, i) => (
                      <div key={i} className="fixed-cost-item" style={{ borderLeft: '3px solid #ef4444', marginBottom: '8px' }}>
                        <span className="f-label"><Wrench size={14} style={{ marginRight: '8px' }} /> {mtx.event_name}</span>
                        <span className="f-value" style={{ color: '#ef4444' }}>-${parseFloat(mtx.cost).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="chart-placeholder">No analysis data found.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DayAnalysisDrawer;
