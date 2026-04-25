-- Freighter Profitability Planner Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'analyst')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id UUID REFERENCES users(id),
    scenario_id UUID,
    table_name VARCHAR(100),
    record_id UUID,
    action VARCHAR(20) CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    old_value JSONB,
    new_value JSONB
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_scenario ON audit_log(scenario_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- Aircraft Types (Master Data)
CREATE TABLE aircraft_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    mtow_tons DECIMAL(10,2) NOT NULL,
    speed_knots INTEGER NOT NULL,
    fuel_burn_liter_per_hour DECIMAL(10,2) NOT NULL,
    max_payload_kg DECIMAL(10,2) NOT NULL,
    range_km DECIMAL(10,2) NOT NULL,
    year_of_manufacture INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Airports (Master Data)
CREATE TABLE airports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    country VARCHAR(100) NOT NULL,
    region VARCHAR(20) CHECK (region IN ('DOM', 'INT')),
    latitude DECIMAL(10,6),
    longitude DECIMAL(10,6),
    opening_hour TIME,
    closing_hour TIME,
    has_hll BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Airport Fees
CREATE TABLE airport_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    airport_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    aircraft_type_id UUID REFERENCES aircraft_types(id) ON DELETE CASCADE,
    landing_fee_usd DECIMAL(10,2) NOT NULL,
    parking_fee_usd DECIMAL(10,2) NOT NULL,
    navigation_fee_usd DECIMAL(10,2) NOT NULL,
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, airport_id, aircraft_type_id, effective_date)
);

-- Master Airport Fees (Default values)
CREATE TABLE master_airport_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    airport_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    aircraft_type_id UUID REFERENCES aircraft_types(id) ON DELETE CASCADE,
    landing_fee_usd DECIMAL(10,2) NOT NULL,
    parking_fee_usd DECIMAL(10,2) NOT NULL,
    navigation_fee_usd DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(airport_id, aircraft_type_id)
);

CREATE INDEX idx_airport_fees_airport ON airport_fees(airport_id);
CREATE INDEX idx_master_airport_fees_airport ON master_airport_fees(airport_id);


-- Maintenance Event Types
CREATE TABLE maintenance_event_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aircraft_type_id UUID REFERENCES aircraft_types(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    interval_months INTEGER,
    interval_block_hours INTEGER,
    interval_flight_cycles INTEGER,
    interval_apu_hours INTEGER,
    event_cost_usd DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scenarios
CREATE TABLE scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_date DATE NOT NULL,
    go_live_date DATE NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_scenarios_created_by ON scenarios(created_by);

-- Scenario Parameters (config values per scenario)
CREATE TABLE scenario_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    
    -- Market
    traffic_growth_rate_annual DECIMAL(5,4) DEFAULT 0.25,
    fare_growth_rate_annual DECIMAL(5,4) DEFAULT 0.07,
    
    -- Seasonality
    seasonality_constant DECIMAL(5,4),
    seasonality_slope DECIMAL(5,4),
    
    -- Ground Operations
    ground_time_hll_hours DECIMAL(4,2) DEFAULT 0.75,
    ground_time_manual_hours DECIMAL(4,2) DEFAULT 1.5,
    cargo_density_kg_per_m3 DECIMAL(6,2) DEFAULT 167,
    ground_handling_fee_usd DECIMAL(10,2) DEFAULT 1300,
    
    -- Flight Operations
    avg_taxi_time_hours DECIMAL(4,2) DEFAULT 0.25,
    non_linear_flight_path_effect_pct DECIMAL(5,4) DEFAULT 0.10,
    apu_op_hour_ratio DECIMAL(4,3) DEFAULT 0.1,
    
    -- Finance
    cost_of_capital DECIMAL(5,4) DEFAULT 0.04,
    usd_to_idr_rate DECIMAL(10,2) DEFAULT 16255,
    
    -- Costs
    eis_cost_usd DECIMAL(10,2) DEFAULT 100000,
    redelivery_cost_usd DECIMAL(10,2) DEFAULT 300000,
    insurance_cost_per_ac_month_usd DECIMAL(10,2) DEFAULT 10000,
    overhead_cost_month_usd DECIMAL(10,2) DEFAULT 100000,
    
    -- Crew
    pilot_annual_salary_usd DECIMAL(12,2),
    fo_annual_salary_usd DECIMAL(12,2),
    pilot_count_per_ac INTEGER DEFAULT 4,
    fo_count_per_ac INTEGER DEFAULT 2,
    pilot_fata_per_hour_usd DECIMAL(8,2) DEFAULT 86,
    pilot_afb_per_hour_usd DECIMAL(8,2) DEFAULT 6,
    pilot_lot_per_hour_usd DECIMAL(8,2) DEFAULT 2,
    fo_fata_per_hour_usd DECIMAL(8,2) DEFAULT 71,
    fo_afb_per_hour_usd DECIMAL(8,2) DEFAULT 6,
    fo_lot_per_hour_usd DECIMAL(8,2) DEFAULT 2,
    
    -- Fuel
    fuel_price_idr_per_liter DECIMAL(10,2) DEFAULT 10500,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id)
);

