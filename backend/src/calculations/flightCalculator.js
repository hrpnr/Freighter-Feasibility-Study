const config = require('../config/config');

class FlightCalculator {
  /**
   * Calculate block hours for a flight segment
   * @param {number} distanceKm - Distance in kilometers
   * @param {number} speedKnots - Aircraft cruise speed in knots
   * @param {number} taxiTime - Taxi time in hours (default from config)
   * @param {number} nonLinearEffect - Non-linear flight path effect percentage
   * @returns {number} Block hours
   */
  static calculateBlockHours(
    distanceKm,
    speedKnots,
    taxiTime = config.DEFAULT_AVG_TAXI_TIME_HOURS,
    nonLinearEffect = config.DEFAULT_NON_LINEAR_FLIGHT_PATH_EFFECT_PCT
  ) {
    if (!distanceKm || isNaN(distanceKm) || !speedKnots || isNaN(speedKnots) || distanceKm <= 0 || speedKnots <= 0) {
      return 0;
    }

    const d = parseFloat(distanceKm);
    const s = parseFloat(speedKnots);
    const tTime = parseFloat(isNaN(taxiTime) ? config.DEFAULT_AVG_TAXI_TIME_HOURS : taxiTime);
    const nEffect = parseFloat(isNaN(nonLinearEffect) ? config.DEFAULT_NON_LINEAR_FLIGHT_PATH_EFFECT_PCT : nonLinearEffect);

    // Convert km to nautical miles
    const distanceNM = d / config.NM_TO_KM;

    // Calculate base flight time
    const baseFlightHours = distanceNM / s;

    // Apply non-linear flight path effect
    const adjustedFlightHours = baseFlightHours * (1 + nEffect);

    // Add taxi time
    const blockHours = adjustedFlightHours + tTime;

    return Math.round(blockHours * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate flight cycles (number of takeoffs/landings)
   * @param {number} numberOfFlights - Number of flights
   * @returns {number} Flight cycles
   */
  static calculateFlightCycles(numberOfFlights) {
    return numberOfFlights || 0;
  }

  /**
   * Calculate APU operating hours
   * @param {number} blockHours - Block hours
   * @param {number} apuRatio - APU op hour to airframe flight hour ratio
   * @returns {number} APU operating hours
   */
  static calculateAPUHours(
    blockHours,
    apuRatio = config.DEFAULT_APU_OP_HOUR_RATIO
  ) {
    if (!blockHours || isNaN(blockHours) || blockHours <= 0) {
      return 0;
    }
    const ratio = isNaN(apuRatio) ? config.DEFAULT_APU_OP_HOUR_RATIO : apuRatio;
    return Math.round(blockHours * ratio * 10) / 10;
  }

  /**
   * Calculate fuel consumption
   * @param {number} blockHours - Block hours
   * @param {number} fuelBurnRate - Fuel burn rate in liters per hour
   * @param {number} fuelPriceIDR - Fuel price in IDR per liter
   * @param {number} usdToIDR - Exchange rate USD to IDR
   * @returns {number} Fuel cost in USD
   */
  static calculateFuelCost(
    blockHours,
    fuelBurnRate,
    fuelPriceIDR = config.DEFAULT_FUEL_PRICE_IDR_PER_LITER,
    usdToIDR = config.DEFAULT_USD_TO_IDR_RATE
  ) {
    if (!blockHours || isNaN(blockHours) || blockHours <= 0 || !fuelBurnRate || isNaN(fuelBurnRate)) {
      return 0;
    }

    const priceIDR = isNaN(fuelPriceIDR) ? config.DEFAULT_FUEL_PRICE_IDR_PER_LITER : fuelPriceIDR;
    const rateUSD = isNaN(usdToIDR) ? config.DEFAULT_USD_TO_IDR_RATE : usdToIDR;

    const fuelLiters = blockHours * fuelBurnRate;
    const fuelCostIDR = fuelLiters * priceIDR;
    const fuelCostUSD = fuelCostIDR / rateUSD;

    return Math.round(fuelCostUSD * 100) / 100;
  }

  /**
   * Check if a date falls within a holiday impact period
   * @param {Date} date - Date to check
   * @param {Array} holidays - Array of holiday objects with impact_start_date and impact_end_date
   * @returns {boolean} True if date is during holiday period
   */
  static isHolidayPeriod(date, holidays) {
    if (!holidays || holidays.length === 0) {
      return false;
    }

    return holidays.some(holiday => {
      const start = new Date(holiday.impact_start_date);
      const end = new Date(holiday.impact_end_date);
      return date >= start && date <= end;
    });
  }

  /**
   * Calculate seasonality index for a given month
   * @param {number} monthNumber - Month number (1-12)
   * @param {number} constant - Seasonality constant
   * @param {number} slope - Seasonality slope
   * @returns {number} Seasonality index
   */
  static calculateSeasonalityIndex(
    monthNumber,
    constant = config.DEFAULT_SEASONALITY_CONSTANT,
    slope = config.DEFAULT_SEASONALITY_SLOPE
  ) {
    if (constant === null || constant === undefined ||
      slope === null || slope === undefined) {
      return 1; // No seasonality adjustment
    }

    return parseFloat(slope) * monthNumber + parseFloat(constant);
  }

  /**
   * Check if flight is feasible based on aircraft range
   * @param {number} distanceKm - Distance in kilometers
   * @param {number} aircraftRangeKm - Aircraft maximum range in kilometers
   * @param {number} safetyMarginPct - Safety margin percentage (default 10%)
   * @returns {boolean} True if flight is feasible
   */
  static isFlightFeasible(distanceKm, aircraftRangeKm, safetyMarginPct = 0.1) {
    if (!distanceKm || !aircraftRangeKm) {
      return false;
    }

    const maxFeasibleDistance = aircraftRangeKm * (1 - safetyMarginPct);
    return distanceKm <= maxFeasibleDistance;
  }

  /**
   * Calculate utilization metrics
   * @param {number} blockHoursPerWeek - Block hours per week
   * @param {number} numberOfAircraft - Number of aircraft
   * @returns {Object} Utilization metrics
   */
  static calculateUtilization(blockHoursPerWeek, numberOfAircraft) {
    if (!blockHoursPerWeek || isNaN(blockHoursPerWeek) || !numberOfAircraft || isNaN(numberOfAircraft) || numberOfAircraft === 0) {
      return {
        blockHoursPerAircraft: 0,
        blockHoursPerDay: 0,
        utilizationPct: 0
      };
    }

    const blockHoursPerAircraft = blockHoursPerWeek / numberOfAircraft;
    const blockHoursPerDay = blockHoursPerAircraft / 7;
    const utilizationPct = (blockHoursPerDay / 24) * 100;

    return {
      blockHoursPerAircraft: Math.round(blockHoursPerAircraft * 10) / 10,
      blockHoursPerDay: Math.round(blockHoursPerDay * 10) / 10,
      utilizationPct: Math.round(utilizationPct * 10) / 10
    };
  }
}

module.exports = FlightCalculator;
