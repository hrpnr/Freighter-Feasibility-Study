# OurFreighter (Freighter Profitability Planner) ✈️

> [!WARNING]
> **Disclaimer for Simulation Data**  
> All numbers, pricing configurations, operational constraints, and financial parameters contained within this application and database are entirely **imaginative and fictional**. They do not refer to any real-world aviation companies, situations, or proprietary configurations. This data should be used strictly for the purpose of demonstrating the simulation engine's technical capabilities.

Enterprise desktop application for airline CFOs and financial analysts to simulate and optimize freighter aircraft profitability over a 5-year horizon. Designed for high-performance aviation analytics with a total focus on **Precision, Scalability, and Premium User Experience.**

---

## 🏗️ Technical Architecture & Principles

### 1. The Tech Stack
- **Backend:** Node.js + Express (Raw SQL via `pg` pool, no ORM for maximum throughput).
- **Frontend:** React 18 + Electron 28 (Premium desktop shell, dark-mode native).
- **Database:** PostgreSQL 14+ (Schema-driven integrity with batch insertions).
- **Real-time:** WebSocket + Yjs (Conflict-free multi-user collaboration).
- **Visualization:** Recharts (High-density daily/monthly financial and operational charting).

### 2. Core Architectural Pillars (MANDATORY)
- **Single Source of Truth (SSOT):** Neither the Frontend nor the Backend Controllers may contain raw SQL or direct API configuration. All logic must be abstracted into dedicated Service layers.
- **Service-Oriented Architecture:**
  - **Backend Services:** Located in `backend/src/services/`. Every database operation must be encapsulated here. Controllers are strictly transport layers.
  - **Frontend API Service:** Located in `frontend/src/services/api.js`. No `axios` calls or `localStorage` access are permitted directly in React components.
- **Matrix over Row-by-Row:** When defining mathematical formulas, always use matrix-based calculations instead of row-by-row processing for 1,825-day scenarios.
- **ORM-less High Performance:** Avoid ORMs. All database interactions must use raw SQL within the Service layer for performance and auditability in complex aviation queries.
- **Batch Processing:** Always use batch-based DB insertions/updates when handling daily simulation results (`daily_traffic`, `daily_revenue`).
- **Standardized Constants:** All operational/financial constants must be defined in the database or `config.js`.

---

## 📅 The Simulation Engine Workflow

The core intelligence resides in `backend/src/calculations/scenarioCalculator.js`. Any modification must respect the **5-year (1,825-day) Stateful Lifecycle**. The engine operates under a strict "Gatekeeper" philosophy: if an operational constraint is violated, the simulation halts and prevents financial hallucination.

### 1. The Operational Gatekeepers
Before a single dollar is calculated, the schedule must be proven physically and legally possible:
- **Crew Compliance & Feasibility Check:**
  - Validates if the selected schedule can be flown by the active crew roster.
  - Models capacity based on **Crew-Set-Hours**. A pilot and First Officer represent a single, inseparable operational unit (a "set").
  - Evaluates daily peak demands (ensuring max duty limits are respected, factoring in crew relays if 2+ sets are available) against total roster size.
  - Halts compilation and warns the user directly if duty demands exceed available crew capabilities.

### 2. The Daily Loop
Iterates day-by-day (Go-Live to +5 Years):
- **Availability Check:** Determine if an aircraft is grounded (Maintenance, Redelivery, or pre-EIS).
- **Commercial Ops:** Calculate daily block hours, flight cycles, and crew duty demands based on the active schedule.
- **Utilization Tracking:** Increment stateful FH, FC, and APU counters.
- **Maintenance Triggers:** Automatically trigger grounding events if utilization hits a threshold (e.g., Block Hours, Months, or Cycles).
- **Revenue Engine:** Apply seasonality (Monthly Index) and growth rates (Annual Yield/Traffic Growth) to daily fares.

### 3. Financial Aggregation & Reporting
- **Actual Cost Modeling:** Crew payroll is driven directly by individual member profiles, completely replacing generic headcount multipliers.
- **Maintenance Reserve Principle:** Costs are accrued monthly based on utilization (FH/FC), ensuring a smooth financial forecast rather than event-based spikes.
- **Unified Analytics Stream:** The `dailyPnLService` binds financial results directly to operational metrics, delivering a single holistic payload to the frontend.
- **Investment Metrics:** Compute Scenario NPV (default 4% WACC), Annualized IRR, and Payback horizons based on the fully audited cash flow aggregates.

