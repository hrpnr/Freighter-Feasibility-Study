import React, { useMemo } from 'react';
import { 
  ComposedChart, Bar, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

function CrewUtilizationChart({ data, loading }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Find last index with flight activity
    let lastActiveIndex = -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if ((data[i].crew_duty_demand || 0) > 0) {
        lastActiveIndex = i;
        break;
      }
    }

    if (lastActiveIndex === -1) return data.slice(0, 365);
    return data.slice(0, Math.min(lastActiveIndex + 10, data.length));
  }, [data]);

  const formatXAxis = (tickItem) => {
    const d = new Date(tickItem);
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const date = new Date(label).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      
      // Direct raw data access from the first available payload item
      const entry = payload[0].payload;
      const demand = parseFloat(entry.crew_duty_demand) || 0;
      const capacity = parseFloat(entry.crew_duty_capacity) || 0;
      const ceiling = parseFloat(entry.crew_daily_ceiling) || 0;
      
      const util = capacity > 0 ? (demand / capacity * 100).toFixed(1) : 0;
      
      return (
        <div className="chart-tooltip crew-tooltip">
          <p className="label">{date}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p className="demand" style={{ color: '#fff' }}>Required: <strong>{demand.toFixed(1)} crew-set-hrs</strong></p>
            <p className="capacity" style={{ color: '#10b981', fontSize: '11px' }}>Sustained Limit: {capacity.toFixed(1)} set-hrs/day</p>
            <p className="ceiling" style={{ color: '#f59e0b', fontSize: '11px' }}>Daily Ceiling: {ceiling.toFixed(1)} set-hrs ({Math.round(ceiling / 12 * 10 / 10 * (1/0.8))} sets × 12h × 80%)</p>
          </div>
          <div className="util-bar">
            <div className="util-fill" style={{ 
              width: `${Math.min(util, 100)}%`, 
              backgroundColor: util > 100 ? '#ef4444' : '#6366f1' 
            }} />
          </div>
          <p className="util-text">{util}% of Sustained Limit</p>
        </div>
      );
    }
    return null;
  };

  if (loading) return <div className="chart-placeholder">Loading crew data...</div>;
  if (!data || data.length === 0) return null;

  return (
    <div className="daily-pnl-container crew-utilization-container" style={{ marginTop: '24px' }}>
      <div className="chart-header">
        <div className="chart-header-main">
          <h3 style={{ color: '#6366f1' }}>Crew Duty Demand & Capacity</h3>
          <span className="pricing-remark">Fleet Crew-Set-Hours Required vs Available Roster Capacity</span>
        </div>
      </div>
      
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCapacity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorCeiling" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.05}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
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
              label={{ value: 'Total Man-Hours', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 10, offset: 10 }}
            />
            <Tooltip 
              content={<CustomTooltip />} 
              shared={true} 
              trigger="axis" 
            />
            
            <Area 
              type="monotone" 
              dataKey="crew_daily_ceiling" 
              stroke="#f59e0b" 
              fillOpacity={1} 
              fill="url(#colorCeiling)" 
              strokeWidth={1}
              name="Peak Surge Capacity"
            />

            <Area 
              type="monotone" 
              dataKey="crew_duty_capacity" 
              stroke="#10b981" 
              fillOpacity={1} 
              fill="url(#colorCapacity)" 
              strokeWidth={2}
              name="Sustained Monthly Limit"
            />
            
            <Line 
              type="monotone" 
              dataKey="crew_duty_demand" 
              stroke="#6366f1" 
              strokeWidth={3} 
              dot={false}
              activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
              name="Roster Demand"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-legend" style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginTop: '12px', fontSize: '10px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: '#6366f1', border: '1px solid #6366f1' }} />
          <span>Roster Demand (Crew-Set-Hours)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: '#10b981', border: '1px solid #10b981' }} />
          <span>Sustained Limit (Health)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: '#f59e0b', border: '1px solid #f59e0b' }} />
          <span>Daily Ceiling (Legal Max)</span>
        </div>
      </div>
    </div>
  );
}

export default CrewUtilizationChart;
