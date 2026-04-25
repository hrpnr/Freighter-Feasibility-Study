const config = require('../config/config');
const FlightCalculator = require('./flightCalculator');

class CostCalculator {
  /**
   * Calculate lease cost for a month
   * @param {number} leaseCostMonthly - Monthly lease cost per aircraft
   * @param {number} numberOfAircraft - Number of aircraft
   * @param {number} daysInMonth - Days in the month
   * @param {boolean} isPartialMonth - If true, prorate by days
   * @returns {number} Lease cost in USD
   */
  static calculateLeaseCost(leaseCostMonthly, numberOfAircraft, daysInMonth = 30, isPartialMonth = false) {
    if (!leaseCostMonthly || isNaN(leaseCostMonthly) || !numberOfAircraft || isNaN(numberOfAircraft)) {
      return 0;
    }

    const days = isNaN(daysInMonth) ? 30 : daysInMonth;

    if (isPartialMonth) {
      return Math.round((days / 30) * leaseCostMonthly * numberOfAircraft * 100) / 100;
    }

    return Math.round(leaseCostMonthly * numberOfAircraft * 100) / 100;
  }

  /**
   * Calculate insurance cost
   * @param {number} insuranceCostPerAC - Insurance cost per aircraft per month
   * @param {number} numberOfAircraft - Number of aircraft
   * @returns {number} Insurance cost in USD
   */
  static calculateInsuranceCost(
    insuranceCostPerAC = config.DEFAULT_INSURANCE_COST_PER_AC_MONTH_USD,
    numberOfAircraft
  ) {
    if (!numberOfAircraft || isNaN(numberOfAircraft) || isNaN(insuranceCostPerAC)) {
      return 0;
    }

    return Math.round(insuranceCostPerAC * numberOfAircraft * 100) / 100;
  }

  /**
   * Calculate overhead cost
   * @param {number} overheadCostMonth - Monthly overhead cost
   * @returns {number} Overhead cost in USD
   */
  static calculateOverheadCost(overheadCostMonth = config.DEFAULT_OVERHEAD_COST_MONTH_USD) {
    if (isNaN(overheadCostMonth)) return 0;
    return Math.round(overheadCostMonth * 100) / 100;
  }

  /**
   * Calculate ground handling cost
   * @param {number} flightCycles - Number of flight cycles
   * @param {number} ghFee - Ground handling fee per cycle
   * @returns {number} Ground handling cost in USD
   */
  static calculateGroundHandlingCost(
    flightCycles,
    ghFee = config.DEFAULT_GROUND_HANDLING_FEE_USD
  ) {
    if (!flightCycles || isNaN(flightCycles) || isNaN(ghFee)) {
      return 0;
    }

    return Math.round(flightCycles * ghFee * 100) / 100;
  }

  /**
   * Calculate airport fees (landing, parking, navigation)
   * @param {Array} fees - Array of fee objects with landing, parking, navigation
   * @returns {Object} Breakdown of airport fees
   */
  static calculateAirportFees(fees) {
    if (!fees || fees.length === 0) {
      return {
        landingFee: 0,
        parkingFee: 0,
        navigationFee: 0,
        routeCharge: 0,
        total: 0
      };
    }

    const totals = fees.reduce((acc, fee) => {
      return {
        landingFee: acc.landingFee + parseFloat(fee.landing_fee_usd || 0),
        parkingFee: acc.parkingFee + parseFloat(fee.parking_fee_usd || 0),
        navigationFee: acc.navigationFee + parseFloat(fee.navigation_fee_usd || 0),
        routeCharge: acc.routeCharge + parseFloat(fee.route_charge_usd || 0)
      };
    }, { landingFee: 0, parkingFee: 0, navigationFee: 0, routeCharge: 0 });

    totals.total = totals.landingFee + totals.parkingFee + totals.navigationFee + totals.routeCharge;

    return {
      landingFee: Math.round(totals.landingFee * 100) / 100,
      parkingFee: Math.round(totals.parkingFee * 100) / 100,
      navigationFee: Math.round(totals.navigationFee * 100) / 100,
      routeCharge: Math.round(totals.routeCharge * 100) / 100,
      total: Math.round(totals.total * 100) / 100
    };
  }