---

## 🛫 Operational Management Modules

### Flight Scheduling & Rotation
- **Rotation-Based Logic:** Flight legs are not managed in isolation. They are linked into logical **Rotations** (loops) via a shared `rotation_group_id`.
- **Smart Sequencing:** Automatically inherent logic ensures sequential legs (Leg 1 → Leg 2 → Leg 3) protect loop integrity.
- **Bulk Management:** Deletions and updates occur at the **Rotation Level**.

### Live Dashboard Visualization
Operational constraints have been moved out of the spreadsheet and onto the dashboard:
- **Crew Utilization Chart:** Visualizes daily "Crew-Set-Hour" demand against the legal team capacity and peak daily ceiling, highlighting compliance breaches in red.
- **Aircraft Fleet Utilization:** Monitors the aggregate Block Hours flown relative to the fleet’s operational ceiling limit. Both charts natively share the P&L pipeline data state. 

---

## 🎲 Monte Carlo Risk Cockpit

The Monte Carlo module converts the deterministic base scenario into a **probabilistic risk envelope**, surfacing the full distribution of financial outcomes under uncertainty.

### Architecture
- **Entry Point:** `frontend/src/pages/MonteCarloSimulation.js` + `MonteCarloSimulation.css`
- **Backend:** `monteCarloService.js` (service layer) + `monteCarloController.js` (transport only)
- **API Calls:** All data flows through `frontend/src/services/api.js` → `monteCarloService.simulate()`
- **No separate DB tables required** — simulation runs in-memory against base P&L from `monthly_pnl`

### Advanced Simulation Logic
- **Time-Varying Uncertainty (GBM):** Market prices (Fuel) and demand (Traffic) evolve using **Geometric Brownian Motion**. Variance widens over the 5-year horizon ($S_t = S_0 \exp((\mu - \sigma^2/2)t + \sigma W_t)$), modeling the reality that year 5 is significantly more uncertain than year 1.
- **Correlated Shocks:** Implemented $\rho = -0.35$ correlation (configurable in Settings) between Fuel and Traffic. A sampled fuel spike automatically triggers a demand compression to model real-world economic elasticity.
- **Physical Capacity Capping:** Cargo revenue is capped by the aircraft's `max_payload_kg` (e.g., **23,750kg for B738F**). Simulation iterations that sample high demand are restricted by the legal physical ceiling of the airframe.

### Supported Stochastic Variables
| Variable | Distribution | Business Rationale |
|---|---|---|
| `avg_load_factor_pct` | Triangular | **Uplift Confidence Model**: % of planned uplift (capped by aircraft capacity) |
| `fuel_price_idr_per_liter` | Triangular | Energy price volatility; asymmetric upside risk |
| `fare_growth_rate_annual` | Normal | Market fare trends; symmetric around analyst consensus |
| `traffic_growth_rate_annual` | Triangular | Demand growth; bounded by infrastructure capacity |
| `overhead_cost_month_usd` | Uniform | Admin/ops cost uncertainty; range-bounded |

### Supported Distributions
- **Normal** (Box-Muller transform) — symmetric, mean-reverting variables
- **Triangular** (min/mode/max) — expert-judgment bounded estimates
- **Uniform** — range-bounded unknowns with equal probability
- **Log-Normal** — positively skewed variables that cannot go negative

### Risk Metrics Produced
- **P(Loss)** — Probability that 5-year NPV turns negative; primary CEO read
- **VaR @ X%** — NPV floor at the chosen confidence level
- **CVaR (Expected Shortfall)** — Average NPV across the worst tail; used for board stress tests
- **Percentile Band** — P5 / P25 / Median / P75 / P95 NPV for investor range communication

### UI Design
- **Split-panel Risk Cockpit:** Variable configurator (left) + NPV distribution histogram + KPI cards (right)
- **Color-coded histogram:** Red bars = loss scenarios (NPV < 0), indigo bars = profit scenarios
- **Break-even reference line** at NPV = 0 across the distribution chart
- **4 headline KPIs:** P(Loss), Mean NPV, CVaR, P95 — consistent with institutional risk reporting

