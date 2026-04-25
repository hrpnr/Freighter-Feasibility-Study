import React, { useState, useEffect, useMemo } from 'react';
import { scenarioService, monteCarloService, masterSettingsService, fleetService } from '../services/api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import './MonteCarloSimulation.css';

const DEFAULT_VARIABLES = {
  avg_load_factor_pct: {
    label: 'Uplift Confidence Level', type: 'triangular', unit: '%',
    params: { min: 0.60, mode: 0.85, max: 1.30 }
  },
  fuel_price_idr_per_liter: {
    label: 'Fuel Price (IDR/L)', type: 'triangular', unit: 'IDR',
    params: { min: 8000, mode: 10500, max: 14000 }
  },
  fare_growth_rate_annual: {
    label: 'Annual Fare Growth', type: 'normal', unit: '%',
    params: { mean: 0.07, stdDev: 0.025 }
  },
  traffic_growth_rate_annual: {
    label: 'Traffic Growth', type: 'triangular', unit: '%',
    params: { min: 0.10, mode: 0.25, max: 0.40 }
  }
};

const fmt = (v, d = 2) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const m = v / 1_000_000;
  return `$${m.toFixed(d)}M`;
};
const pctFmt = (v) => (v != null && !isNaN(v)) ? `${(v * 100).toFixed(1)}%` : '—';