  /**
   * Calculate crew expense (base salary)
   * @param {number} numberOfAircraft - Number of aircraft
   * @param {number} pilotMonthly - Pilot monthly salary
   * @param {number} foMonthly - First officer monthly salary
   * @param {number} pilotsPerAC - Pilots per aircraft
   * @param {number} fosPerAC - First officers per aircraft
   * @returns {number} Crew expense in USD
   */
  static calculateCrewExpense(
    numberOfAircraft,
    pilotMonthly,
    foMonthly,
    pilotsPerAC = config.DEFAULT_PILOT_COUNT_PER_AC,
    fosPerAC = config.DEFAULT_FO_COUNT_PER_AC
  ) {
    if (!numberOfAircraft || isNaN(numberOfAircraft) || !pilotMonthly || isNaN(pilotMonthly) || !foMonthly || isNaN(foMonthly)) {
      return 0;
    }

    const pPerAC = isNaN(pilotsPerAC) ? config.DEFAULT_PILOT_COUNT_PER_AC : pilotsPerAC;
    const fPerAC = isNaN(fosPerAC) ? config.DEFAULT_FO_COUNT_PER_AC : fosPerAC;

    const totalPilotExpense = parseFloat(pilotMonthly) * pPerAC * numberOfAircraft;
    const totalFOExpense = parseFloat(foMonthly) * fPerAC * numberOfAircraft;

    return Math.round((totalPilotExpense + totalFOExpense) * 100) / 100;
  }

  /**
   * Calculate crew flight allowance
   * @param {number} blockHours - Total block hours
   * @param {Object} rates - Rates object with FATA, AFB, LOT for pilots and FOs
   * @returns {number} Crew flight allowance in USD
   */
  static calculateCrewFlightAllowance(blockHours, rates) {
    if (!blockHours || isNaN(blockHours) || !rates) {
      return 0;
    }

    const pFATA = parseFloat(isNaN(rates.pilotFATA) ? config.DEFAULT_PILOT_FATA_PER_HOUR_USD : rates.pilotFATA);
    const pAFB = parseFloat(isNaN(rates.pilotAFB) ? config.DEFAULT_PILOT_AFB_PER_HOUR_USD : rates.pilotAFB);
    const pLOT = parseFloat(isNaN(rates.pilotLOT) ? config.DEFAULT_PILOT_LOT_PER_HOUR_USD : rates.pilotLOT);

    const fFATA = parseFloat(isNaN(rates.foFATA) ? config.DEFAULT_FO_FATA_PER_HOUR_USD : rates.foFATA);
    const fAFB = parseFloat(isNaN(rates.foAFB) ? config.DEFAULT_FO_AFB_PER_HOUR_USD : rates.foAFB);
    const fLOT = parseFloat(isNaN(rates.foLOT) ? config.DEFAULT_FO_LOT_PER_HOUR_USD : rates.foLOT);

    const pilotAllowance = blockHours * (pFATA + pAFB + pLOT);
    const foAllowance = blockHours * (fFATA + fAFB + fLOT);

    return Math.round((pilotAllowance + foAllowance) * 100) / 100;
  }

  /**
   * Calculate maintenance cost for a month
   * @param {Array} maintenanceEvents - Array of maintenance events for the month
   * @returns {number} Maintenance cost in USD
   */
  static calculateMaintenanceCost(maintenanceEvents) {
    if (!maintenanceEvents || maintenanceEvents.length === 0) {
      return 0;
    }

    const total = maintenanceEvents.reduce((sum, event) => {
      return sum + parseFloat(event.event_cost_usd || 0);
    }, 0);

    return Math.round(total * 100) / 100;
  }

  /**
   * Calculate EIS cost for new aircraft entering service
   * @param {number} newAircraft - Number of new aircraft entering service
   * @param {number} eisCost - EIS cost per aircraft
   * @returns {number} EIS cost in USD
   */
  static calculateEISCost(
    newAircraft,
    eisCost = config.DEFAULT_EIS_COST_USD
  ) {
    if (!newAircraft || isNaN(newAircraft) || isNaN(eisCost)) {
      return 0;
    }

    return Math.round(newAircraft * eisCost * 100) / 100;
  }

