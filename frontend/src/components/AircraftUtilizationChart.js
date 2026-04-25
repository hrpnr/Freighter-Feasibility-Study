import React, { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

function AircraftUtilizationChart({ data, loading }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Trim to last active date
    let lastActiveIndex = -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if ((data[i].ac_block_hours || 0) > 0) {
        lastActiveIndex = i;
        break;
      }
    }
    if (lastActiveIndex === -1) return data.slice(0, 365);
    return data.slice(0, Math.min(lastActiveIndex + 10, data.length));
  }, [data]);

  const formatXAxis = (tick) => {
    const d = new Date(tick);
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const entry = payload[0].payload;
    const totalBH  = parseFloat(entry.ac_block_hours) || 0;
    const capacity = parseFloat(entry.ac_max_bh_capacity) || 0;
    const active_ac = parseInt(entry.ac_active) || 0;
    const flights  = parseInt(entry.ac_flights) || 0;
    const avgBH    = active_ac > 0 ? (totalBH / active_ac).toFixed(1) : '—';
    const utilPct  = capacity > 0 ? (totalBH / capacity * 100).toFixed(1) : '0.0';
    const date = new Date(entry.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

    return (
      <div className="chart-tooltip crew-tooltip">
        <p className="label">{date}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ color: '#fff' }}>Fleet Block Hours: <strong>{totalBH.toFixed(1)}h</strong></p>
          <p style={{ color: '#06b6d4', fontSize: '11px' }}>Avg per Aircraft: {avgBH}h</p>
          <p style={{ color: '#8b5cf6', fontSize: '11px' }}>Legs Flown: {flights}</p>
          <p style={{ color: '#94a3b8', fontSize: '11px' }}>Active Aircraft: {active_ac}</p>
        </div>
        <div className="util-bar">
          <div className="util-fill" style={{
            width: `${Math.min(utilPct, 100)}%`,
            backgroundColor: utilPct > 90 ? '#ef4444' : utilPct > 70 ? '#f59e0b' : '#06b6d4'
          }} />
        </div>
        <p className="util-text">{utilPct}% Fleet Utilization</p>
      </div>
    );
  };

  if (loading) return <div className="chart-placeholder">Loading aircraft data...</div>;
  if (!data || data.length === 0) return null;

  return (
    <div className="daily-pnl-container crew-utilization-container" style={{ marginTop: '24px' }}>
      <div className="chart-header">
        <div className="chart-header-main">
          <h3 style={{ color: '#06b6d4' }}>Aircraft Fleet Utilization</h3>
          <span className="pricing-remark">Daily Block Hours vs Fleet Capacity Ceiling</span>
        </div>
      </div>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAcCapacity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAcMax" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.06} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              minTickGap={60}
              stroke="#666"
            />
            <YAxis
              stroke="#666"
              label={{ value: 'Block Hours', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 10, offset: 10 }}
            />
            <Tooltip content={<CustomTooltip />} shared={true} trigger="axis" />

            {/* Shaded capacity ceiling */}
            <Area
              type="monotone"
              dataKey="ac_max_bh_capacity"
              stroke="#8b5cf6"
              fill="url(#colorAcMax)"
              strokeWidth={1}
              name="Max Capacity"
            />

            {/* Actual fleet block hours — solid vibrant line */}
            <Line
              type="monotone"
              dataKey="ac_block_hours"
              stroke="#06b6d4"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
              name="Fleet Block Hours"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend" style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginTop: '12px', fontSize: '10px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: '#06b6d4' }} />
          <span>Fleet Block Hours (Actual)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: '#8b5cf6' }} />
          <span>Fleet Max Capacity</span>
        </div>
      </div>
    </div>
  );
}

export default AircraftUtilizationChart;