### NaN & Edge Case Handling
- Revenue multipliers floor-capped at `Math.max(0.1, multiplier)` — prevents revenue going negative
- `isNaN` guards applied after every arithmetic step in `recalculateWithParams`
- Histogram computed in frontend from raw `results.results[]` — no extra API round-trip

---



To ensure consistency, parameters must be resolved in this order:
1. **Scenario Parameters:** User overrides specific to a "what-if" scenario.
2. **Master Parameters:** Default operational constants stored in the database.
3. **Config File (`config.js`):** Fail-safe hardcoded defaults for development.

---

## 🎨 Design & Aesthetic DNA (Dark Mode Only)

OurFreighter is a **Premium Enterprise Tool**. All UI modifications must adhere to:
- **Dark Theme:** Primary background `#0c0e14`, Surface `#161a23`, Surface Light `#212836`. Always use the CSS variables in `index.css`.
- **Typography:** `Outfit` (Google Font) for all headings/body.
- **Glassmorphism:** Use `backdrop-filter: blur(12px)` and subtle borders for modals and overlays.
- **Dynamic UX:** Hover states must include subtle micro-animations (transitions, slight lifts).
- **Status Indicators:** Use a semantic palette: 
  - Revenue/Profit: `Emerald-500`
  - Cost/Loss: `Rose-500`
  - Warning/Maintenance: `Amber-500`
  - Insight/Information: `Cyan-500` or `Indigo-500`

---

## ⚙️ Master Parameters & Simulation Baselines

Master Parameters serve as the foundational **Single Source of Truth (SSOT)** for the entire OurFreighter ecosystem. They define the global operational, economic, and physical realities of the aviation simulation environment.

### The Override Nature (Scenario vs. Master)
Every scenario computation works on an **Override Fallback Hierarchy**:
1. When a scenario is calculated, the engine first looks for **Scenario-Specific Overrides**.
2. If no override exists, the engine permanently falls back to the **Master Parameters**.

This architecture allows analysts to create hundreds of "what-if" scenarios (e.g., testing a specific fuel spike) without having to re-enter the standard constants each time. Changing a Master Parameter automatically updates the baseline calculation for *all* scenarios moving forward.

### Key Default Parameters & Their Assumptions (`config.js`)
The application is pre-seeded with analyst-grade defaults out of the box. Every parameter below carries a specific architectural assumption about how the real world operates:

#### Financial & Market Baselines
- **USD to IDR Exchange Rate:** `16,255` — Assumes a static currency peg for the 5-year deterministic run. (To model FX volatility, use the Monte Carlo module).
- **Cost of Capital (WACC):** `4.00%` — The mathematical discount rate applied to all future cash flows to calculate the 5-Year NPV. Assumes standard aviation debt-to-equity financing costs.
- **Fuel Price:** `9,500 IDR / Liter` — The baseline energy cost. Assumes a zero-hedging strategy. 
- **Traffic Growth Rate:** `25.0% / Year` — Compounding annual volume growth. Assumes the e-commerce and logistics sector will rapidly expand infrastructure to support demand.
- **Fare Growth Rate:** `7.0% / Year` — Assumes inflation and advanced yield management will steadily increase the revenue generated per kg over the 5-year horizon.

#### Crew Economics & Fleet Ratios
- **Captain Salary:** `$46,154 USD / Year` & **First Officer Salary:** `$23,077 USD / Year` — Assumes competitive Southeast Asian market rates. This replaces traditional spreadsheet "headcount multipliers" with actual, modeled individual payrolls.
- **Crew Block Hour Allowances:** Flat rate triggers for FATA ($86/$71 per hour), AFB ($6/hr), and LOT ($2/hr) — Assumes union-standard variable pay structures that scale dynamically with the intensity of the scheduled block hours.

#### Operational Physics
- **Ground Time Turnarounds:** `0.75 Hours` (HLL-assisted) vs `1.50 Hours` (Manual) — Assumes High-Level Loaders (HLL) halve the turnaround time, directly dictating how tightly you can sequence flight legs into a 24-hour rotation loop.
- **Average Taxi Flight Bias:** `0.25 Hours` — Assumes 15 minutes of ground fuel burn and time per sector, bridging the mathematical gap between pure "Airborne Time" and gate-to-gate "Block Time".
- **Non-Linear Flight Path:** `10%` penalty — Assumes aircraft do not fly in perfect straight lines. Adds 10% to the Great Circle mathematical distance to account for ATC vectoring, holding patterns, and weather avoidance.
- **Ground Handling Baseline:** fixed `$1,300 USD` — Assumes a standardized flat operational fee per airport cycle, regardless of aircraft size or total uplift volume.