  /**
   * Calculate redelivery cost for aircraft being returned
   * @param {number} aircraftReturning - Number of aircraft being returned
   * @param {number} redelCost - Redelivery cost per aircraft
   * @returns {number} Redelivery cost in USD
   */
  static calculateRedeliveryCost(
    aircraftReturning,
    redelCost = config.DEFAULT_REDELIVERY_COST_USD
  ) {
    if (!aircraftReturning || isNaN(aircraftReturning) || isNaN(redelCost)) {
      return 0;
    }

    return Math.round(aircraftReturning * redelCost * 100) / 100;
  }

  /**
   * Calculate total monthly costs
   * @param {Object} costInputs - Object containing all cost components
   * @returns {Object} Detailed cost breakdown
   */
  static calculateTotalMonthlyCosts(costInputs) {
    const costs = {
      leaseCost: costInputs.leaseCostMonthly ? this.calculateLeaseCost(
        costInputs.leaseCostMonthly,
        costInputs.numberOfAircraft,
        costInputs.daysInMonth,
        costInputs.isPartialMonth
      ) : (costInputs.totalLeaseCost || 0),
      eisCost: this.calculateEISCost(
        costInputs.newAircraft,
        costInputs.eisCost
      ),
      redelCost: this.calculateRedeliveryCost(
        costInputs.aircraftReturning,
        costInputs.redelCost
      ),
      insuranceCost: this.calculateInsuranceCost(
        costInputs.insuranceCostPerAC,
        costInputs.numberOfAircraft
      ),
      maintenanceCost: costInputs.maintenanceCostOverride !== undefined 
        ? Math.round(costInputs.maintenanceCostOverride * 100) / 100
        : this.calculateMaintenanceCost(costInputs.maintenanceEvents),
      groundHandlingCost: this.calculateGroundHandlingCost(
        costInputs.flightCycles,
        costInputs.ghFee
      ),
      fuelCost: costInputs.fuelBurnRate ? FlightCalculator.calculateFuelCost(
        costInputs.blockHours,
        costInputs.fuelBurnRate,
        costInputs.fuelPriceIDR,
        costInputs.usdToIDR
      ) : (costInputs.totalFuelCost || 0),
      crewExpense: costInputs.crewExpenseOverride !== undefined
        ? Math.round(costInputs.crewExpenseOverride * 100) / 100
        : this.calculateCrewExpense(
          costInputs.numberOfAircraft,
          costInputs.pilotMonthly,
          costInputs.foMonthly,
          costInputs.pilotsPerAC,
          costInputs.fosPerAC
        ),
      crewFlightAllowance: this.calculateCrewFlightAllowance(
        costInputs.blockHours,
        costInputs.crewRates
      ),
      crewHOTAC: costInputs.crewHOTAC || 0,
      overheadCost: this.calculateOverheadCost(costInputs.overheadCostMonth)
    };

    // Add airport fees
    const airportFees = this.calculateAirportFees(costInputs.airportFees);
    costs.landingFee = airportFees.landingFee;
    costs.parkingFee = airportFees.parkingFee;
    costs.navigationFee = airportFees.navigationFee;
    costs.routeCharge = airportFees.routeCharge;

    // Calculate total
    costs.totalCost = Object.values(costs).reduce((sum, cost) => sum + parseFloat(cost || 0), 0);
    costs.totalCost = Math.round(costs.totalCost * 100) / 100;

    return costs;
  }

  /**
   * Calculate cost per block hour (CASK equivalent)
   * @param {number} totalCost - Total cost
   * @param {number} blockHours - Total block hours
   * @returns {number} Cost per block hour in USD
   */
  static calculateCostPerBlockHour(totalCost, blockHours) {
    if (!blockHours || isNaN(blockHours) || blockHours === 0 || isNaN(totalCost)) {
      return 0;
    }

    return Math.round((totalCost / blockHours) * 100) / 100;
  }

  /**
   * Calculate break-even block hours
   * @param {number} totalRevenue - Total revenue
   * @param {number} costPerBlockHour - Cost per block hour
   * @returns {number} Break-even block hours
   */
  static calculateBreakEvenBlockHours(totalCost, totalRevenue, blockHours) {
    if (!totalRevenue || isNaN(totalRevenue) || totalRevenue === 0 || isNaN(totalCost) || isNaN(blockHours)) {
      return 0;
    }

    const breakEvenBH = (totalCost / totalRevenue) * blockHours;
    return Math.round(breakEvenBH * 10) / 10;
  }
}

module.exports = CostCalculator;
