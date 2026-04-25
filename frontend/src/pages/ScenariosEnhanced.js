import React, { useState, useEffect } from 'react';
import { scenarioService, dailyPnLService } from '../services/api';
import toast from 'react-hot-toast';
import FleetManagement from '../components/FleetManagement';
import ScheduleBuilder from '../components/ScheduleBuilder';
import DailyPnLChart from '../components/DailyPnLChart';
import CrewUtilizationChart from '../components/CrewUtilizationChart';
import AircraftUtilizationChart from '../components/AircraftUtilizationChart';
import PricingManagement from '../components/PricingManagement';
import ParametersManagement from '../components/ParametersManagement';
import AirportFeesManagement from '../components/AirportFeesManagement';
import CrewManagement from '../components/CrewManagement';
import HolidaysManagement from '../components/HolidaysManagement';
import DayAnalysisDrawer from '../components/DayAnalysisDrawer';
import ScenarioMaintenancePanel from '../components/ScenarioMaintenancePanel';
import './ScenariosEnhanced.css';

function ScenariosEnhanced() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_date: '',
    go_live_date: ''
  });
  const [isStale, setIsStale] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dailyData, setDailyData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    fetchScenarios();
  }, []);

  useEffect(() => {
    if (selectedScenario) fetchDailyData();
  }, [selectedScenario, refreshKey]);

  const fetchDailyData = async () => {
    if (!selectedScenario) return;
    setLoadingChart(true);
    try {
      const response = await dailyPnLService.getDailyPnL(selectedScenario.id);
      setDailyData(response.data.data || []);
      setSummary(response.data.summary || {});
      setIsStale(response.data.summary?.isStale);
    } catch (error) {
      console.error('Error fetching daily data:', error);
    } finally {
      setLoadingChart(false);
    }
  };

  const fetchScenarios = async () => {
    try {
      const response = await scenarioService.getAll();
      setScenarios(response.data);
      if (response.data.length > 0 && !selectedScenario) {
        setSelectedScenario(response.data[0]);
      }
    } catch (error) {
      toast.error('Failed to fetch scenarios');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editing) {
        await scenarioService.update(editing.id, formData);
        toast.success('Scenario updated');
      } else {
        const response = await scenarioService.create(formData);
        setSelectedScenario(response.data);
        toast.success('Scenario created');
      }
      
      setShowModal(false);
      setEditing(null);
      setFormData({ name: '', description: '', base_date: '', go_live_date: '' });
      fetchScenarios();
    } catch (error) {
      toast.error(error.niceMessage || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This will remove all associated schedules, fleet, traffic, and revenue data for this scenario.')) return;
    try {
      await scenarioService.delete(id);
      toast.success('Scenario deleted');
      setSelectedScenario(null);
      fetchScenarios();
    } catch (error) { toast.error(error.niceMessage || 'Failed to delete scenario'); }
  };

  const handleCalculate = async () => {
    if (!selectedScenario) return;
    
    toast.loading('Calculating scenario... This may take several minutes', { id: 'calc' });
    
    try {
      const response = await scenarioService.calculate(selectedScenario.id);
      toast.success(
        `Calculation complete! Total Profit: $${(response.data.summary.totalProfit / 1000000).toFixed(2)}M | NPV: $${(response.data.summary.npv / 1000000).toFixed(2)}M`,
        { id: 'calc', duration: 5000 }
      );
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      const errMsg = error.response?.data?.details || error.response?.data?.error || 'Unknown error occurred.';
      toast.error(`Calculation failed: ${errMsg}`, { id: 'calc', duration: 10000 });
    }
  };

  return (
    <div className="scenarios-enhanced">
      <div className="scenarios-sidebar">
        <div className="sidebar-header">
          <h2>Scenarios</h2>
          <button className="btn-icon" onClick={() => {
            setEditing(null);
            setFormData({ name: '', description: '', base_date: '', go_live_date: '' });
            setShowModal(true);
          }}>
            +
          </button>
        </div>

        <div className="scenario-list">
          {scenarios.map(scenario => (
            <div
              key={scenario.id}
              className={selectedScenario?.id === scenario.id ? 'scenario-item active' : 'scenario-item'}
              onClick={() => setSelectedScenario(scenario)}
            >
              <h4>{scenario.name}</h4>
              <small>{new Date(scenario.go_live_date).toLocaleDateString()}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="scenarios-main">
        {selectedScenario ? (
          <>
            <div className="scenario-toolbar">
              <div className="toolbar-main">
                <div className="title-section">
                  <h1>{selectedScenario.name}</h1>
                  <p className="description">{selectedScenario.description || 'No description'}</p>
                </div>
                
                <div className="scenario-meta-strip">
                  <div className="meta-item">
                    <span className="meta-label">Base</span>
                    <span className="meta-value">{new Date(selectedScenario.base_date).toLocaleDateString()}</span>
                  </div>
                  <div className="meta-divider" />
                  <div className="meta-item">
                    <span className="meta-label">Go Live</span>
                    <span className="meta-value">{new Date(selectedScenario.go_live_date).toLocaleDateString()}</span>
                  </div>
                  <div className="meta-divider" />
                  <div className="meta-item">
                    <span className="meta-label">Version</span>
                    <span className="meta-value">v{selectedScenario.version}</span>
                  </div>
                  <div className="meta-divider" />
                  <div className="meta-item">
                    <span className="meta-label">Author</span>
                    <span className="meta-value highlight">{selectedScenario.created_by_username || 'Admin'}</span>
                  </div>
                </div>
              </div>

              <div className="toolbar-actions">
                <button className="btn-secondary btn-sm" onClick={() => {
                  setEditing(selectedScenario);
                  setFormData({
                    name: selectedScenario.name,
                    description: selectedScenario.description || '',
                    base_date: selectedScenario.base_date,
                    go_live_date: selectedScenario.go_live_date
                  });
                  setShowModal(true);
                }}>
                  Edit
                </button>
                <button className="btn-danger btn-sm" onClick={() => handleDelete(selectedScenario.id)}>
                  Delete
                </button>
                <button 
                  className={isStale ? "btn-primary pulsing btn-sm" : "btn-primary btn-sm"} 
                  onClick={handleCalculate}
                >
                  {isStale ? 'Refresh' : 'Calculate'}
                </button>
              </div>
            </div>

            <div className="scenario-tabs">
              <button
                className={activeTab === 'overview' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                className={activeTab === 'fleet' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('fleet')}
              >
                Fleet
              </button>
              <button
                className={activeTab === 'schedules' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('schedules')}
              >
                Schedules
              </button>
              <button
                className={activeTab === 'holidays' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('holidays')}
              >
                Holidays
              </button>
              <button
                className={activeTab === 'pricing' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('pricing')}
              >
                Pricing
              </button>
              <button
                className={activeTab === 'parameters' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('parameters')}
              >
                Parameters
              </button>
              <button
                className={activeTab === 'airport-fees' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('airport-fees')}
              >
                Airport Fees
              </button>
              <button
                className={activeTab === 'crew' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('crew')}
              >
                Crew
              </button>
              <button
                className={activeTab === 'maintenance' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('maintenance')}
              >
                🔧 Maintenance
              </button>
            </div>

            <div className="tab-panel">
              {activeTab === 'overview' && (
                <div className="overview-panel">
                  {/* Quick Actions removed as per user request */}

                  <div className="chart-section" style={{ marginTop: '32px' }}>
                    <DailyPnLChart 
                      data={dailyData}
                      summary={summary}
                      loading={loadingChart}
                      onDateSelect={(date) => setSelectedDate(date)}
                    />
                    
                    <CrewUtilizationChart 
                      data={dailyData}
                      loading={loadingChart}
                    />

                    <AircraftUtilizationChart
                      data={dailyData}
                      loading={loadingChart}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'holidays' && (
                <HolidaysManagement scenarioId={selectedScenario.id} />
              )}

              {activeTab === 'fleet' && (
                <FleetManagement scenarioId={selectedScenario.id} />
              )}

              {activeTab === 'schedules' && (
                <ScheduleBuilder 
                  scenarioId={selectedScenario.id} 
                  onStaleChange={setIsStale}
                />
              )}

              {activeTab === 'pricing' && (
                <PricingManagement scenarioId={selectedScenario.id} />
              )}

              {activeTab === 'parameters' && (
                <ParametersManagement scenarioId={selectedScenario.id} />
              )}

              {activeTab === 'airport-fees' && (
                <AirportFeesManagement scenarioId={selectedScenario.id} />
              )}

              {activeTab === 'crew' && (
                <CrewManagement scenarioId={selectedScenario.id} />
              )}

              {activeTab === 'maintenance' && (
                <ScenarioMaintenancePanel scenarioId={selectedScenario.id} />
              )}
            </div>
          </>
        ) : (
          <div className="empty-workspace">
            <h2>No Scenario Selected</h2>
            <p>Create or select a scenario to get started</p>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              Create New Scenario
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editing ? 'Edit Scenario' : 'New Scenario'}</h2>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Base Date *</label>
                  <input
                    type="date"
                    value={formData.base_date}
                    onChange={e => setFormData({ ...formData, base_date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Go Live Date *</label>
                  <input
                    type="date"
                    value={formData.go_live_date}
                    onChange={e => setFormData({ ...formData, go_live_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedDate && (
        <DayAnalysisDrawer 
          scenarioId={selectedScenario.id}
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

export default ScenariosEnhanced;
