// config.js - Centralized configuration for calculations

module.exports = {
  // Market Parameters
  DEFAULT_MARKET_GO_LIVE_DATE: '2026-03-01',
  DEFAULT_TRAFFIC_GROWTH_RATE_ANNUAL: 0.25,
  DEFAULT_FARE_GROWTH_RATE_ANNUAL: 0.07,
  DEFAULT_INITIAL_UPLIFT_JKT_TWO_LEGS: 5500,
  DEFAULT_INITIAL_UPLIFT_JKT_ONE_LEG: 11000,
  DEFAULT_INITIAL_UPLIFT_BO_DOM: 500,
  DEFAULT_INITIAL_UPLIFT_BO_INT: 10000,

  // Seasonality
  DEFAULT_SEASONALITY_CONSTANT: 0.85,
  DEFAULT_SEASONALITY_SLOPE: 0.0125,

  // Ground Operations
  DEFAULT_GROUND_TIME_HLL_HOURS: 0.75,
  DEFAULT_GROUND_TIME_MANUAL_HOURS: 1.5,
  DEFAULT_CARGO_DENSITY_KG_PER_M3: 167,
  DEFAULT_GROUND_HANDLING_FEE_USD: 1300,

  // Flight Operations
  DEFAULT_AVG_TAXI_TIME_HOURS: 0.25,
  DEFAULT_NON_LINEAR_FLIGHT_PATH_EFFECT_PCT: 0.10,
  DEFAULT_APU_OP_HOUR_RATIO: 0.1,

  // Finance
  DEFAULT_COST_OF_CAPITAL: 0.04,
  DEFAULT_USD_TO_IDR_RATE: 16255,

  // Costs
  DEFAULT_EIS_COST_USD: 100000,
  DEFAULT_REDELIVERY_COST_USD: 300000,
  DEFAULT_INSURANCE_COST_PER_AC_MONTH_USD: 10000,
  DEFAULT_OVERHEAD_COST_MONTH_USD: 100000,

  // Crew
  DEFAULT_PILOT_ANNUAL_SALARY_USD: 46154, // 750M IDR / 16255
  DEFAULT_FO_ANNUAL_SALARY_USD: 23077, // 375M IDR / 16255
  DEFAULT_PILOT_COUNT_PER_AC: 4,
  DEFAULT_FO_COUNT_PER_AC: 2,
  DEFAULT_PILOT_FATA_PER_HOUR_USD: 86,
  DEFAULT_PILOT_AFB_PER_HOUR_USD: 6,
  DEFAULT_PILOT_LOT_PER_HOUR_USD: 2,
  DEFAULT_FO_FATA_PER_HOUR_USD: 71,
  DEFAULT_FO_AFB_PER_HOUR_USD: 6,
  DEFAULT_FO_LOT_PER_HOUR_USD: 2,

  // Fuel
  DEFAULT_FUEL_PRICE_IDR_PER_LITER: 10500,

  // Aircraft Type Defaults
  DEFAULT_AIRCRAFT_TYPES: {
    'B737-800F': {
      mtow_tons: 79,
      speed_knots: 420,
      fuel_burn_liter_per_hour: 2815.75,
      max_payload_kg: 23000,
      range_km: 3300,
      lease_cost_monthly_usd: 175000
    },
    'B737-400F': {
      mtow_tons: 68,
      speed_knots: 405,
      fuel_burn_liter_per_hour: 2975,
      max_payload_kg: 18000,
      range_km: 2900,
      lease_cost_monthly_usd: 59000
    },
    'B737-300F': {
      mtow_tons: 62,
      speed_knots: 400,
      fuel_burn_liter_per_hour: 3081.25,
      max_payload_kg: 16000,
      range_km: 2700,
      lease_cost_monthly_usd: 52000
    },
    'A321F': {
      mtow_tons: 93,
      speed_knots: 425,
      fuel_burn_liter_per_hour: 3134.5,
      max_payload_kg: 28000,
      range_km: 4000,
      lease_cost_monthly_usd: 213000
    },
    'A320F': {
      mtow_tons: 77,
      speed_knots: 420,
      fuel_burn_liter_per_hour: 2922,
      max_payload_kg: 21000,
      range_km: 3700,
      lease_cost_monthly_usd: 170400
    }
  },

  // Monte Carlo Defaults
  DEFAULT_MC_ITERATIONS: 1000,

  // Calculation Settings
  DAYS_IN_YEAR: 365,
  MONTHS_IN_YEAR: 12,
  HOURS_IN_DAY: 24,

  // Nautical miles to kilometers
  NM_TO_KM: 1.852
};
