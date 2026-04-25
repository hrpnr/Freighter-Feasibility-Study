const config = require('../config/config');

class RevenueCalculator {
  /**
   * Calculate revenue for a flight segment
   * @param {number} baseFare - Base fare in USD
   * @param {number} numberOfFlights - Number of flights
   * @param {Date} calculationDate - Date of calculation
   * @param {Date} baseDate - Base date (go live date)
   * @param {number} fareGrowthRate - Annual fare growth rate
   * @param {number} trafficGrowthRate - Annual traffic growth rate
   * @param {number} seasonalityIndex - Seasonality adjustment (default 1)
   * @param {number} upliftKg - Starting uplift in kg (default null)
   * @param {number} maxPayloadKg - Aircraft maximum payload capacity in kg (default null)
   * @returns {number} Revenue in USD
   */
  static calculateFlightRevenue(
    baseFare,
    numberOfFlights,
    calculationDate,
    baseDate,
    fareGrowthRate = config.DEFAULT_FARE_GROWTH_RATE_ANNUAL,
    trafficGrowthRate = config.DEFAULT_TRAFFIC_GROWTH_RATE_ANNUAL,
    seasonalityIndex = 1,
    upliftKg = null,
    maxPayloadKg = null
  ) {
    if (!baseFare || isNaN(baseFare) || !numberOfFlights || isNaN(numberOfFlights) || numberOfFlights === 0) {
      return 0;
    }

    const fGrowth = isNaN(fareGrowthRate) ? config.DEFAULT_FARE_GROWTH_RATE_ANNUAL : parseFloat(fareGrowthRate);
    const tGrowth = isNaN(trafficGrowthRate) ? config.DEFAULT_TRAFFIC_GROWTH_RATE_ANNUAL : parseFloat(trafficGrowthRate);
    const sIndex = isNaN(seasonalityIndex) ? 1 : parseFloat(seasonalityIndex);

    // Calculate days since base date
    const daysSinceBase = this.getDaysDifference(calculationDate, baseDate);

    // Apply fare growth: baseFare * (1 + fareGrowth)^(days/365)
    // baseFare is assumed to be USD per kg
    const fareWithGrowth = parseFloat(baseFare || 0) * Math.pow(
      1 + fGrowth,
      daysSinceBase / config.DAYS_IN_YEAR
    );

    if (upliftKg !== null && !isNaN(upliftKg) && upliftKg > 0) {
      // Calculate cargo volume (uplift) growth
      let grownUplift = upliftKg * Math.pow(
        1 + tGrowth,
        daysSinceBase / config.DAYS_IN_YEAR
      ) * sIndex;

      // ENFORCE CAPACITY CAP: grownUplift cannot exceed aircraft maximum payload
      if (maxPayloadKg !== null && !isNaN(maxPayloadKg) && maxPayloadKg > 0) {
        grownUplift = Math.min(grownUplift, maxPayloadKg);
      }

      // revenue = grownFare * grownUplift * numberOfFlights
      const revenue = fareWithGrowth * grownUplift * numberOfFlights;
      return Math.round(revenue * 100) / 100;
    } else {
      // Legacy formula
      const trafficWithGrowth = numberOfFlights * Math.pow(
        1 + tGrowth,
        daysSinceBase / config.DAYS_IN_YEAR
      );

      const adjustedTraffic = trafficWithGrowth * sIndex;
      const revenue = fareWithGrowth * adjustedTraffic;

      return Math.round(revenue * 100) / 100;
    }
  }

  /**
   * Calculate total revenue for a day across all routes
   * @param {Array} flights - Array of flight objects with fare and count
   * @param {Date} calculationDate - Date of calculation
   * @param {Date} baseDate - Base date
   * @param {Object} growthRates - Object with fareGrowthRate and trafficGrowthRate
   * @param {number} seasonalityIndex - Seasonality adjustment
   * @returns {number} Total revenue in USD
   */
  static calculateDailyRevenue(
    flights,
    calculationDate,
    baseDate,
    growthRates,
    seasonalityIndex = 1
  ) {
    if (!flights || flights.length === 0) {
      return 0;
    }

    const totalRevenue = flights.reduce((sum, flight) => {
      const flightRevenue = this.calculateFlightRevenue(
        flight.fare,
        flight.numberOfFlights,
        calculationDate,
        baseDate,
        growthRates.fareGrowthRate,
        growthRates.trafficGrowthRate,
        seasonalityIndex,
        flight.upliftKg
      );
      return sum + parseFloat(flightRevenue || 0);
    }, 0);

    return Math.round(totalRevenue * 100) / 100;
  }

  /**
   * Calculate monthly revenue from daily revenue data
   * @param {Array} dailyRevenues - Array of daily revenue values
   * @returns {number} Monthly revenue in USD
   */
  static calculateMonthlyRevenue(dailyRevenues) {
    if (!dailyRevenues || dailyRevenues.length === 0) {
      return 0;
    }

    const total = dailyRevenues.reduce((sum, revenue) => sum + parseFloat(revenue || 0), 0);
    return Math.round(total * 100) / 100;
  }

  /**
   * Get number of days between two dates
   * @param {Date} date1 - First date
   * @param {Date} date2 - Second date
   * @returns {number} Number of days
   */
  static getDaysDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const timeDiff = d1.getTime() - d2.getTime();
    return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate break-even load factor
   * @param {number} totalCost - Total monthly cost in USD
   * @param {number} totalRevenue - Total monthly revenue in USD
   * @param {number} currentLoadFactor - Current load factor (0-1)
   * @returns {number} Break-even load factor (0-1)
   */
  static calculateBreakEvenLoadFactor(totalCost, totalRevenue, currentLoadFactor = 1) {
    if (!totalRevenue || isNaN(totalRevenue) || totalRevenue === 0 || isNaN(totalCost)) {
      return null; // Cannot calculate without revenue
    }

    const cLoadFactor = isNaN(currentLoadFactor) ? 1 : currentLoadFactor;
    const breakEvenLoadFactor = (totalCost / totalRevenue) * cLoadFactor;
    return Math.round(breakEvenLoadFactor * 10000) / 10000; // Round to 4 decimals
  }

  /**
   * Calculate revenue per available seat kilometer (RASK) equivalent for cargo
   * For cargo: Revenue per available ton-kilometer
   * @param {number} revenue - Total revenue
   * @param {number} availableTonKm - Available ton-kilometers
   * @returns {number} RASK in USD
   */
  static calculateRASK(revenue, availableTonKm) {
    if (!availableTonKm || isNaN(availableTonKm) || availableTonKm === 0 || isNaN(revenue)) {
      return 0;
    }

    return Math.round((revenue / availableTonKm) * 10000) / 10000;
  }
}

module.exports = RevenueCalculator;
