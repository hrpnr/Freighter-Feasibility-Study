import React, { useState, useEffect } from 'react';
import { scenarioService, masterSettingsService } from '../services/api';
import toast from 'react-hot-toast';

function ParametersManagement({ scenarioId }) {
  const [params, setParams] = useState({});
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (scenarioId) fetchParameters();
    else fetchMasterParameters();
  }, [scenarioId]);

  const fetchParameters = async () => {
    setLoading(true);
    try {
      const response = await scenarioService.getParameters(scenarioId);
      setParams(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch parameters');
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterParameters = async () => {
    setLoading(true);
    try {
      const response = await masterSettingsService.getParameters();
      setParams(response.data);
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to fetch master parameters');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (field, currentVal) => {
    setEditingField(field);
    setEditValue(currentVal ?? '');
  };

  const handleSave = async (field) => {
    try {
      if (scenarioId) {
        await scenarioService.updateParameters(scenarioId, { [field]: parseFloat(editValue) });
      } else {
        await masterSettingsService.updateParameters({ [field]: parseFloat(editValue) });
      }

      toast.success('Parameter updated');
      setEditingField(null);
      scenarioId ? fetchParameters() : fetchMasterParameters();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to save parameter');
    }
  };

  const handleReset = async (field) => {
    if (!window.confirm('Revert parameter to global master default?')) return;
    try {
      await scenarioService.updateParameters(scenarioId, { [field]: null });
      toast.success('Reverted to global default');
      fetchParameters();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to reset parameter');
    }
  };

  const handleResetAllToMaster = async () => {
    if (!window.confirm(
      'This will remove ALL scenario-level overrides and revert every parameter to its Master default value.\n\nAre you sure?'
    )) return;
    setResetting(true);
    try {
      // Send null for every known parameter field.
      // The backend COALESCE logic then falls back to master values automatically,
      // and the Source badge correctly shows "Master".
      const allFields = [
        'fare_growth_rate_annual', 'seasonality_constant', 'seasonality_slope',
        'traffic_growth_rate_annual',
        'fuel_price_idr_per_liter', 'usd_to_idr_rate',
        'avg_taxi_time_hours', 'non_linear_flight_path_effect_pct', 'apu_op_hour_ratio',
        'ground_handling_fee_usd',
        'pilot_annual_salary_usd', 'fo_annual_salary_usd', 'pilot_count_per_ac',
        'pilot_fata_per_hour_usd', 'pilot_afb_per_hour_usd', 'pilot_lot_per_hour_usd',
        'fo_fata_per_hour_usd', 'fo_afb_per_hour_usd', 'fo_lot_per_hour_usd',
        'insurance_cost_per_ac_month_usd', 'overhead_cost_month_usd',
        'eis_cost_usd', 'redelivery_cost_usd', 'cost_of_capital',
        'crew_fatigue_reserve_pct', 'crew_duty_buffer_hours', 'max_duty_hours_per_week'
      ];
      const payload = {};
      allFields.forEach(k => { payload[k] = null; });

      await scenarioService.updateParameters(scenarioId, payload);
      toast.success('All parameters reset to master values');
      fetchParameters();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to reset all parameters');
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading parameters...</div>;

  const isOverride = (field) => params[`override_${field}`];

  const fmt = (field, val) => {
    if (val === null || val === undefined || val === '') return '—';
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    if (field.includes('growth') || field.includes('rate') || field.includes('effect_pct') || field.includes('ratio')) {
      return `${(n * 100).toFixed(2)}%`;
    }
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const renderRow = (label, field, hint = '') => {
    const val = params[field];
    const override = isOverride(field);
    const isEditing = editingField === field;
    return (
      <tr key={field} className={override ? 'override' : ''}>
        <td>
          <div style={{ fontWeight: 600, fontSize: '13px' }}>{label}</div>
          {hint && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
        </td>
        <td>
          <span className={override ? 'badge override' : 'badge global'}>
            {override ? 'Override' : 'Master'}
          </span>
        </td>
        <td>
          {isEditing ? (
            <input
              type="number"
              step="any"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="edit-input"
              autoFocus
            />
          ) : (
            <strong>{fmt(field, val)}</strong>
          )}
        </td>
        <td>
          {isEditing ? (
            <>
              <button className="btn-small btn-primary" onClick={() => handleSave(field)}>Save</button>
              <button className="btn-small btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn-small" onClick={() => handleEdit(field, val)}>
                {override ? 'Edit' : 'Override'}
              </button>
              {override && scenarioId && (
                <button className="btn-small btn-danger" onClick={() => handleReset(field)}>Reset</button>
              )}
            </>
          )}
        </td>
      </tr>
    );
  };

  const Section = ({ title, color, children }) => (
    <div style={{ marginBottom: '28px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '10px', paddingBottom: '8px',
        borderBottom: `2px solid ${color || 'rgba(255,255,255,0.08)'}`
      }}>
        <div style={{ width: '4px', height: '18px', background: color || 'var(--primary-color)', borderRadius: '2px' }} />
        <h4 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', color: color || 'var(--text-primary)' }}>
          {title}
        </h4>
      </div>
      <table className="parameters-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: '40%' }}>Parameter</th>
            <th style={{ width: '15%' }}>Source</th>
            <th style={{ width: '25%' }}>Value</th>
            <th style={{ width: '20%' }}>Actions</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  return (
    <div className="parameters-management">
      <div className="parameters-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0 }}>Model Parameters</h3>
            <p className="hint" style={{ marginTop: '6px' }}>
              All parameters below directly drive the P&L simulation engine.
              {scenarioId ? ' Scenario overrides take precedence over master defaults.' : ' These are the global master defaults.'}
            </p>
          </div>
          {scenarioId && (
            <button
              onClick={handleResetAllToMaster}
              disabled={resetting}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px',
                background: resetting ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                color: resetting ? 'var(--text-muted)' : '#ef4444',
                fontWeight: 600,
                fontSize: '13px',
                cursor: resetting ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { if (!resetting) e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
              onMouseLeave={e => { if (!resetting) e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
            >
              {resetting ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Resetting...
                </>
              ) : (
                <>
                  ↺ Reset All to Master Values
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── 1. MARKET & REVENUE ──────────────────────────────────── */}
      <Section title="1. Market & Revenue Growth" color="#3b82f6">
        {renderRow('Fare Growth / Yr', 'fare_growth_rate_annual', 'Annual % increase in price per kg (compounded)')}
        {renderRow('Seasonality Constant (C)', 'seasonality_constant', 'Index = C + S × Month. Set C=1, S=0 for no seasonality')}
        {renderRow('Seasonality Slope (S)', 'seasonality_slope', 'Monthly demand gradient. Positive = year-end peak')}
      </Section>

      {/* ── 2. TRAFFIC GROWTH ──────────────────────────────── */}
      <Section title="2. Traffic Growth" color="#8b5cf6">
        {renderRow('Annual Cargo Growth / Yr', 'traffic_growth_rate_annual', 'Global annual cargo volume growth rate (compounded)')}
      </Section>

      {/* ── 3. FUEL & FOREX ──────────────────────────────────────── */}
      <Section title="3. Fuel & Foreign Exchange" color="#f59e0b">
        {renderRow('Fuel Price (IDR/Liter)', 'fuel_price_idr_per_liter', 'Avtur price in Indonesian Rupiah per liter')}
        {renderRow('USD to IDR Rate', 'usd_to_idr_rate', 'Exchange rate used to convert fuel cost to USD')}
      </Section>

      {/* ── 4. FLIGHT OPERATIONS ─────────────────────────────────── */}
      <Section title="4. Flight Operations" color="#06b6d4">
        {renderRow('Avg Taxi Time (hours)', 'avg_taxi_time_hours', 'Added to flight time to calculate block hours')}
        {renderRow('Non-Linear Path Effect', 'non_linear_flight_path_effect_pct', 'Route efficiency factor (e.g. 0.05 = 5% longer than GCD)')}
        {renderRow('APU Op Hour Ratio', 'apu_op_hour_ratio', 'APU hours per block hour — affects APU maintenance accrual')}
        {renderRow('Ground Handling Fee (USD/cycle)', 'ground_handling_fee_usd', 'Per-flight landing/handling charge')}
      </Section>

      {/* ── 5. CREW COSTS ────────────────────────────────────────── */}
      <Section title="5. Crew Costs" color="#ec4899">
        {renderRow('Pilot Annual Salary (USD)', 'pilot_annual_salary_usd', 'Fixed salary — allocated daily to fixed cost')}
        {renderRow('F/O Annual Salary (USD)', 'fo_annual_salary_usd', 'Fixed salary — allocated daily to fixed cost')}
        {renderRow('Pilot Count / Aircraft', 'pilot_count_per_ac', 'Number of captains assigned per aircraft')}
        {renderRow('Pilot FATA (USD/BH)', 'pilot_fata_per_hour_usd', 'Flight attendance & travel allowance per block hour')}
        {renderRow('Pilot AFB (USD/BH)', 'pilot_afb_per_hour_usd', 'Away from base allowance per block hour')}
        {renderRow('Pilot LOT (USD/BH)', 'pilot_lot_per_hour_usd', 'Landing & overnight travel allowance per block hour')}
        {renderRow('F/O FATA (USD/BH)', 'fo_fata_per_hour_usd', 'First officer flight attendance allowance per block hour')}
        {renderRow('F/O AFB (USD/BH)', 'fo_afb_per_hour_usd', 'First officer away from base allowance per block hour')}
        {renderRow('F/O LOT (USD/BH)', 'fo_lot_per_hour_usd', 'First officer landing & overnight allowance per block hour')}
      </Section>

      {/* ── 6. CREW COMPLIANCE & FATIGUE ───────────────────────── */}
      <Section title="6. Crew Compliance & Fatigue" color="#10b981">
        {renderRow('Crew Fatigue Reserve (%)', 'crew_fatigue_reserve_pct', 'Buffer for leave, sickness & standby (e.g. 0.2 = 80% effective capacity)')}
        {renderRow('Duty Buffer (Hours)', 'crew_duty_buffer_hours', 'Pre/Post flight duty time added to block hours per flight cycle')}
        {renderRow('Max Weekly Duty (Hours)', 'max_duty_hours_per_week', 'Maximum allowable duty hours in a rolling 7-day period (ICAO compliant)')}
      </Section>

      {/* ── 7. FIXED & ONE-TIME COSTS ────────────────────────────── */}
      <Section title="7. Fixed & One-Time Costs" color="#ef4444">
        {renderRow('Insurance (USD/AC/Month)', 'insurance_cost_per_ac_month_usd', 'Hull & liability insurance allocated per aircraft per month')}
        {renderRow('Monthly Overhead (USD)', 'overhead_cost_month_usd', 'Admin, management & general overhead per month')}
        {renderRow('EIS Cost (USD)', 'eis_cost_usd', 'One-time entry-into-service cost applied at go-live month')}
        {renderRow('Redelivery Cost (USD)', 'redelivery_cost_usd', 'One-time cost applied at aircraft redelivery month')}
        {renderRow('Cost of Capital / WACC (%)', 'cost_of_capital', 'Discount rate used for NPV & IRR calculation only')}
      </Section>
    </div>
  );
}

export default ParametersManagement;