function MonteCarloSimulation() {
  const [scenarios, setScenarios]     = useState([]);
  const [scenarioId, setScenarioId]   = useState('');
  const [correlationRho, setCorrelationRho] = useState(-0.35);
  const [iterations, setIterations]   = useState(1000);
  const [confidence, setConfidence]   = useState(0.95);
  const [variables, setVariables]     = useState(DEFAULT_VARIABLES);
  const [scenarioParams, setScenarioParams] = useState(null);
  const [activeFleet, setActiveFleet] = useState(null);
  const [results, setResults]         = useState(null);
  const [loading, setLoading]         = useState(false);

  // Load scenario list and master parameters (Rule 5: all API calls through api.js services)
  useEffect(() => {
    scenarioService.getAll()
      .then(res => {
        const list = res.data || [];
        setScenarios(list);
        if (list.length > 0) setScenarioId(list[0].id);
      })
      .catch(() => toast.error('Failed to load scenarios'));

    masterSettingsService.getParameters()
      .then(res => {
        const p = res.data || {};
        if (p.fuel_traffic_correlation_rho !== undefined) setCorrelationRho(parseFloat(p.fuel_traffic_correlation_rho));
      })
      .catch(() => {}); // non-critical — fallback to default
  }, []);

  // Fetch scenario-specific parameters when scenario selection changes
  useEffect(() => {
    if (!scenarioId) {
      setScenarioParams(null);
      return;
    }
    scenarioService.getParameters(scenarioId)
      .then(res => setScenarioParams(res.data))
      .catch(() => setScenarioParams(null));

    // Fetch fleet to get aircraft payload limits
    fleetService.getAll(scenarioId)
      .then(res => {
        if (res.data && res.data.length > 0) setActiveFleet(res.data[0]);
        else setActiveFleet(null);
      })
      .catch(() => setActiveFleet(null));
  }, [scenarioId]);

  // Build histogram from raw results in the frontend — no extra API call
  const histogram = useMemo(() => {
    if (!results?.results?.length) return [];
    const npvs = results.results.map(r => r.npv).filter(v => !isNaN(v) && v !== null).sort((a, b) => a - b);
    if (npvs.length < 2) return [];
    const binCount = 40;
    const min = npvs[0];
    const max = npvs[npvs.length - 1];
    const width = (max - min) / binCount || 1;
    return Array.from({ length: binCount }, (_, i) => {
      const lo = min + i * width;
      const hi = lo + width;
      const mid = (lo + hi) / 2;
      const count = npvs.filter(v => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length;
      return { midM: mid / 1_000_000, count, isLoss: mid < 0 };
    });
  }, [results]);

  const runSimulation = async () => {
    if (!scenarioId) { toast.error('Please select a scenario'); return; }
    setLoading(true);
    const toastId = toast.loading(`Running ${iterations.toLocaleString()} iterations…`);
    try {
      const payload = {
        iterations,
        confidenceLevel: confidence,
        correlationRho,   // fetched from master parameters (Settings → Parameters → Monte Carlo)
        variables: Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, { type: v.type, params: v.params }])
        )
      };
      const res = await monteCarloService.simulate(scenarioId, payload);
      setResults(res.data);
      toast.success(`${iterations.toLocaleString()} scenarios completed`, { id: toastId });
    } catch (err) {
      toast.error(err.niceMessage || 'Simulation failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const updateParam = (varKey, field, rawValue) => {
    let value = parseFloat(rawValue);
    if (isNaN(value)) value = 0;
    
    // If unit is '%', user enters 85 for 0.85
    if (variables[varKey].unit === '%') {
      value = value / 100;
    }

    setVariables(prev => ({
      ...prev,
      [varKey]: { ...prev[varKey], params: { ...prev[varKey].params, [field]: value } }
    }));
  };

  const updateType = (varKey, newType) => {
    const p = variables[varKey].params;
    const defaultParams = newType === 'normal'
      ? { mean: p.mode || p.mean || 0, stdDev: 0.02 }
      : newType === 'uniform'
        ? { min: p.min || 0, max: p.max || 1 }
        : { min: p.min || 0, mode: p.mode || 0.5, max: p.max || 1 };
    setVariables(prev => ({ ...prev, [varKey]: { ...prev[varKey], type: newType, params: defaultParams } }));
  };

  const stats    = results?.statistics;
  const risk     = results?.riskMetrics;
  const lossPct  = risk?.npv?.probabilityOfLoss;
  const kpiColor = lossPct > 0.20 ? 'mc-kpi-danger' : lossPct > 0.05 ? 'mc-kpi-warn' : 'mc-kpi-safe';

  return (
    <div className="mc-page">
      {/* ── Header ── */}
      <div className="mc-header">
        <div>
          <h1 className="mc-title">🎲 Risk Cockpit</h1>
          <p className="mc-subtitle">Monte Carlo Simulation — Probabilistic Scenario Analysis</p>
        </div>
        <div className="mc-controls">
          <select className="mc-select" value={scenarioId} onChange={e => setScenarioId(e.target.value)}>
            <option value="">— Select Scenario —</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="mc-select-sm" value={iterations} onChange={e => setIterations(parseInt(e.target.value))}>
            {[500, 1000, 2000, 5000].map(n => <option key={n} value={n}>{n.toLocaleString()} runs</option>)}
          </select>
          <select className="mc-select-sm" value={confidence} onChange={e => setConfidence(parseFloat(e.target.value))}>
            <option value={0.90}>90% CI</option>
            <option value={0.95}>95% CI</option>
            <option value={0.99}>99% CI</option>
          </select>
          <button className="mc-run-btn" onClick={runSimulation} disabled={loading}>
            {loading ? <span className="mc-spinner" /> : '▶ Run Simulation'}
          </button>
        </div>
      </div>

      <div className="mc-body">
        {/* ── Left: Variable Configurator ── */}
        <div className="mc-left">
          <p className="mc-section-title">Input Variables</p>
          {Object.entries(variables).map(([key, v]) => (
            <div key={key} className="mc-var-card">
              <div className="mc-var-header">
                <span className="mc-var-label">{v.label}</span>
                <select className="mc-dist-select" value={v.type} onChange={e => updateType(key, e.target.value)}>
                  <option value="triangular">Triangular</option>
                  <option value="normal">Normal</option>
                  <option value="uniform">Uniform</option>
                  <option value="lognormal">Log-Normal</option>
                </select>
              </div>

              {/* Volume impact preview removed per user request */}

              <div className="mc-var-params">
                {v.type === 'normal' && (
                  <>
                    <label>Mean {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.mean * 100).toFixed(1) : v.params.mean} onChange={e => updateParam(key, 'mean', e.target.value)} /></label>
                    <label>Std Dev {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.stdDev * 100).toFixed(2) : v.params.stdDev} onChange={e => updateParam(key, 'stdDev', e.target.value)} /></label>
                  </>
                )}
                {(v.type === 'triangular') && (
                  <>
                    <label>Min {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.min * 100).toFixed(1) : v.params.min} onChange={e => updateParam(key, 'min', e.target.value)} /></label>
                    <label>Mode {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.mode * 100).toFixed(1) : v.params.mode} onChange={e => updateParam(key, 'mode', e.target.value)} /></label>
                    <label>Max {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.max * 100).toFixed(1) : v.params.max} onChange={e => updateParam(key, 'max', e.target.value)} /></label>
                  </>
                )}
                {(v.type === 'uniform' || v.type === 'lognormal') && (
                  <>
                    <label>Min {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.min * 100).toFixed(1) : v.params.min} onChange={e => updateParam(key, 'min', e.target.value)} /></label>
                    <label>Max {v.unit === '%' ? '(%)' : ''}<input type="number" step="any" value={v.unit === '%' ? (v.params.max * 100).toFixed(1) : v.params.max} onChange={e => updateParam(key, 'max', e.target.value)} /></label>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Right: Results ── */}
        <div className="mc-right">
          {/* KPI Row */}
          <div className="mc-kpi-row">
            <div className={`mc-kpi ${results ? kpiColor : ''}`}>
              <span className="mc-kpi-label">P(Loss)</span>
              <span className="mc-kpi-value">{results ? pctFmt(lossPct) : '—'}</span>
              <span className="mc-kpi-sub">Probability NPV &lt; 0</span>
            </div>
            <div className="mc-kpi">
              <span className="mc-kpi-label">Mean NPV</span>
              <span className="mc-kpi-value">{results ? fmt(stats?.npv?.mean) : '—'}</span>
              <span className="mc-kpi-sub">Expected value</span>
            </div>
            <div className="mc-kpi mc-kpi-danger-soft">
              <span className="mc-kpi-label">CVaR ({pctFmt(confidence)})</span>
              <span className="mc-kpi-value">{results ? fmt(risk?.npv?.CVaR) : '—'}</span>
              <span className="mc-kpi-sub">Avg loss in worst tail</span>
            </div>
            <div className="mc-kpi">
              <span className="mc-kpi-label">P95 NPV</span>
              <span className="mc-kpi-value">{results ? fmt(stats?.npv?.p95) : '—'}</span>
              <span className="mc-kpi-sub">Optimistic ceiling</span>
            </div>
          </div>

          {/* Distribution Chart */}
          <div className="mc-chart-container">
            <div className="mc-chart-header">
              <span>NPV Probability Distribution</span>
              {results && (
                <span className="mc-chart-sub">
                  {results.iterations?.toLocaleString()} simulations &nbsp;·&nbsp;
                  <span style={{ color: '#ef4444' }}>■</span> Loss &nbsp;
                  <span style={{ color: '#6366f1' }}>■</span> Profit
                </span>
              )}
            </div>
            {!results ? (
              <div className="mc-empty">Configure variables and run a simulation to see the NPV distribution</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={histogram} margin={{ top: 10, right: 20, left: 10, bottom: 0 }} barCategoryGap="2%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a3040" />
                  <XAxis dataKey="midM" tickFormatter={v => `$${v.toFixed(1)}M`} stroke="#555" tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis stroke="#555" tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="chart-tooltip">
                          <p>Mid: <strong>${d.midM.toFixed(2)}M</strong></p>
                          <p>Frequency: <strong>{payload[0].value}</strong></p>
                          <p style={{ color: d.isLoss ? '#ef4444' : '#10b981' }}>
                            {d.isLoss ? '⚠ Loss scenario' : '✓ Profit scenario'}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    x={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2"
                    label={{ value: 'Break-even', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {histogram.map((entry, i) => (
                      <Cell key={i} fill={entry.isLoss ? 'rgba(239,68,68,0.75)' : 'rgba(99,102,241,0.7)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stats Tables */}
          {results && (
            <div className="mc-bottom-row">
              <div className="mc-stats-table">
                <div className="mc-stats-header">NPV Percentile Band</div>
                {[
                  ['P5 (Bear Case)',  stats?.npv?.p5],
                  ['P25',            stats?.npv?.p25],
                  ['Median',         stats?.npv?.median],
                  ['P75',            stats?.npv?.p75],
                  ['P95 (Bull Case)',stats?.npv?.p95],
                ].map(([label, val]) => (
                  <div key={label} className="mc-stat-row">
                    <span>{label}</span>
                    <span style={{ color: (val ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
              <div className="mc-stats-table">
                <div className="mc-stats-header">Risk Metrics ({pctFmt(confidence)})</div>
                {[
                  [`VaR @ ${pctFmt(confidence)}`,   risk?.npv?.VaR],
                  ['CVaR (Expected Shortfall)',       risk?.npv?.CVaR],
                  ['Std Deviation (NPV)',             stats?.npv?.stdDev],
                  ['Max NPV (Best Case)',             stats?.npv?.max],
                ].map(([label, val]) => (
                  <div key={label} className="mc-stat-row">
                    <span>{label}</span>
                    <span style={{ color: (val ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MonteCarloSimulation;
