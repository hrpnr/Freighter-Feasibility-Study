import React, { useState, useEffect, useRef, useMemo } from 'react';
import { fleetService, scheduleService, scenarioService, pricingService, routeService } from '../services/api';
import toast from 'react-hot-toast';
import './ScheduleBuilder.css';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Helper to reliably color-code airport badges
function airportColor(code) {
  if (!code) return '#4b5563';
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

// Helper to display date safely (DD Mmm YYYY) without timezone shifts
const formatDisplayDate = (dateVal) => {
  if (!dateVal) return '';
  const str = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
  const [y, m, d] = str.substring(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
};

// Convert "HH:MM:SS" or "HH:MM" to minutes since midnight
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Convert minutes since midnight to "HH:MM" format
function minutesToTime(mins) {
  if (mins === null || isNaN(mins)) return '--:--';
  const totalMins = Math.floor(mins) % 1440; // wrap around 24h
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Robust helper to parse YYYY-MM-DD as a local date
function parseLocalDate(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Robust helper to format Date to YYYY-MM-DD locally
function formatLocalDate(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Add days to a YYYY-MM-DD string, returning YYYY-MM-DD
function addDaysToYMD(ymd, days) {
  const d = parseLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

// Helper to calculate Arrival Time based on Dep, Distance, Speed
function calculateArrivalTime(depTimeStr, distanceKm, speedKnots) {
  if (!depTimeStr || !distanceKm || !speedKnots) return depTimeStr;
  
  const [h, m] = depTimeStr.split(':').map(Number);
  const depMins = h * 60 + m;
  
  const distNm = distanceKm / 1.852;
  const flightTimeHrs = (distNm / speedKnots) * 1.1; // 10% airway contingency
  const taxiTimeHrs = 0.25; // 15 mins total (10m out, 5m in)
  
  const blockHrs = flightTimeHrs + taxiTimeHrs;
  const blockMins = Math.round(blockHrs * 60);
  
  const arrivalMins = depMins + blockMins;
  const ah = Math.floor(arrivalMins / 60) % 24;
  const am = arrivalMins % 60;
  return `${ah.toString().padStart(2, '0')}:${am.toString().padStart(2, '0')}`;
}

function calculateLegUplift(manifestItems) {
  if (!Array.isArray(manifestItems)) return 0;
  return manifestItems.reduce((sum, item) => sum + (parseFloat(item.weight_kg) || 0), 0);
}

function calculateLegRevenue(manifestItems) {
  if (!Array.isArray(manifestItems)) return 0;
  return manifestItems.reduce((sum, item) => sum + ((parseFloat(item.weight_kg) || 0) * (parseFloat(item.yield_usd_per_kg) || 0)), 0);
}

/**
 * Extracts unique market parcels (O&D journeys) from a list of leg segments.
 * In legacy data, a transit parcel exists as multiple manifest items across legs.
 * We want to collapse these into a single "journey" parcel.
 */
function extractParcelsFromSegments(segments) {
  const parcels = [];
  
  segments.forEach((seg, segIdx) => {
    if (!seg.manifest_items) return;
    
    seg.manifest_items.forEach(item => {
      // If it's a transit item, we only want to register it as a parcel STARTING at this leg.
      // We check if it existed in the previous leg with the same destination.
      const isContinuation = segIdx > 0 && segments[segIdx - 1].manifest_items?.some(prev => 
        prev.od_destination_id === item.od_destination_id && prev.weight_kg === item.weight_kg
      );
      
      if (!isContinuation) {
        parcels.push({
          origin_id: seg.origin_id,
          origin_code: seg.origin_code,
          dest_id: item.od_destination_id,
          dest_code: item.dest_code,
          weight_kg: parseFloat(item.weight_kg) || 0,
          yield_usd_per_kg: parseFloat(item.yield_usd_per_kg) || 0
        });
      }
    });
  });
  
  return parcels;
}

function ScheduleBuilder({ scenarioId, onStaleChange = () => {} }) {
  const [fleet, setFleet] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [feasibleRoutes, setFeasibleRoutes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [params, setParams] = useState({ ground_time_hll_hours: 0.75, ground_time_manual_hours: 1.5 });
  const [pricing, setPricing] = useState([]);

  // popover: { fleetPlanId, dayIndex, priority, anchorRect, projectedBlockOff }
  const [popover, setPopover] = useState(null);
  const popoverRef = useRef(null);

  // overridePicker: { scheduleId, currentVal, anchorRect }
  const [overridePicker, setOverridePicker] = useState(null);
  const overrideRef = useRef(null);

  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('asc');
  const [cardsSearchTerm, setCardsSearchTerm] = useState('');

  const [asOfDate, setAsOfDate] = useState('');
  const [scenarioRange, setScenarioRange] = useState({ min: '', max: '' });
  const [draftRotation, setDraftRotation] = useState([]);
  const [rotationBuilder, setRotationBuilder] = useState(null); 
  // rotationBuilder: { fleetPlanId, tail, aircraftType, startDate, endDate, operatingDays, segments: [{ origin_id, origin_code, dest_id, dest_code, route_category, departure_time }] }

  useEffect(() => {
    if (scenarioId) fetchData();
  }, [scenarioId]);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopover(null);
        setSearchTerm('');
      }
      if (overrideRef.current && !overrideRef.current.contains(e.target)) {
        setOverridePicker(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchData = async () => {
    try {
      const [fleetRes, schedulesRes, paramsRes, pricingRes] = await Promise.all([
        fleetService.getAll(scenarioId),
        scheduleService.getByScenario(scenarioId),
        scenarioService.getParameters(scenarioId),
        pricingService.getByScenario(scenarioId)
      ]);
      setFleet(fleetRes.data);
      setSchedules(schedulesRes.data);
      setParams(paramsRes.data);
      setPricing(pricingRes.data);

      if (schedulesRes.data.length > 0 || fleetRes.data.length > 0) {
        const dates = schedulesRes.data.flatMap(s => [s.start_date, s.end_date].filter(Boolean));
        const fleetDates = fleetRes.data.flatMap(f => [f.eis_date, f.redelivery_date].filter(Boolean));
        const all = [...dates, ...fleetDates].map(d => d.substring(0, 10));
        if (all.length > 0) {
          const min = all.sort()[0];
          const max = all.sort().pop() || min;
          setScenarioRange({ min, max });
          if (!asOfDate) setAsOfDate(min);
        }
      }
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to load schedule data');
    }
  };

  const fetchFeasibleRoutes = async (fleetPlanId) => {
    try {
      const response = await routeService.getFeasible(fleetPlanId);
      setFeasibleRoutes(response.data);
      return response.data;
    } catch (error) {
      setFeasibleRoutes([]);
      return [];
    }
  };

  // Look up yield rate from loaded pricing: scenario override first, then master fallback.
  // Returns the fare_usd number if found, else null.
  const lookupRate = (originId, destId) => {
    if (!originId || !destId || !pricing?.length) return null;
    const rate = pricing.find(r =>
      r.origin_id === originId && r.destination_id === destId
    );
    return rate ? parseFloat(rate.fare_usd) : null;
  };

  const shiftWeek = (daysOffset) => {
    if (!asOfDate) return;
    const d = parseLocalDate(asOfDate);
    d.setDate(d.getDate() + daysOffset);
    let newDate = formatLocalDate(d);
    // restrict to bounds
    if (newDate < scenarioRange.min) newDate = scenarioRange.min;
    if (newDate > scenarioRange.max) newDate = scenarioRange.max;
    if (newDate !== asOfDate) setAsOfDate(newDate);
  };

  // Group schedules, handle date phasing, crossover cascading, and compute timings
  const aircraftGrids = useMemo(() => {
    const grouped = {};
    fleet.forEach(ac => {
      grouped[ac.id] = { aircraft: ac, activeLegs: [] };
    });

    schedules.forEach(sched => {
      if (asOfDate) {
        const startOk = !sched.start_date || sched.start_date.substring(0, 10) <= asOfDate;
        const endOk = !sched.end_date || sched.end_date.substring(0, 10) >= asOfDate;
        if (!startOk || !endOk) return;
      }
      if (grouped[sched.fleet_plan_id]) {
        grouped[sched.fleet_plan_id].activeLegs.push(sched);
      }
    });

    return Object.values(grouped).map(group => {
      // Build chronological timeline down the week
      // For cross-over logic: we iterate through the days Mon->Sun, passing time forward
      const dayLegs = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      let maxPriority = 0;

      const sortedLegs = [...group.activeLegs].sort((a, b) => (a.priority || 1) - (b.priority || 1));

      DAYS.forEach((dayFlag, startDayIndex) => {
        const legsForDaySequence = sortedLegs.filter(s => s[dayFlag]);

        let currentTimeMins = 6 * 60; // Default start of day is 06:00
        let currentEffectiveDay = startDayIndex;

        legsForDaySequence.forEach((leg, idx) => {
          // If user provided a manual override departure_time on ANY leg, we re-anchor
          if (leg.departure_time) {
            currentTimeMins = timeToMinutes(leg.departure_time);
            // We assume explicit departure overrides stay on the "day" column they started with
            currentEffectiveDay = startDayIndex;
          }

          const blockHours = parseFloat(leg.block_hours) || 0;
          const blockMins = blockHours * 60;

          let blockOffMins = currentTimeMins;
          let blockOnMins = blockOffMins + blockMins;

          // Process crossover to next day if blockOn passes midnight (1440 mins)
          // To track effective rendering column, we advance currentEffectiveDay if we pass a 24h boundary
          let renderDay = currentEffectiveDay;
          if (blockOffMins >= 1440) {
            const daysCrossed = Math.floor(blockOffMins / 1440);
            renderDay = (renderDay + daysCrossed) % 7;
            blockOffMins = blockOffMins % 1440;
            blockOnMins = blockOnMins % 1440;
            currentTimeMins = currentTimeMins % 1440;
          }

          const legWithTiming = {
            ...leg,
            computedBlockOff: blockOffMins,
            computedBlockOn: blockOnMins,
            renderDayIndex: renderDay,
            originalDayFlagIndex: startDayIndex,
            computedBlockOffStr: minutesToTime(blockOffMins),
            computedBlockOnStr: minutesToTime(blockOnMins),
          };

          dayLegs[renderDay].push(legWithTiming);
          if (dayLegs[renderDay].length > maxPriority) maxPriority = dayLegs[renderDay].length;

          // Prepare time for next leg in sequence: use HLL parameters instead of hardcoded 45m
          const turnaroundHours = leg.dest_has_hll 
            ? (params.ground_time_hll_hours || 0.75) 
            : (params.ground_time_manual_hours || 1.5);
          const turnaroundMins = turnaroundHours * 60;
          
          currentTimeMins = blockOffMins + blockMins + turnaroundMins;
        });
      });

      return { ...group, dayLegs, maxPriority: Math.max(maxPriority, 1) };
    });
  }, [fleet, schedules, asOfDate, params]);

  // Modern Rule Dashboard logic: Group raw schedules into complete logical rotations
  const scheduleRules = useMemo(() => {
    // 1. Group raw legs by rotation_group_id
    const groups = {};
    schedules.forEach(s => {
      const gid = s.rotation_group_id || s.id; // Fallback for safety
      if (!groups[gid]) {
        groups[gid] = {
          rotation_group_id: gid,
          legs: [],
          totalBlockHours: 0,
          tail_number: s.tail_number,
          aircraft_type_code: s.aircraft_type_code,
          start_date: s.start_date,
          end_date: s.end_date,
          region: s.region,
          // We combine days: if any leg is active on Mon, the rotation is on Mon
          monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false
        };
      }
      groups[gid].legs.push(s);
      groups[gid].totalBlockHours += parseFloat(s.block_hours || 0);
      
      // Update validity range
      if (new Date(s.start_date) < new Date(groups[gid].start_date)) groups[gid].start_date = s.start_date;
      if (s.end_date && (!groups[gid].end_date || new Date(s.end_date) > new Date(groups[gid].end_date))) groups[gid].end_date = s.end_date;
      
      // Combine days
      DAYS.forEach(day => { if (s[day]) groups[gid][day] = true; });
    });

    // 2. Process groups into Rule objects
    let rules = Object.values(groups).map(g => {
      // Sort legs by priority to build the path
      g.legs.sort((a, b) => (a.priority || 1) - (b.priority || 1));
      
      // Build Path String: CGK → UPG → AMQ → CGK
      const pathArr = [g.legs[0].origin_code];
      g.legs.forEach(l => pathArr.push(l.dest_code));
      const pathString = pathArr.join(' → ');

      // Frequency is based on the widest leg pattern
      const frequency = DAYS.reduce((count, day) => count + (g[day] ? 1 : 0), 0);

      return {
        ...g,
        pathString,
        frequency,
        origin_code: g.legs[0].origin_code,
        dest_code: g.legs[g.legs.length - 1].dest_code
      };
    });

    // 3. Filtering
    if (cardsSearchTerm) {
      const term = cardsSearchTerm.toLowerCase();
      rules = rules.filter(r => 
        r.pathString.toLowerCase().includes(term) || 
        r.tail_number.toLowerCase().includes(term)
      );
    }

    // 4. Sorting
    rules.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'origin':
          comparison = a.origin_code.localeCompare(b.origin_code);
          break;
        case 'destination':
          comparison = a.dest_code.localeCompare(b.dest_code);
          break;
        case 'region':
          comparison = (a.region || '').localeCompare(b.region || '');
          break;
        case 'frequency':
          comparison = a.frequency - b.frequency;
          break;
        case 'date':
          comparison = new Date(a.start_date || 0) - new Date(b.start_date || 0);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return rules;
  }, [schedules, cardsSearchTerm, sortBy, sortOrder]);

  const getDraftRouteCategory = (originCode, originCountry, destCode) => {
    if (originCode === 'CGK') return 'jkt_one_leg';
    if (originCountry && originCountry.toLowerCase() !== 'indonesia') return 'bo_int';
    if (destCode === 'CGK') return 'bo_dom';
    return 'bo_dom'; // default fallback for other domestic pairings
  };

  const handleOpenRotationBuilder = async (fleetPlanId, aircraft, dayIndex) => {
    // 1. Fetch feasible routes first to ensure dropdowns are populated
    const routes = await fetchFeasibleRoutes(fleetPlanId);

    const startStr = addDaysToYMD(asOfDate, dayIndex - ((parseLocalDate(asOfDate).getDay() + 6) % 7));
    
    // Initial operating days: only the clicked day is active
    const days = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };
    days[DAYS[dayIndex]] = true;

    // Find the last known location of this aircraft in the CURRENT scenario to seed the first origin
    // defaulting to CGK if nothing exists
    const acScheds = schedules.filter(s => s.fleet_plan_id === fleetPlanId);
    let initialOrigin = { id: '', code: 'CGK', country: 'Indonesia' }; 
    let startPriority = 1;
    let suggestedDepTime = '06:00';

    if (acScheds.length > 0) {
      // Find max priority across the intended days to avoid overlap
      const relevantDaysScheds = acScheds.filter(s => {
        return Object.keys(days).some(d => days[d] && s[d]);
      });
      
      if (relevantDaysScheds.length > 0) {
        const lastInSeq = [...relevantDaysScheds].sort((a,b) => (b.priority || 0) - (a.priority || 0))[0];
        startPriority = (lastInSeq.priority || 0) + 1;
        
        // Try to suggest a departure time based on the last leg's arrival
        // We need to find its arrival in the grid-like data or re-calculate
        // Since we don't have the full arrival calc here easy, 
        // let's look at the aircraftGrids computed data if it exists
        const acGrid = aircraftGrids.find(g => g.aircraft.id === fleetPlanId);
        if (acGrid) {
          const maxPrioLeg = Object.values(acGrid.dayLegs).flatMap(l => l)
            .filter(l => Object.keys(days).some(d => days[d] && l[d]))
            .sort((a,b) => b.computedBlockOn - a.computedBlockOn)[0];
          
          if (maxPrioLeg) {
             const [ah, am] = maxPrioLeg.computedBlockOnStr.split(':').map(Number);
             const turnHours = maxPrioLeg.dest_has_hll ? params.ground_time_hll_hours : params.ground_time_manual_hours;
             let nextMins = ah * 60 + am + Math.round(turnHours * 60);
             suggestedDepTime = `${Math.floor(nextMins/60).toString().padStart(2,'0')}:${(nextMins%60).toString().padStart(2,'0')}`;
          }
        }
        
        initialOrigin = { id: lastInSeq.destination_id, code: lastInSeq.dest_code };
      } else {
        const lastLeg = [...acScheds].sort((a,b) => (b.priority || 0) - (a.priority || 0))[0];
        initialOrigin = { id: lastLeg.destination_id, code: lastLeg.dest_code };
      }
    } else {
      const cgkRoute = routes.find(r => r.origin_code === 'CGK');
      if (cgkRoute) {
        initialOrigin = { id: cgkRoute.origin_id, code: 'CGK', country: 'Indonesia' };
      }
    }

    setRotationBuilder({
      fleetPlanId,
      tail: aircraft.tail_number,
      aircraftType: aircraft.aircraft_type_code,
      speedKnots: aircraft.speed_knots || 450,
      startPriority,
      startDate: startStr,
      endDate: '',
      operatingDays: days,
      maxEndDate: aircraft.redelivery_date ? aircraft.redelivery_date.substring(0, 10) : '',
      segments: [{
        origin_id: initialOrigin.id,
        origin_code: initialOrigin.code,
        dest_id: '',
        dest_code: '',
        route_category: 'bo_dom',
        departure_time: suggestedDepTime,
        arrivalTime: ''
      }],
      parcels: []
    });
  };

  const handleEditRotation = async (rule) => {
    // 1. Fetch feasible routes first
    const routes = await fetchFeasibleRoutes(rule.legs[0].fleet_plan_id);

    // 2. Map existing legs to the rotationBuilder format
    // We need to ensure arrivalTime is calculated for each leg
    const mappedSegments = rule.legs.map(l => {
      // Find the distance from feasible routes to accurately calculate arrival
      const routeData = routes.find(r => r.origin_id === l.origin_id && r.dest_id === l.destination_id);
      const dist = routeData?.distance_km || l.distance_km || 0;
      const arrival = calculateArrivalTime(l.departure_time || '06:00', dist, l.speed_knots || 450);
      
      return {
        origin_id: l.origin_id,
        origin_code: l.origin_code,
        dest_id: l.destination_id,
        dest_code: l.dest_code,
        dest_has_hll: l.dest_has_hll,
        distance_km: dist,
        route_category: l.route_category,
        departure_time: l.departure_time || '06:00',
        arrivalTime: arrival,
        manifest_items: l.manifest_items || []
      };
    });

    setRotationBuilder({
      isEdit: true,
      originalGroupId: rule.rotation_group_id,
      fleetPlanId: rule.legs[0].fleet_plan_id,
      tail: rule.tail_number,
      aircraftType: rule.aircraft_type_code,
      speedKnots: rule.legs[0].speed_knots || 450,
      startPriority: rule.legs[0].priority || 1,
      startDate: rule.start_date.substring(0, 10),
      endDate: rule.end_date ? rule.end_date.substring(0, 10) : '',
      operatingDays: {
        monday: rule.monday, tuesday: rule.tuesday, wednesday: rule.wednesday,
        thursday: rule.thursday, friday: rule.friday, saturday: rule.saturday, sunday: rule.sunday
      },
      maxEndDate: fleet.find(f => f.id === rule.legs[0].fleet_plan_id)?.redelivery_date?.substring(0, 10) || '',
      segments: mappedSegments.map(({ manifest_items, ...rest }) => rest),
      parcels: extractParcelsFromSegments(mappedSegments)
    });
  };

  const handleSaveRotation = async () => {
    if (!rotationBuilder) return;
    const { segments, startDate, endDate, operatingDays, fleetPlanId, isEdit, originalGroupId } = rotationBuilder;
    
    // Validate
    const invalid = segments.some(s => !s.dest_id);
    if (invalid) {
      toast.error('Please select a destination for all legs');
      return;
    }

    if (endDate && rotationBuilder.maxEndDate && endDate > rotationBuilder.maxEndDate) {
      toast.error(`Invalid Date: Rotation cannot exceed aircraft redelivery date (${formatDisplayDate(rotationBuilder.maxEndDate)})`);
      return;
    }

    const payload = segments.map((s, idx) => {
      // Calculate which parcels are on this leg
      const manifest_items = rotationBuilder.parcels.filter(p => {
        // A parcel is on this leg if its origin is at or before this leg, 
        // and its destination is at or after this leg.
        const originIdx = segments.findIndex((seg, i) => i <= idx && seg.origin_id === p.origin_id);
        const destIdx = segments.findIndex((seg, i) => i >= idx && seg.dest_id === p.dest_id);
        return originIdx !== -1 && destIdx !== -1;
      }).map(p => ({
        od_origin_id: p.origin_id,
        od_destination_id: p.dest_id,
        weight_kg: p.weight_kg,
        yield_usd_per_kg: p.yield_usd_per_kg,
        is_transit: p.origin_id !== s.origin_id || p.dest_id !== s.dest_id
      }));

      return {
        fleet_plan_id: fleetPlanId,
        origin_id: s.origin_id,
        destination_id: s.dest_id,
        full_route_string: `${s.origin_code}-${s.dest_code}`,
        route_category: s.route_category,
        priority: rotationBuilder.startPriority + idx,
        ...operatingDays,
        start_date: startDate,
        end_date: endDate || null,
        departure_time: s.departure_time,
        manifest_items: manifest_items
      };
    });

    try {
      // If editing, remove the old rotation first (Replace-by-Create pattern)
      if (isEdit && originalGroupId) {
        await scheduleService.deleteRotation(originalGroupId);
      }
      await scheduleService.bulkCreateRotation(scenarioId, { segments: payload });
      toast.success(isEdit ? 'Rotation updated successfully' : 'Rotation saved successfully');
      setRotationBuilder(null);
      fetchData();
      if (onStaleChange) onStaleChange(true);
    } catch (error) {
      toast.error(error.niceMessage || (isEdit ? 'Failed to update rotation' : 'Failed to save rotation'));
    }
  };

  const handleAddLeg = async (fleetPlanId, dayIndex, destRoute, priority) => {
    const dayField = DAYS[dayIndex];
    // We get the origin based on physical schedule priority (not just rendered view)
    const acSchedules = schedules.filter(s => s.fleet_plan_id === fleetPlanId);
    const dayBaseLegs = acSchedules.filter(s => s[dayField]).sort((a, b) => (a.priority || 1) - (b.priority || 1));

    let originId = destRoute.origin_id;
    if (dayBaseLegs.length > 0 && priority > 1) {
      const prevLeg = dayBaseLegs[priority - 2];
      if (prevLeg) originId = prevLeg.destination_id;
    }

    const dayBools = {};
    DAYS.forEach(d => { dayBools[d] = d === dayField; });

    let defaultCategory = 'jkt_one_leg';
    if (destRoute.origin_code === 'CGK') {
      defaultCategory = 'jkt_one_leg'; // User can edit to Two Legs
    } else {
      defaultCategory = 'bo_dom'; // Default to BO dom for others, user can edit to int
    }

    const targetDateStr = addDaysToYMD(asOfDate, dayIndex - ((parseLocalDate(asOfDate).getDay() + 6) % 7));

    try {
      const response = await scheduleService.create(scenarioId, {
        fleet_plan_id: fleetPlanId,
        origin_id: originId,
        destination_id: destRoute.dest_id,
        full_route_string: `${destRoute.origin_code}-${destRoute.dest_code}`,
        route_category: defaultCategory,
        priority: priority,
        ...dayBools,
        start_date: targetDateStr
      });

      const addedLeg = response.data;
      const rect = popover.anchorRect; // Keep same position as where user clicked [+]

      toast.success(`Add leg ${destRoute.origin_code}→${destRoute.dest_code}`);
      
      setPopover(null);
      setSearchTerm('');
      
      // Immediately open Edit window for this new leg
      setOverridePicker({
        scheduleId: addedLeg.id,
        leg: {
           ...addedLeg,
           originalDayFlagIndex: dayIndex // needed for "Delete this day" labels
        }, 
        val: '', // we don't have block off yet, user can set or leave blank for auto
        startDate: addedLeg.start_date?.substring(0, 10) || targetDateStr,
        endDate: addedLeg.end_date?.substring(0, 10) || '',
        routeCategory: addedLeg.route_category || defaultCategory,
        operatingDays: { 
           monday: addedLeg.monday, tuesday: addedLeg.tuesday, wednesday: addedLeg.wednesday,
           thursday: addedLeg.thursday, friday: addedLeg.friday, saturday: addedLeg.saturday, sunday: addedLeg.sunday
        },
        maxEndDate: fleet.find(f => f.id === fleetPlanId)?.redelivery_date?.substring(0, 10) || '',
        anchorRect: rect
      });

      fetchData();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to add leg');
    }
  };

  const handleDeleteThisWeek = async (leg) => {
    const dayLabel = DAY_LABELS[leg.originalDayFlagIndex];
    if (!window.confirm(`Remove this leg only for ${dayLabel}s?\n\n${leg.origin_code}→${leg.dest_code}`)) return;
    try {
      const dayField = DAYS[leg.originalDayFlagIndex];
      await scheduleService.deleteWeek(leg.id, dayField);
      toast.success(`Removed ${dayLabel} from this leg`);
      if (onStaleChange) onStaleChange(true);
      fetchData();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to remove week schedule');
    }
  };

  const handleDeleteThisMonth = async (leg) => {
    const monthLabel = asOfDate ? new Date(asOfDate).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'this month';
    if (!window.confirm(`Remove this leg for ${monthLabel} only?\n\n${leg.origin_code}→${leg.dest_code}\n\nNote: The schedule will be adjusted to skip ${monthLabel}.`)) return;
    try {
      await scheduleService.deleteMonth(leg.id, asOfDate);
      toast.success(`Leg removed for ${monthLabel}`);
      if (onStaleChange) onStaleChange(true);
      fetchData();
    } catch (error) {
      toast.error(error.niceMessage || 'Failed to remove month schedule');
    }
  };

  const handleDeleteLeg = async (leg) => {
    const isRotation = !!leg.rotation_group_id;
    const msg = isRotation 
      ? `⚠️ WARNING: This leg is part of a rotation group.\n\nDeleting only this segment will BREAK the flight loop and leave your aircraft stranded.\n\nAre you sure you want to proceed with single-leg deletion?`
      : `Permanently delete this leg (${leg.origin_code}→${leg.dest_code})?\n\nThis cannot be undone.`;

    if (!window.confirm(msg)) return;
    try {
      await scheduleService.delete(leg.id);
      toast.success(isRotation ? 'Segment removed (Rotation now incomplete)' : 'Schedule leg deleted');
      if (onStaleChange) onStaleChange(true);
      fetchData();
    } catch (error) {
      toast.error('Failed to delete schedule');
    }
  };

  const handleDeleteRotation = async (rule) => {
    if (!window.confirm(`Permanently delete the ENTIRE rotation and all inclusive legs?\n\n${rule.pathString}\n\nThis cannot be undone.`)) return;
    try {
      await scheduleService.deleteRotation(rule.rotation_group_id);
      toast.success('Rotation and all segments removed');
      if (onStaleChange) onStaleChange(true);
      fetchData();
    } catch (error) {
      toast.error('Failed to delete rotation');
    }
  };

  const handleSaveLegDetails = async (scheduleId, newTime, startDate, endDate, routeCategory, opDays = {}, isRotation = false, rotationGroupId = null) => {
    try {
      const token = localStorage.getItem('token');
      const timeVal = newTime.trim() === '' ? null : newTime;
      const target = schedules.find(s => s.id === scheduleId);
      if (!target) return;

      if (isRotation && rotationGroupId) {
        // Bulk Rotation Update
        const payload = {
          ...opDays,
          start_date: startDate || target.start_date,
          end_date: endDate || null,
          route_category: routeCategory || target.route_category
        };
        await api.put(`/schedules/rotation/${rotationGroupId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Whole rotation updated');
      } else {
        // Single Leg Update
        const payload = {
          ...target,
          ...opDays,
          departure_time: timeVal,
          start_date: updatedStart,
          end_date: endDate ? endDate : null,
          route_category: routeCategory || target.route_category || 'jkt_one_leg'
        };
        await scheduleService.update(scheduleId, payload);
        toast.success('Leg details updated');
      }
      
      if (onStaleChange) onStaleChange(true);
      setOverridePicker(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to update details');
    }
  };

  const openPopover = (fleetPlanId, dayIndex, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ fleetPlanId, dayIndex, priority: 99, anchorRect: rect }); // 99 ensures it goes to end of sequence
    setSearchTerm('');
    fetchFeasibleRoutes(fleetPlanId);
  };

  const checkCurfew = (route, projectedOffMins) => {
    if (!projectedOffMins || projectedOffMins < 0) return { disabled: false, reason: '' };
    const flightTimeMins = (route.distance_km / 1.852 / 400) * 60; // rough flight time
    const blockMins = flightTimeMins + 15; // + taxi
    const projectedOnMins = (projectedOffMins + blockMins) % 1440;
    const offTime = projectedOffMins % 1440;

    // Origin curfew
    if (route.origin_op_start && route.origin_op_end) {
      const s = timeToMinutes(route.origin_op_start);
      const e = timeToMinutes(route.origin_op_end);
      if (s < e && (offTime < s || offTime > e)) return { disabled: true, reason: 'Origin curfew' };
      if (s > e && (offTime > e && offTime < s)) return { disabled: true, reason: 'Origin curfew' };
    }
    // Dest curfew
    if (route.dest_op_start && route.dest_op_end) {
      const s = timeToMinutes(route.dest_op_start);
      const e = timeToMinutes(route.dest_op_end);
      if (s < e && (projectedOnMins < s || projectedOnMins > e)) return { disabled: true, reason: 'Dest curfew' };
      if (s > e && (projectedOnMins > e && projectedOnMins < s)) return { disabled: true, reason: 'Dest curfew' };
    }
    return { disabled: false, reason: '' };
  };

  const filteredRoutes = useMemo(() => {
    if (!popover) return [];

    // find prior leg to determine projected block off 
    const acGroup = aircraftGrids.find(g => g.aircraft.id === popover.fleetPlanId);
    let projectedOff = 6 * 60;
    let prevDestCode = null;

    if (acGroup) {
      // Find the last leg in physical sequence for this original day
      const legsForDay = schedules.filter(s => s.fleet_plan_id === popover.fleetPlanId && s[DAYS[popover.dayIndex]]);
      const maxPrioLeg = legsForDay.sort((a, b) => b.priority - a.priority)[0];

      if (maxPrioLeg) {
        // find its computed time and destination code from the grid
        for (let di = 0; di < 7; di++) {
          const l = acGroup.dayLegs[di].find(x => x.id === maxPrioLeg.id);
          if (l) {
            const turnaroundHours = l.dest_has_hll 
              ? (params.ground_time_hll_hours || 0.75) 
              : (params.ground_time_manual_hours || 1.5);
            projectedOff = l.computedBlockOn + (turnaroundHours * 60);
            prevDestCode = l.dest_code;
            break;
          }
        }
        popover.priority = (maxPrioLeg.priority || 0) + 1; // correctly sequence it
      } else {
        popover.priority = 1;
      }
    }

    const term = searchTerm.toLowerCase();
    const results = feasibleRoutes.filter(r =>
      r.origin_code.toLowerCase().includes(term) ||
      r.dest_code.toLowerCase().includes(term) ||
      r.origin_name?.toLowerCase().includes(term) ||
      r.dest_name?.toLowerCase().includes(term)
    ).map(r => ({ ...r, curfew: checkCurfew(r, projectedOff) }));

    // Sort: 
    // 1. Curfews (not disabled first)
    // 2. Exact origin match with previous destination
    // 3. Alphabetical destination
    return results.sort((a, b) => {
      if (a.curfew.disabled !== b.curfew.disabled) return a.curfew.disabled ? 1 : -1;
      
      const aMatchesPrev = prevDestCode && a.origin_code === prevDestCode;
      const bMatchesPrev = prevDestCode && b.origin_code === prevDestCode;
      if (aMatchesPrev && !bMatchesPrev) return -1;
      if (!aMatchesPrev && bMatchesPrev) return 1;

      return a.dest_code.localeCompare(b.dest_code);
    });
  }, [feasibleRoutes, searchTerm, popover, aircraftGrids, schedules]);

  const handleClearAllSchedules = async () => {
    if (!window.confirm("Are you sure you want to delete ALL schedules in this scenario? This cannot be undone.")) return;
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/scenarios/${scenarioId}/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('All schedules permanently removed');
      if (onStaleChange) onStaleChange(true);
      fetchData();
    } catch (error) {
      toast.error('Failed to clear schedules');
    }
  };

  return (
    <div className="schedule-builder-v2">
      <div className="builder-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h2>Schedule Builder</h2>
          {(schedules.length > 0) && (
            <button 
              className="danger-btn" 
              style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '4px', backgroundColor: 'transparent', border: '1px solid #ff4444', color: '#ff4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleClearAllSchedules}
              title="Remove all schedules from this scenario"
            >
              <span>🗑️</span> Clear All Legs
            </button>
          )}
        </div>
        {scenarioRange.min && (
          <div className="date-slider-container">
            <button className="nav-btn" onClick={() => shiftWeek(-7)} title="Previous Week">&lt;</button>
            <span className="date-label">📅 As of:</span>
            <input
              type="date"
              className="date-picker"
              value={asOfDate}
              min={scenarioRange.min}
              max={scenarioRange.max}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
            <input
              type="range"
              className="date-slider"
              min={0}
              max={Math.max(1, Math.round((new Date(scenarioRange.max) - new Date(scenarioRange.min)) / 86400000))}
              value={Math.round((new Date(asOfDate) - new Date(scenarioRange.min)) / 86400000) || 0}
              onChange={(e) => shiftWeek(e.target.value - Math.round((new Date(asOfDate) - new Date(scenarioRange.min)) / 86400000))}
            />
            <button className="nav-btn" onClick={() => shiftWeek(7)} title="Next Week">&gt;</button>
          </div>
        )}
      </div>

      {!scenarioId && (
        <div className="warning-box">
          <p>⚠️ Please select a scenario first</p>
        </div>
      )}

      <div className="builder-content-split">
        <div className="builder-left-pane">
          {aircraftGrids.map(({ aircraft, dayLegs, maxPriority }) => {
            return (
          <div key={aircraft.id} className="rotation-grid-wrapper">
            <div className="grid-aircraft-header">
              <span className="ac-icon">✈️</span>
              <span className="ac-tail">{aircraft.tail_number}</span>
              <span className="ac-type-badge">{aircraft.aircraft_type_code}</span>
              <span className="ac-range">Range: {parseFloat(aircraft.range_km || 0).toLocaleString()} km</span>
            </div>

            <div className="rotation-grid">
              <table>
                <thead>
                  <tr>
                    <th className="leg-col">Leg</th>
                    {DAY_LABELS.map((label, i) => {
                      // Get current asOfDate as anchor
                      const anchorDate = parseLocalDate(asOfDate);
                      const distToMon = (anchorDate.getDay() + 6) % 7;
                      const dayDt = parseLocalDate(addDaysToYMD(asOfDate, i - distToMon));
                      
                      const displayDate = dayDt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
                      
                      return (
                        <th key={i} className="day-col">
                          <div className="day-header">
                            <div className="day-meta">{displayDate}</div>
                            <div className="day-name">{label}</div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPriority + 1 }, (_, legIdx) => (
                    <tr key={legIdx} className="leg-row">
                      <td className="leg-num">{legIdx + 1}</td>
                      {DAYS.map((day, di) => {
                        const leg = dayLegs[di]?.[legIdx];
                        
                        const anchorDate = parseLocalDate(asOfDate);
                        const distToMon = (anchorDate.getDay() + 6) % 7;
                        const colDateStr = addDaysToYMD(asOfDate, di - distToMon);

                        const isScheduled = leg && colDateStr >= (leg.start_date?.substring(0, 10) || '0000-01-01') && 
                                           (!leg.end_date || colDateStr <= leg.end_date.substring(0, 10));

                        if (isScheduled) {
                          const isCrossover = leg.originalDayFlagIndex !== leg.renderDayIndex;
                          const hasOverride = !!leg.departure_time;

                          return (
                            <td key={di} className="leg-cell filled"
                              style={{ opacity: isCrossover ? 0.85 : 1, borderTop: isCrossover ? '2px dotted var(--primary-color)' : '' }}>
                              <div className="cell-times tooltip-trigger">
                                {leg.computedBlockOffStr} - {leg.computedBlockOnStr}
                                {isCrossover && <span className="crossover-indicator">+1d</span>}
                              </div>
                              <div className="cell-content tooltip-trigger">
                                <div className="route-badges" title={`${leg.origin_code}→${leg.dest_code}`}>
                                  <span className="airport-badge" style={{ backgroundColor: airportColor(leg.origin_code) }}>
                                    {leg.origin_code}
                                  </span>
                                  <span className="route-arrow">→</span>
                                  <span className="airport-badge" style={{ backgroundColor: airportColor(leg.dest_code) }}>
                                    {leg.dest_code}
                                  </span>
                                </div>
                                {/* Individual delete disabled from grid */}

                                {/* Strict Math Tooltip */}
                                <div className="math-tooltip">
                                  <strong>{leg.origin_code} → {leg.dest_code}</strong>
                                  <div className="math-row"><span>Flight Time:</span> <span>{leg.flight_time || (leg.block_hours - 0.25).toFixed(1)}h</span></div>
                                  <div className="math-row"><span>Taxi Out:</span> <span>{((leg.taxi_time || 0.25) * 0.67).toFixed(2)}h</span></div>
                                  <div className="math-row"><span>Taxi In:</span> <span>{((leg.taxi_time || 0.25) * 0.33).toFixed(2)}h</span></div>
                                  <hr />
                                  <div className="math-row total"><span>Block Hours:</span> <span>{leg.block_hours}h</span></div>
                                  {isCrossover && <div className="math-note">Arrives on {(leg.renderDayIndex > leg.originalDayFlagIndex) ? DAY_LABELS[leg.renderDayIndex] : 'Next Week'} due to midnight crossover.</div>}
                                </div>
                              </div>
                            </td>
                          );
                        } else {
                          // Check if date is within lease term
                          const eisStr = aircraft.eis_date?.substring(0, 10) || '0000-01-01';
                          const redeStr = aircraft.redelivery_date?.substring(0, 10) || '9999-12-31';
                          const isOutsideLease = colDateStr < eisStr || colDateStr > redeStr;
                          
                          // Allow adding to the NEXT available slot in this column via Popover
                          const isActiveSlot = rotationBuilder?.fleetPlanId === aircraft.id && rotationBuilder?.operatingDays[day];
                          if (legIdx === (dayLegs[di]?.length || 0)) {
                            return (
                              <td key={di} className={`leg-cell empty ${isActiveSlot ? 'active-cell' : ''} ${isOutsideLease ? 'locked' : ''}`}>
                                {!isOutsideLease ? (
                                  <button className="add-leg-btn" onClick={() => handleOpenRotationBuilder(aircraft.id, aircraft, di)}>＋</button>
                                ) : (
                                  <div className="lease-locked" title={`Outside lease period (${formatDisplayDate(eisStr)} - ${formatDisplayDate(redeStr)})`}>
                                    🔒
                                  </div>
                                )}
                              </td>
                            );
                          }
                          return <td key={di} className={`leg-cell empty ${isActiveSlot ? 'active-cell' : ''} ${isOutsideLease ? 'locked' : ''}`} />;
                        }
                      })}
                    </tr>
                  ))}

                  <tr className="night-row">
                    <td className="leg-num night-label">🌙</td>
                    {DAYS.map((day, di) => {
                      const anchorDate = parseLocalDate(asOfDate);
                      const distToMon = (anchorDate.getDay() + 6) % 7;
                      const colDateStr = addDaysToYMD(asOfDate, di - distToMon);

                      const activeLegs = (dayLegs[di] || []).filter(l => {
                        const start = l.start_date?.substring(0, 10) || '0000-01-01';
                        const end = l.end_date?.substring(0, 10) || '9999-12-31';
                        return colDateStr >= start && colDateStr <= end;
                      });

                      const night = activeLegs[activeLegs.length - 1];
                      return (
                        <td key={di} className="night-cell">
                          {night ? (
                            <span className="airport-badge night-badge" style={{ backgroundColor: airportColor(night.dest_code) }}>
                              {night.dest_code}
                            </span>
                          ) : <span className="night-empty">—</span>}
                        </td>
                      );
                    })}
                  </tr>

                  <tr className="util-row">
                    <td className="leg-num util-label">⏱</td>
                    {DAYS.map((day, di) => {
                      const anchorDate = parseLocalDate(asOfDate);
                      const distToMon = (anchorDate.getDay() + 6) % 7;
                      const colDateStr = addDaysToYMD(asOfDate, di - distToMon);

                      const activeLegs = (dayLegs[di] || []).filter(l => {
                        const start = l.start_date?.substring(0, 10) || '0000-01-01';
                        const end = l.end_date?.substring(0, 10) || '9999-12-31';
                        return colDateStr >= start && colDateStr <= end;
                      });

                      const util = activeLegs.reduce((sum, l) => sum + (parseFloat(l.block_hours) || 0), 0);
                      const pct = Math.round((util / 24) * 100);
                      return (
                        <td key={di} className="util-cell">
                          <div className="util-bar-bg"><div className="util-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                          <span className="util-text">{util.toFixed(1)}h ({pct}%)</span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
        </div>

        <div className="builder-right-pane">
          {/* Modern Schedule Management Dashboard */}
          <div className="rules-dashboard">
        <div className="rules-dashboard-header">
          <div className="dashboard-title">
            <h3>Schedule Rule Dashboard</h3>
            <span className="rule-count">{scheduleRules.length} Active Rules</span>
          </div>
          
          <div className="dashboard-controls">
            <div className="card-search-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search airport or tail..." 
                className="card-search-input"
                value={cardsSearchTerm}
                onChange={(e) => setCardsSearchTerm(e.target.value)}
              />
            </div>

            <div className="sort-bar">
              <span className="sort-label">Sort By:</span>
              <div className="sort-segmented-control">
                {[
                  { id: 'origin', label: 'Origin' },
                  { id: 'destination', label: 'Dest' },
                  { id: 'region', label: 'Region' },
                  { id: 'frequency', label: 'Freq' },
                  { id: 'date', label: 'Date' }
                ].map(opt => (
                  <button 
                    key={opt.id}
                    className={`sort-btn ${sortBy === opt.id ? 'active' : ''}`}
                    onClick={() => {
                      if (sortBy === opt.id) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else setSortBy(opt.id);
                    }}
                  >
                    {opt.label} {sortBy === opt.id && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rules-grid">
          {scheduleRules.map(rule => {
            const ruleAircraft = fleet.find(f => f.id === rule.legs[0]?.fleet_plan_id);
            const maxCapacity = ruleAircraft?.max_payload_kg || 1;
            const maxUplift = rule.legs.length > 0 ? Math.max(...rule.legs.map(l => calculateLegUplift(l.manifest_items))) : 0;
            const lfPct = isNaN(maxCapacity) || maxCapacity <= 0 ? 0 : Math.round((maxUplift / maxCapacity) * 100);

            return (
            <div className="rule-card" key={rule.rotation_group_id}>
              <div className="rule-card-header">
                <div className="rule-path-colorful">
                  {rule.pathString.split(' → ').map((ap, i, arr) => (
                    <React.Fragment key={i}>
                      <span className="path-airport" style={{ color: airportColor(ap) }}>{ap}</span>
                      {i < arr.length - 1 && <span className="path-arrow">→</span>}
                    </React.Fragment>
                  ))}
                  <span className="leg-count-badge">({rule.legs.length} legs)</span>
                </div>
                <span className={`region-pill ${rule.region?.toLowerCase() || 'dom'}`}>{rule.region || 'DOM'}</span>
              </div>

              <div className="rule-card-body">

                <div className="rule-aircraft">
                  <span className="tail-num">{rule.tail_number}</span>
                  <span className="ac-type">{rule.aircraft_type_code}</span>
                </div>
                <div className="rule-days" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0.5rem 0' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Daily Peak Load Factor</span>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {DAYS.map((day, idx) => {
                      const isActive = rule[day];
                      const barHeight = isActive ? Math.min(lfPct, 100) : 0;
                      const barColor = lfPct > 100 ? 'var(--danger-color)' : (lfPct > 85 ? 'var(--warning-color)' : 'var(--primary-color)');
                      return (
                        <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '22px' }}>
                          <div style={{ width: '14px', height: '36px', background: 'var(--surface-light)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                            {isActive && <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${barHeight}%`, background: barColor, borderRadius: barHeight >= 100 ? '3px' : '0 0 3px 3px', transition: 'height 0.3s' }} />}
                          </div>
                          <span style={{ fontSize: '0.65rem', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '4px', fontWeight: isActive ? 'bold' : 'normal' }}>
                            {DAY_LABELS[idx][0]}
                          </span>
                          {isActive && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '2px' }}>{lfPct}%</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rule-timeline">
                  <div className="timeline-item">
                    <span className="label">First Flight</span>
                    <span className="value">{formatDisplayDate(rule.start_date)}</span>
                  </div>
                  <div className="timeline-item">
                    <span className="label">Expires</span>
                    <span className="value">{rule.end_date ? formatDisplayDate(rule.end_date) : 'Continuous'}</span>
                  </div>
                </div>
              </div>

              <div className="rule-card-footer">
                <div className="rule-impact">
                  <span className="value">{rule.totalBlockHours.toFixed(1)}h</span>
                  <span className="label">/ week</span>
                </div>
                <div className="rule-actions">
                  <button 
                    className="btn-icon-text manage"
                    onClick={() => handleEditRotation(rule)}
                  >
                    Edit
                  </button>
                  <button className="btn-icon-text delete" onClick={() => handleDeleteRotation(rule)}>Delete</button>
                </div>
              </div>
            </div>
          )})}
          {scheduleRules.length === 0 && (
            <div className="empty-rules-msg">
              <p>No scheduling rules found for this scenario.</p>
            </div>
          )}
        </div>
      </div>
        </div>
      </div>

      {/* Leg Details Editor */}
      {overridePicker && (
        <div 
          ref={overrideRef} 
          className="time-override-popover" 
          style={{ 
            top: (overridePicker.anchorRect.bottom + 450 > window.innerHeight) 
                 ? (overridePicker.anchorRect.top - 460) 
                 : (overridePicker.anchorRect.bottom + 4), 
            left: overridePicker.anchorRect.left 
          }}
        >
          <div className="t-head">Edit Leg Details</div>
          <div className="t-body">
            <div className="form-group">
              <label>Block-Off Time (Override)</label>
              <input type="time" id="override-input" defaultValue={overridePicker.val} />
            </div>
            <div className="form-group">
              <label>Valid From</label>
              <input type="date" id="start-date-input" defaultValue={overridePicker.startDate} />
            </div>
            <div className="form-group">
              <label>Valid Until</label>
              <input 
                type="date" 
                id="end-date-input" 
                defaultValue={overridePicker.endDate} 
                max={overridePicker.maxEndDate}
              />
            </div>
            <div className="form-group">
              <label>Route Category</label>
              <select id="route-category-select" defaultValue={overridePicker.routeCategory} className="edit-input">
                <option value="jkt_two_legs">JKT Two Legs</option>
                <option value="jkt_one_leg">JKT One Leg</option>
                <option value="bo_dom">BO Domestic</option>
                <option value="bo_int">BO International</option>
              </select>
            </div>
            <div className="form-group">
              <label>Operating Days</label>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                {DAYS.map((d, i) => (
                  <div 
                    key={d} 
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none',
                      backgroundColor: overridePicker.operatingDays[d] ? 'var(--primary-color)' : '#2a2d3d',
                      color: overridePicker.operatingDays[d] ? '#fff' : '#888',
                      border: `1px solid ${overridePicker.operatingDays[d] ? 'var(--primary-color)' : '#444'}`
                    }}
                    onClick={() => setOverridePicker({
                       ...overridePicker,
                       operatingDays: { ...overridePicker.operatingDays, [d]: !overridePicker.operatingDays[d] }
                    })}
                  >
                    {DAY_LABELS[i].charAt(0)}
                  </div>
                ))}
              </div>
            </div>
            <div className="t-actions">
              <button className="t-btn clear" onClick={() => handleSaveLegDetails(
                overridePicker.scheduleId, '',
                document.getElementById('start-date-input').value,
                document.getElementById('end-date-input').value,
                document.getElementById('route-category-select').value,
                overridePicker.operatingDays,
                overridePicker.isRotation,
                overridePicker.rotationGroupId
              )}>Auto Time</button>

              <button className="t-btn save" onClick={() => handleSaveLegDetails(
                overridePicker.scheduleId,
                document.getElementById('override-input').value,
                document.getElementById('start-date-input').value,
                document.getElementById('end-date-input').value,
                document.getElementById('route-category-select').value,
                overridePicker.operatingDays,
                overridePicker.isRotation,
                overridePicker.rotationGroupId
              )}>Save</button>
            </div>

            <div className="t-divider"></div>
            <div className="t-delete-zone">
              <div className="t-delete-label">⚠️ Remove Leg</div>
              <button className="t-btn del-week" title="Remove from active week day only" onClick={() => { setOverridePicker(null); handleDeleteThisWeek(overridePicker.leg); }}>
                📅 This {overridePicker.leg && DAY_LABELS[overridePicker.leg.originalDayFlagIndex]} only
              </button>
              <button className="t-btn del-month" title="Remove just for this month" onClick={() => { setOverridePicker(null); handleDeleteThisMonth(overridePicker.leg); }}>
                🗓️ This month only
              </button>
              <button className="t-btn del-all" title="Delete all occurrences permanently" onClick={() => { setOverridePicker(null); handleDeleteLeg(overridePicker.leg); }}>
                🗑️ Remove entirely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotation Builder Modal */}
      {rotationBuilder && (
        <div className="rotation-modal-overlay">
          <div className="rotation-modal-container">
            <div className="rotation-modal-header">
              <div className="header-info">
                <h2>Build Rotation</h2>
                <span className="tail-badge">{rotationBuilder.tail}</span>
                <span className="type-badge">{rotationBuilder.aircraftType}</span>
              </div>
              <button className="close-x" onClick={() => setRotationBuilder(null)}>✕</button>
            </div>

            <div className="rotation-modal-content">
              {/* Global Settings */}
              <div className="global-settings-row">
                <div className="input-group">
                  <label>Valid From</label>
                  <input 
                    type="date"
                    value={rotationBuilder.startDate}
                    onChange={(e) => setRotationBuilder({...rotationBuilder, startDate: e.target.value})}
                  />
                </div>
                <div className="input-group">
                  <label>Valid Until (Optional)</label>
                  <input 
                    type="date"
                    value={rotationBuilder.endDate}
                    max={rotationBuilder.maxEndDate}
                    onChange={(e) => setRotationBuilder({...rotationBuilder, endDate: e.target.value})}
                  />
                  {rotationBuilder.maxEndDate && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Max: {formatDisplayDate(rotationBuilder.maxEndDate)}
                    </span>
                  )}
                </div>
                <div className="input-group">
                  <label>Operating Days</label>
                  <div className="days-picker">
                    {DAYS.map((d, i) => (
                      <div 
                        key={d} 
                        className={`day-node ${rotationBuilder.operatingDays[d] ? 'active' : ''}`}
                        onClick={() => {
                          const updatedDays = { ...rotationBuilder.operatingDays, [d]: !rotationBuilder.operatingDays[d] };
                          setRotationBuilder({...rotationBuilder, operatingDays: updatedDays});
                        }}
                      >
                        {DAY_LABELS[i].charAt(0)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* NEW O&D PARCEL BUILDER WORKFLOW */}
              <div className="rotation-builder-v3">
                <div className="rb-timeline-aside">
                   <div className="rb-timeline-track" />
                   {rotationBuilder.segments.map((s, idx) => (
                      <div key={idx} className={`rb-node ${s.dest_id ? 'active' : ''}`}>
                         <span className="ap-code">{s.origin_code}</span>
                      </div>
                   ))}
                   <div className="rb-node last">
                      <span className="ap-code">{rotationBuilder.segments[rotationBuilder.segments.length-1]?.dest_code || '?'}</span>
                   </div>
                </div>

                <div className="rb-main-workspace">
                   {/* Flight Sequence Section */}
                   <div className="rb-section-card segments-config">
                      <div className="section-header">
                         <h4>Flight Sequence</h4>
                         <span className="hint">Physical routing for this rotation</span>
                      </div>
                      <div className="mini-segments-list">
                         {rotationBuilder.segments.map((s, idx) => {
                            const segmentUplift = rotationBuilder.parcels.filter(p => {
                               const originIdx = rotationBuilder.segments.findIndex((seg, i) => i <= idx && seg.origin_id === p.origin_id);
                               const destIdx = rotationBuilder.segments.findIndex((seg, i) => i >= idx && seg.dest_id === p.dest_id);
                               return originIdx !== -1 && destIdx !== -1;
                            }).reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);

                            const aircraft = fleet.find(f => f.id === rotationBuilder.fleetPlanId);
                            const utilPct = aircraft?.max_payload_kg ? Math.round((segmentUplift / aircraft.max_payload_kg) * 100) : 0;

                            return (
                               <div key={idx} className="mini-segment-row">
                                  <div className="seg-path">
                                     <span className="badge">{s.origin_code}</span>
                                     <span className="arrow">──▶</span>
                                     <select
                                         className="dest-select"
                                         value={s.dest_id || ''}
                                         onChange={(e) => {
                                            const r = feasibleRoutes.find(r => r.origin_id === s.origin_id && r.dest_id === e.target.value);
                                            if (!r) return;
                                            const newSegments = rotationBuilder.segments.map((seg, i) => {
                                               if (i === idx) {
                                                  const arrival = calculateArrivalTime(seg.departure_time, r.distance_km, rotationBuilder.speedKnots);
                                                  return { ...seg, dest_id: r.dest_id, dest_code: r.dest_code, distance_km: r.distance_km, dest_has_hll: r.dest_has_hll, arrivalTime: arrival };
                                               }
                                               if (i === idx + 1) {
                                                  const prevArr = calculateArrivalTime(rotationBuilder.segments[idx].departure_time, r.distance_km, rotationBuilder.speedKnots);
                                                  const [ah, am] = prevArr.split(':').map(Number);
                                                  const turn = r.dest_has_hll ? params.ground_time_hll_hours : params.ground_time_manual_hours;
                                                  let nm = ah * 60 + am + Math.round(turn * 60);
                                                  return { ...seg, origin_id: r.dest_id, origin_code: r.dest_code, departure_time: minutesToTime(nm) };
                                               }
                                               return seg;
                                            });
                                            setRotationBuilder({...rotationBuilder, segments: newSegments});
                                         }}
                                      >
                                         <option value="">Select destination...</option>
                                         {feasibleRoutes
                                            .filter(r => r.origin_id === s.origin_id)
                                            .sort((a, b) => a.dest_code.localeCompare(b.dest_code))
                                            .map(r => (
                                               <option key={r.dest_id} value={r.dest_id}>
                                                  {r.dest_code}{r.dest_name ? ` – ${r.dest_name}` : ''}
                                               </option>
                                            ))
                                         }
                                      </select>
                                  </div>
                                  <div className="seg-timing">
                                     <input type="time" value={s.departure_time} onChange={(e) => {
                                        const newSegments = rotationBuilder.segments.map((seg, i) => i === idx ? { ...seg, departure_time: e.target.value, arrivalTime: calculateArrivalTime(e.target.value, seg.distance_km, rotationBuilder.speedKnots) } : seg);
                                        setRotationBuilder({...rotationBuilder, segments: newSegments});
                                     }} />
                                     <span className="arr">ARR {s.arrivalTime || '--:--'}</span>
                                  </div>
                                  <div className="seg-capacity">
                                     <div className="mini-load-bar">
                                        <div className={`fill ${utilPct > 100 ? 'over' : ''}`} style={{ width: `${Math.min(utilPct, 100)}%` }} />
                                     </div>
                                     <span className="util-text">{utilPct}%</span>
                                  </div>
                                  {idx > 0 && <button className="mini-del" onClick={() => setRotationBuilder({...rotationBuilder, segments: rotationBuilder.segments.filter((_, i) => i !== idx)})}>✕</button>}
                               </div>
                            );
                         })}
                      </div>
                   </div>

                   {/* Marketplace Parcels Section */}
                   <div className="rb-section-card marketplace-config">
                      <div className="section-header">
                         <h4>Market Demand (O&D Parcels)</h4>
                         <span className="hint">Cargo journeys across the rotation</span>
                      </div>
                      <div className="parcels-list">
                         {rotationBuilder.parcels.map((p, pIdx) => (
                            <div key={pIdx} className="parcel-row fade-in">
                               <div className="p-journey">
                                  <div className="p-field">
                                     <label>Origin</label>
                                     <select value={p.origin_id} onChange={(e) => {
                                        const found = rotationBuilder.segments.find(s => s.origin_id === e.target.value);
                                        const autoRate = lookupRate(e.target.value, p.dest_id);
                                        const newList = [...rotationBuilder.parcels];
                                        newList[pIdx] = { ...p, origin_id: e.target.value, origin_code: found?.origin_code || '', ...(autoRate !== null ? { yield_usd_per_kg: autoRate, yield_auto: true } : { yield_auto: false }) };
                                        setRotationBuilder({...rotationBuilder, parcels: newList});
                                     }}>
                                        <option value="">Select...</option>
                                        {Array.from(new Set(rotationBuilder.segments.map(s => s.origin_id))).map(id => (
                                           <option key={id} value={id}>{rotationBuilder.segments.find(s => s.origin_id === id)?.origin_code}</option>
                                        ))}
                                     </select>
                                  </div>
                                  <span className="p-arrow">▶</span>
                                  <div className="p-field">
                                     <label>Destination</label>
                                     <select value={p.dest_id} onChange={(e) => {
                                        const found = rotationBuilder.segments.find(s => s.dest_id === e.target.value);
                                        const autoRate = lookupRate(p.origin_id, e.target.value);
                                        const newList = [...rotationBuilder.parcels];
                                        newList[pIdx] = { ...p, dest_id: e.target.value, dest_code: found?.dest_code || '', ...(autoRate !== null ? { yield_usd_per_kg: autoRate, yield_auto: true } : { yield_auto: false }) };
                                        setRotationBuilder({...rotationBuilder, parcels: newList});
                                     }}>
                                        <option value="">Select...</option>
                                        {Array.from(new Set(rotationBuilder.segments.map(s => s.dest_id).filter(id => id))).map(id => (
                                           <option key={id} value={id}>{rotationBuilder.segments.find(s => s.dest_id === id)?.dest_code}</option>
                                        ))}
                                     </select>
                                  </div>
                               </div>
                               <div className="p-metrics">
                                  <div className="p-field">
                                     <label>Weight (kg)</label>
                                     <input type="number" value={p.weight_kg} onChange={(e) => {
                                        const newList = [...rotationBuilder.parcels];
                                        newList[pIdx].weight_kg = parseFloat(e.target.value) || 0;
                                        setRotationBuilder({...rotationBuilder, parcels: newList});
                                     }} />
                                  </div>
                                  <div className="p-field">
                                      <label>Yield ($/kg) {p.yield_auto && <span className="yield-auto-tag">&#9679; auto</span>}</label>
                                      <input type="number" step="0.01" value={p.yield_usd_per_kg} className={p.yield_auto ? "yield-autofilled" : ""} onChange={(e) => {
                                         const newList = [...rotationBuilder.parcels];
                                         newList[pIdx] = { ...newList[pIdx], yield_usd_per_kg: parseFloat(e.target.value) || 0, yield_auto: false };
                                        setRotationBuilder({...rotationBuilder, parcels: newList});
                                     }} />
                                  </div>
                               </div>
                               <div className="p-subtotal">
                                  <label>Subtotal</label>
                                  <div className="val">${(p.weight_kg * p.yield_usd_per_kg).toLocaleString()}</div>
                               </div>
                               <button className="mini-del" onClick={() => {
                                  setRotationBuilder({...rotationBuilder, parcels: rotationBuilder.parcels.filter((_, i) => i !== pIdx)});
                               }}>✕</button>
                            </div>
                         ))}
                         {rotationBuilder.parcels.length === 0 && <div className="empty-market">Click "+ Market Journey" to define cargo.</div>}
                      </div>
                      <button className="add-parcel-btn" onClick={() => {
                         const first = rotationBuilder.segments[0];
                         const last = rotationBuilder.segments[rotationBuilder.segments.length-1];
                         setRotationBuilder({
                            ...rotationBuilder,
                            parcels: [...rotationBuilder.parcels, {
                               origin_id: first.origin_id, origin_code: first.origin_code,
                               dest_id: last.dest_id || '', dest_code: last.dest_code || '',
                               weight_kg: 0, yield_usd_per_kg: 0
                            }]
                         });
                      }}>+ Market Journey</button>
                   </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="add-leg-action" onClick={() => {
                const last = rotationBuilder.segments[rotationBuilder.segments.length - 1];
                if (!last.dest_id) {
                  toast.warning("Please select a destination first.");
                  return;
                }
                const [ah, am] = (last.arrivalTime || '06:00').split(':').map(Number);
                const turnHours = last.dest_has_hll ? params.ground_time_hll_hours : params.ground_time_manual_hours;
                let nextDepMins = ah * 60 + am + Math.round(turnHours * 60);
                const nextDep = minutesToTime(nextDepMins);

                setRotationBuilder({
                  ...rotationBuilder,
                  segments: [...rotationBuilder.segments, {
                    origin_id: last.dest_id, origin_code: last.dest_code,
                    dest_id: '', dest_code: '', route_category: 'bo_dom',
                    departure_time: nextDep, arrivalTime: ''
                  }]
                });
              }}>+ Add Another Leg</button>
              
              <div className="footer-right">
                <button className="cancel-rotation" onClick={() => setRotationBuilder(null)}>Cancel</button>
                <button className="save-rotation" onClick={handleSaveRotation}>Save Rotation</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScheduleBuilder;
