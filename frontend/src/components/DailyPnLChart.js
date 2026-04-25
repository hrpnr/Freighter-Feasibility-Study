import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell 
} from 'recharts';

function DailyPnLChart({ data, summary, loading, onDateSelect }) {

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Find the last index where revenue was generated
    let lastActiveIndex = -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].revenue > 0) {
        lastActiveIndex = i;
        break;
      }
    }

    // If no active flights found, show the first year of the scenario at least
    if (lastActiveIndex === -1) {
       return data.slice(0, 365);
    }

    const endIdx = Math.min(lastActiveIndex + 1, data.length);
    return data.slice(0, endIdx);
  }, [data]);

  // Dynamically format ticks based on range
  const formatXAxis = (tickItem) => {
    const d = new Date(tickItem);
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const date = new Date(label).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      return (
        <div className="chart-tooltip">
          <p className="label">{date}</p>
          <p className="profit">P&L: <strong>${payload[0].value.toLocaleString()}</strong></p>
          <p className="rev">Rev: ${payload[0].payload.revenue.toLocaleString()}</p>
          <p className="cost">Cost: ${payload[0].payload.cost.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) return <div className="chart-placeholder">Loading chart...</div>;
  if (!summary.hasData) return (
    <div className="chart-placeholder no-data">
      <p>No profitability data available.</p>
      <small>Run calculation to generate daily P&L visualization.</small>
    </div>
  );

  return (
    <div className="daily-pnl-container">
      <div className="chart-header">
        <div className="chart-header-main">
          <h3>Daily Profit & Loss (Active Operation Period)</h3>
          <span className="pricing-remark">{summary.pricingRemark}</span>
        </div>
        
        <div className="financial-metrics-strip">
          <div className="metric-card">
            <span className="m-label">Scenario NPV</span>
            <span className={`m-value ${(summary.npv || 0) >= 0 ? 'positive' : 'negative'}`}>
              {(summary.npv || 0) >= 0 ? '+' : ''}${(Math.abs(summary.npv) || 0).toLocaleString()}
            </span>
            <span className="m-sub">Net Present Value (5Y)</span>
          </div>
          <div className="metric-card">
            <span className="m-label">Annualized IRR</span>
            <span className={`m-value ${(summary.irr || 0) >= 15 ? 'high' : (summary.irr || 0) > 0 ? 'positive' : 'negative'}`}>
              {(summary.irr || 0).toLocaleString()}%
            </span>
            <span className="m-sub">Internal Rate of Return</span>
          </div>
          <div className="metric-card">
            <span className="m-label">Payback Period</span>
            <span className="m-value">
              {summary.paybackMonths ? `${summary.paybackMonths} Mo` : 'N/A'}
            </span>
            <span className="m-sub">Break-even Horizon</span>
          </div>
        </div>
      </div>
      
      <div style={{ width: '100%', height: 350 }}>
        <ResponsiveContainer>
          <BarChart 
            data={chartData} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onClick={(state) => {
              if (state && state.activePayload && onDateSelect) {
                onDateSelect(state.activePayload[0].payload.date);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatXAxis}
              minTickGap={60}
              stroke="#666" 
            />
            <YAxis 
              stroke="#666" 
              tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#666" />
            <Bar dataKey="profit">
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} 
                  fillOpacity={0.8}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DailyPnLChart;