-- Master Scenario Parameters (Global Defaults)
CREATE TABLE master_scenario_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    traffic_growth_rate_annual DECIMAL(5,4) DEFAULT 0.25,
    fare_growth_rate_annual DECIMAL(5,4) DEFAULT 0.07,
    seasonality_constant DECIMAL(5,4) DEFAULT 1.0,
    seasonality_slope DECIMAL(5,4) DEFAULT 0.0,
    ground_time_hll_hours DECIMAL(4,2) DEFAULT 0.75,
    ground_time_manual_hours DECIMAL(4,2) DEFAULT 1.5,
    cargo_density_kg_per_m3 DECIMAL(6,2) DEFAULT 167,
    ground_handling_fee_usd DECIMAL(10,2) DEFAULT 1300,
    avg_taxi_time_hours DECIMAL(4,2) DEFAULT 0.25,
    non_linear_flight_path_effect_pct DECIMAL(5,4) DEFAULT 0.10,
    apu_op_hour_ratio DECIMAL(4,3) DEFAULT 0.1,
    cost_of_capital DECIMAL(5,4) DEFAULT 0.04,
    usd_to_idr_rate DECIMAL(10,2) DEFAULT 16255,
    eis_cost_usd DECIMAL(10,2) DEFAULT 100000,
    redelivery_cost_usd DECIMAL(10,2) DEFAULT 300000,
    insurance_cost_per_ac_month_usd DECIMAL(10,2) DEFAULT 10000,
    overhead_cost_month_usd DECIMAL(10,2) DEFAULT 100000,
    pilot_annual_salary_usd DECIMAL(12,2),
    fo_annual_salary_usd DECIMAL(12,2),
    pilot_count_per_ac INTEGER DEFAULT 4,
    fo_count_per_ac INTEGER DEFAULT 2,
    pilot_fata_per_hour_usd DECIMAL(8,2) DEFAULT 86,
    pilot_afb_per_hour_usd DECIMAL(8,2) DEFAULT 6,
    pilot_lot_per_hour_usd DECIMAL(8,2) DEFAULT 2,
    fo_fata_per_hour_usd DECIMAL(8,2) DEFAULT 71,
    fo_afb_per_hour_usd DECIMAL(8,2) DEFAULT 6,
    fo_lot_per_hour_usd DECIMAL(8,2) DEFAULT 2,
    fuel_price_idr_per_liter DECIMAL(10,2) DEFAULT 10500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Master Parameters
INSERT INTO master_scenario_parameters (traffic_growth_rate_annual) VALUES (0.25);

-- Fleet Plans
CREATE TABLE fleet_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    aircraft_number INTEGER NOT NULL,
    tail_number VARCHAR(20),
    aircraft_type_id UUID REFERENCES aircraft_types(id),
    eis_date DATE NOT NULL,
    redelivery_date DATE NOT NULL,
    lease_cost_monthly_usd DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, aircraft_number)
);

CREATE INDEX idx_fleet_plans_scenario ON fleet_plans(scenario_id);

-- Crew Members
CREATE TABLE crew_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    employee_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('pilot', 'first_officer')),
    monthly_salary_usd DECIMAL(10,2) NOT NULL,
    max_duty_hours_per_day DECIMAL(4,2) DEFAULT 10,
    min_rest_hours DECIMAL(4,2) DEFAULT 12,
    max_duty_hours_per_month DECIMAL(6,2) DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crew_members_scenario ON crew_members(scenario_id);

-- Maintenance Log
CREATE TABLE maintenance_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fleet_plan_id UUID REFERENCES fleet_plans(id) ON DELETE CASCADE,
    event_type_id UUID REFERENCES maintenance_event_types(id),
    due_date DATE,
    due_block_hours INTEGER,
    due_flight_cycles INTEGER,
    due_apu_hours INTEGER,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'overdue')),
    completed_date DATE,
    actual_cost_usd DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_maintenance_log_fleet ON maintenance_log(fleet_plan_id);

-- Pricing
CREATE TABLE pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    origin_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    destination_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    segment VARCHAR(100),
    fare_usd DECIMAL(10,2) NOT NULL,
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, origin_id, destination_id, segment)
);

-- Master Pricing (Global Default Fares)
CREATE TABLE master_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    destination_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    segment VARCHAR(100),
    fare_usd DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(origin_id, destination_id, segment)
);

CREATE INDEX idx_pricing_scenario ON pricing(scenario_id);

-- Schedules (Weekly Schedule)
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    fleet_plan_id UUID REFERENCES fleet_plans(id) ON DELETE CASCADE,
    origin_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    destination_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    full_route_string VARCHAR(255),
    route_category VARCHAR(20) DEFAULT 'jkt_one_leg',
    priority INTEGER,
    departure_time TIME,
    monday BOOLEAN DEFAULT false,
    tuesday BOOLEAN DEFAULT false,
    wednesday BOOLEAN DEFAULT false,
    thursday BOOLEAN DEFAULT false,
    friday BOOLEAN DEFAULT false,
    saturday BOOLEAN DEFAULT false,
    sunday BOOLEAN DEFAULT false,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schedules_scenario ON schedules(scenario_id);