## 📖 Step-by-Step User Workflow (Quick Start Guide)

If you are a new analyst logging in for the first time, follow this strict path to generate your first comprehensive financial and operational forecast:

### Step 1: Review Master Baselines
1. Navigate to **Settings** in the left sidebar.
2. Review the **Parameters** tab to ensure the global baseline variables (Fuel price, FX Rate, Pilot salaries) reflect your current reality.
3. Review the **Pricing** tab to ensure you have a baseline network of city-pairs and fares. (Use the **Import Data** tool if you need to bulk upload your own Excel file).

### Step 2: Create a Scenario
1. Navigate to **Scenarios** from the main menu. 
2. Click **Create New Scenario** (e.g., "Q4 Fleet Expansion"). 
3. *Optional:* Use the **Parameters** tab within the Scenario to override the global Master Parameters (e.g., testing a fuel spike to 12,000 IDR/L while safely leaving the master baseline untouched).

### Step 3: Define the Fleet
1. Within your scenario, navigate to the **Fleet Plan** tab.
2. Add a new aircraft to your fleet (assigning an Aircraft Type, Tail Number, Monthly Lease Rate, and EIS date). Without an aircraft, you cannot build a schedule!

### Step 4: Build the Operation (Rotations)
1. Navigate to the **Schedule Builder** tab.
2. Click **Add New Rotation** to open the Rotation modal.
3. Assign the **Tail Number** you just created.
4. Visually link your flight legs together (e.g., origin `CGK` to destination `SIN`, then back to `CGK`) checking the physical block hours, distances, and required ground turnaround times. 
5. **Define Uplift Cargo:** Input the expected commercial **Uplift (kg)** for each individual leg. Keep in mind the physics engine is strict: it will automatically cap your uplifted cargo e if your inputted cargo demand exceeds the structural maximum payload limits of that specific aircraft type.
6. Save the rotation. The engine will instantly compile your deterministic schedule, payload capabilities, and crew duty demands.

### Step 5: Analyze Deterministic P&L
1. Navigate back to the **Overview** dashboard of your scenario.
2. The engine will automatically compile 1,825 days of your operations into a massive **Daily P&L Pipeline**.
3. View the charts to see your **NPV trajectory**, operational ceilings, and exact Crew Utilization metrics. Watch out for red bars—those mean your planned flight schedule violates legal crew limits!

### Step 6: Run Monte Carlo Risk Simulations
1. Navigate to the **Monte Carlo** module in the sidebar.
2. Select your validated scenario from the dropdown.
3. Tweak the distributions (e.g., set Fuel to a "Triangular" distribution with a high worst-case spike).
4. Run 1,000 simulation iterations. The engine will generate your probabilistic risk envelope, surfacing your Probability of Loss `P(Loss)`, Expected Shortfall `(CVaR)`, and Value-at-Risk `(VaR)`.

---

## 🚀 One-Click Windows Setup (For End Users)

The application is deeply engineered with a Postgres DB and Node.js backend, but we've packaged a smooth one-click setup script for Windows users.

### Prerequisites (Install These First)
- Download and install **[Node.js](https://nodejs.org)** (Use default settings).
- Download and install **[PostgreSQL](https://www.postgresql.org/download/windows/)**. 
  *(Make sure "Command Line Tools" is checked during installation. Remember the password you set!)*

### How to Run
1. Download this repository package and extract it to your local disk.
2. Double-click the **`Start-Freighter.bat`** file in the main folder.
3. The script will ask for your PostgreSQL password. Type it in and press Enter.
4. **That's it!** The script will automatically link your database, install dependencies, inject the master data schemas, and open the application in your default web browser.

> [!TIP]
> **Default Login Credentials:**
> - **Username:** `admin`
> - **Password:** `admin`

> [!NOTE]
> Leave the terminal windows open in the background while using the app. When you are finished, closing the terminals will shut down the local servers.