CREATE INDEX idx_schedules_fleet ON schedules(fleet_plan_id);

-- Holidays
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    holiday_date DATE NOT NULL,
    country VARCHAR(100),
    impact_start_date DATE NOT NULL,
    impact_end_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_holidays_scenario ON holidays(scenario_id);
CREATE INDEX idx_holidays_date ON holidays(holiday_date);

-- Pre-calculated Results: Daily Traffic
CREATE TABLE daily_traffic (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    fleet_plan_id UUID REFERENCES fleet_plans(id),
    origin_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    destination_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    segment VARCHAR(100),
    flights INTEGER DEFAULT 0,
    block_hours DECIMAL(10,2) DEFAULT 0,
    flight_cycles INTEGER DEFAULT 0,
    distance_km DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, calculation_date, fleet_plan_id, origin_id, destination_id, segment)
);

CREATE INDEX idx_daily_traffic_scenario ON daily_traffic(scenario_id);
CREATE INDEX idx_daily_traffic_date ON daily_traffic(calculation_date);

-- Pre-calculated Results: Daily Revenue
CREATE TABLE daily_revenue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    origin_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    destination_id UUID REFERENCES airports(id) ON DELETE CASCADE,
    segment VARCHAR(100),
    revenue_usd DECIMAL(12,2) DEFAULT 0,
    total_uplift_kg DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, calculation_date, origin_id, destination_id, segment)
);

CREATE INDEX idx_daily_revenue_scenario ON daily_revenue(scenario_id);
CREATE INDEX idx_daily_revenue_date ON daily_revenue(calculation_date);

-- Pre-calculated Results: Monthly P&L
CREATE TABLE monthly_pnl (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
    month_date DATE NOT NULL,
    
    -- Operational Metrics
    num_aircraft INTEGER DEFAULT 0,
    block_hours DECIMAL(10,2) DEFAULT 0,
    flight_cycles INTEGER DEFAULT 0,
    
    -- Revenue
    total_revenue_usd DECIMAL(15,2) DEFAULT 0,
    total_uplift_kg DECIMAL(15,2) DEFAULT 0,
    
    -- Costs
    lease_cost_usd DECIMAL(12,2) DEFAULT 0,
    eis_cost_usd DECIMAL(12,2) DEFAULT 0,
    redelivery_cost_usd DECIMAL(12,2) DEFAULT 0,
    insurance_cost_usd DECIMAL(12,2) DEFAULT 0,
    maintenance_cost_usd DECIMAL(12,2) DEFAULT 0,
    ground_handling_cost_usd DECIMAL(12,2) DEFAULT 0,
    fuel_cost_usd DECIMAL(12,2) DEFAULT 0,
    landing_fee_usd DECIMAL(12,2) DEFAULT 0,
    parking_fee_usd DECIMAL(12,2) DEFAULT 0,
    navigation_fee_usd DECIMAL(12,2) DEFAULT 0,
    route_charge_usd DECIMAL(12,2) DEFAULT 0,
    crew_expense_usd DECIMAL(12,2) DEFAULT 0,
    crew_flight_allowance_usd DECIMAL(12,2) DEFAULT 0,
    crew_hotac_usd DECIMAL(12,2) DEFAULT 0,
    overhead_cost_usd DECIMAL(12,2) DEFAULT 0,
    
    -- P&L
    total_cost_usd DECIMAL(15,2) DEFAULT 0,
    profit_loss_usd DECIMAL(15,2) DEFAULT 0,
    cumulative_profit_loss_usd DECIMAL(15,2) DEFAULT 0,
    profit_margin DECIMAL(6,4) DEFAULT 0,
    cost_per_bh_usd DECIMAL(10,2) DEFAULT 0,
    break_even_load_factor DECIMAL(6,4) DEFAULT 0,
    break_even_block_hours DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, month_date)
);

CREATE INDEX idx_monthly_pnl_scenario ON monthly_pnl(scenario_id);
CREATE INDEX idx_monthly_pnl_date ON monthly_pnl(month_date);

-- Locks for concurrent editing
CREATE TABLE locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    user_id UUID REFERENCES users(id),
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(table_name, record_id)
);

CREATE INDEX idx_locks_user ON locks(user_id);
CREATE INDEX idx_locks_expires ON locks(expires_at);

-- Functions and Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_aircraft_types_updated_at BEFORE UPDATE ON aircraft_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_airports_updated_at BEFORE UPDATE ON airports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenarios_updated_at BEFORE UPDATE ON scenarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenario_parameters_updated_at BEFORE UPDATE ON scenario_parameters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fleet_plans_updated_at BEFORE UPDATE ON fleet_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crew_members_updated_at BEFORE UPDATE ON crew_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_log_updated_at BEFORE UPDATE ON maintenance_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_updated_at BEFORE UPDATE ON pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Initial data seeding (optional)
-- Default admin user (password: admin123 - CHANGE IN PRODUCTION)
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'admin@freighterplanner.com', '$2b$10$rKvVJxXxWxGxWxGxWxGxWOHy5C8kHYKOHy5C8kHYKOHy5C8kHYKOH.', 'admin');
