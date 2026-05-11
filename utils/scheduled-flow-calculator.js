/**
 * SF Flow Utility Toolkit - Scheduled Flow Calculator
 *
 * Pure logic for parsing Schedule-Triggered Flow metadata and
 * computing run times. No DOM access, no API calls.
 *
 * Responsibilities:
 * - Parse the schedule block from a Flow Metadata response
 * - Calculate the next scheduled run for a given flow
 * - Enumerate all runs within a date range (used by Calendar View)
 * - Build human-readable summary sentences
 *
 * Important constraints:
 * - Schedule-Triggered Flows run in the org's default timezone (System Context)
 * - Salesforce stores `startTime` as "HH:MM:SS.SSSZ" but the Z suffix is misleading.
 *   It is wall-clock time in the org's timezone, not UTC. We strip the Z and parse
 *   the time-of-day portion only.
 * - Frequency is one of: "Once", "Daily", "Weekly"
 * - For Weekly flows, the day-of-week is derived from the startDate
 *   (Salesforce does not store a separate daysOfWeekToRun for Sched-Triggered Flows;
 *    it is reserved for other flow types and is always null here).
 * - Activation date is the LastModifiedDate of the Active version, since
 *   activating a version is the action that updates that timestamp.
 */

const ScheduledFlowCalculator = (() => {

  const FREQUENCY = {
    ONCE: 'Once',
    DAILY: 'Daily',
    WEEKLY: 'Weekly'
  };

  const DAYS_LONG = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
  ];

  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const MONTHS_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // ---------- Parsing ----------

  /**
   * Parses a Tooling API Flow record into a normalised schedule descriptor.
   * Returns null if the record is not a Schedule-Triggered Flow or has no
   * usable schedule block.
   *
   * @param {Object} flowRecord  A Tooling API Flow record (with Metadata block)
   * @returns {Object|null}      Parsed schedule descriptor
   */
  function parseSchedule(flowRecord) {
    if (!flowRecord || !flowRecord.Metadata) return null;

    const md = flowRecord.Metadata;
    const start = md.start || {};

    if (start.triggerType !== 'Scheduled') return null;

    const schedule = start.schedule;
    if (!schedule || !schedule.frequency || !schedule.startDate || !schedule.startTime) {
      return null;
    }

    const frequency = schedule.frequency;
    if (frequency !== FREQUENCY.ONCE &&
        frequency !== FREQUENCY.DAILY &&
        frequency !== FREQUENCY.WEEKLY) {
      // Unknown frequency — treat as unparseable rather than guessing
      return null;
    }

    // Extract HH:MM[:SS] components from "HH:MM:SS.SSSZ" — strip the Z;
    // the value is wall-clock time, not UTC.
    const time = _parseStartTime(schedule.startTime);
    if (!time) return null;

    // startDate is "YYYY-MM-DD"
    const startDate = _parseStartDate(schedule.startDate);
    if (!startDate) return null;

    // For Weekly, day-of-week is implicit in startDate.
    // Sunday = 0 .. Saturday = 6 (matches JS Date.getDay()).
    const weeklyDayOfWeek = frequency === FREQUENCY.WEEKLY ? startDate.getDay() : null;

    // Object + filters (may all be null/empty for flows without a target object)
    const targetObject = start.object || null;
    const filterLogic = start.filterLogic || null;
    const filters = Array.isArray(start.filters) ? start.filters : [];

    return {
      frequency,
      startDate,                       // Date object, midnight in local interpretation
      startTimeHours: time.hours,      // Number 0..23
      startTimeMinutes: time.minutes,  // Number 0..59
      weeklyDayOfWeek,                 // Number 0..6 or null
      targetObject,                    // String or null
      filterLogic,                     // "and" | "or" | null
      filters                          // Array of filter clauses
    };
  }

  function _parseStartTime(raw) {
    if (typeof raw !== 'string') return null;
    // Salesforce returns e.g. "22:00:00.000Z" — strip Z and trailing ms
    const stripped = raw.replace(/Z$/, '').split('.')[0];
    const parts = stripped.split(':');
    if (parts.length < 2) return null;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return { hours, minutes };
  }

  function _parseStartDate(raw) {
    if (typeof raw !== 'string') return null;
    // "YYYY-MM-DD" — construct as a local-interpreted date so getDay() is reliable.
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1; // JS months are 0-indexed
    const day = parseInt(m[3], 10);

    const d = new Date(year, month, day);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      // Catches invalid dates like 2025-02-30 that JS quietly rolls forward
      return null;
    }

    return d;
  }

  /**
   * Combines a parsed schedule's startDate + startTime into a single Date
   * (local-time interpretation as a stand-in for org wall-clock time).
   *
   * @param {Object} parsedSchedule
   * @returns {Date}
   */
  function getScheduleStartDateTime(parsedSchedule) {
    const d = new Date(parsedSchedule.startDate);
    d.setHours(parsedSchedule.startTimeHours, parsedSchedule.startTimeMinutes, 0, 0);
    return d;
  }

  /**
   * Parses an ISO 8601 timestamp (e.g. activation date from Salesforce) into a Date.
   * Returns null if the input is null/undefined/invalid.
   *
   * @param {string|null} raw
   * @returns {Date|null}
   */
  function parseActivationDate(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ---------- Next-run calculation ----------

  /**
   * Calculates the next run for a parsed schedule.
   *
   * The effective start point is the later of:
   *   - the schedule's startDate + startTime
   *   - the activation date (when the Active version was activated)
   *
   * For Once flows: returns the effective start point if it is in the future
   *                 relative to `from`; null otherwise (expired).
   * For Daily flows: returns the next occurrence of startTime on or after the
   *                  effective start point that is also in the future relative to `from`.
   * For Weekly flows: same as Daily, but constrained to the weekly day-of-week.
   *
   * @param {Object}   parsedSchedule  From parseSchedule()
   * @param {Date|null} activationDate
   * @param {Date}     from            Reference point ("now")
   * @returns {Date|null}              Next run datetime, or null if expired
   */
  function calculateNextRun(parsedSchedule, activationDate, from) {
    if (!parsedSchedule) return null;
    if (!(from instanceof Date)) from = new Date();

    const scheduleStart = getScheduleStartDateTime(parsedSchedule);
    const effectiveStart = activationDate && activationDate > scheduleStart
      ? new Date(activationDate)
      : new Date(scheduleStart);

    // Floor effective start's seconds/ms so comparisons are stable
    effectiveStart.setSeconds(0, 0);

    if (parsedSchedule.frequency === FREQUENCY.ONCE) {
      // For Once, we want the SCHEDULE's start datetime (not activation —
      // a Once flow that's activated late but had a future scheduled time
      // still runs at the original scheduled time). However, if scheduleStart
      // is before activation, the flow will not run.
      if (activationDate && scheduleStart < activationDate) {
        return null; // Once flow whose start datetime had already passed at activation time
      }
      return scheduleStart >= from ? new Date(scheduleStart) : null;
    }

    if (parsedSchedule.frequency === FREQUENCY.DAILY) {
      return _nextDailyRun(parsedSchedule, effectiveStart, from);
    }

    if (parsedSchedule.frequency === FREQUENCY.WEEKLY) {
      return _nextWeeklyRun(parsedSchedule, effectiveStart, from);
    }

    return null;
  }

  function _nextDailyRun(schedule, effectiveStart, from) {
    // Start with the candidate at the later of effectiveStart and `from` (date portion),
    // at the schedule's time-of-day.
    const baseDay = effectiveStart > from ? effectiveStart : from;
    const candidate = new Date(
      baseDay.getFullYear(),
      baseDay.getMonth(),
      baseDay.getDate(),
      schedule.startTimeHours,
      schedule.startTimeMinutes,
      0, 0
    );

    // Bump forward until we satisfy both: candidate >= effectiveStart AND candidate >= from
    while (candidate < effectiveStart || candidate < from) {
      candidate.setDate(candidate.getDate() + 1);
    }

    return candidate;
  }

  function _nextWeeklyRun(schedule, effectiveStart, from) {
    const baseDay = effectiveStart > from ? effectiveStart : from;
    const candidate = new Date(
      baseDay.getFullYear(),
      baseDay.getMonth(),
      baseDay.getDate(),
      schedule.startTimeHours,
      schedule.startTimeMinutes,
      0, 0
    );

    // Snap forward to the target day-of-week
    const targetDow = schedule.weeklyDayOfWeek;
    let daysUntil = (targetDow - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + daysUntil);

    // After snapping, ensure candidate is on/after both effectiveStart and `from`.
    // If still behind, advance a full week at a time.
    while (candidate < effectiveStart || candidate < from) {
      candidate.setDate(candidate.getDate() + 7);
    }

    return candidate;
  }

  /**
   * Returns true if a Once-frequency flow's scheduled datetime has already
   * passed (i.e. it will not run again).
   *
   * @param {Object} parsedSchedule
   * @param {Date|null} activationDate
   * @param {Date} now
   * @returns {boolean}
   */
  function isExpired(parsedSchedule, activationDate, now) {
    if (!parsedSchedule || parsedSchedule.frequency !== FREQUENCY.ONCE) return false;
    return calculateNextRun(parsedSchedule, activationDate, now || new Date()) === null;
  }

  // ---------- Range enumeration (calendar view) ----------

  /**
   * Returns all run datetimes for the given schedule within [rangeStart, rangeEnd].
   * Used to populate the calendar grid.
   *
   * @param {Object}   parsedSchedule
   * @param {Date|null} activationDate
   * @param {Date}     rangeStart
   * @param {Date}     rangeEnd
   * @returns {Date[]}
   */
  function getRunsInRange(parsedSchedule, activationDate, rangeStart, rangeEnd) {
    if (!parsedSchedule) return [];
    if (!(rangeStart instanceof Date) || !(rangeEnd instanceof Date)) return [];
    if (rangeEnd < rangeStart) return [];

    const scheduleStart = getScheduleStartDateTime(parsedSchedule);
    const effectiveStart = activationDate && activationDate > scheduleStart
      ? new Date(activationDate)
      : new Date(scheduleStart);

    const runs = [];

    if (parsedSchedule.frequency === FREQUENCY.ONCE) {
      // Same special-case as calculateNextRun — Once flow doesn't run if
      // schedule was before activation.
      if (activationDate && scheduleStart < activationDate) return [];
      if (scheduleStart >= rangeStart && scheduleStart <= rangeEnd) {
        runs.push(new Date(scheduleStart));
      }
      return runs;
    }

    if (parsedSchedule.frequency === FREQUENCY.DAILY) {
      const cur = new Date(
        Math.max(rangeStart.getTime(), effectiveStart.getTime())
      );
      cur.setHours(parsedSchedule.startTimeHours, parsedSchedule.startTimeMinutes, 0, 0);

      // If we just advanced cur past rangeStart by setting time-of-day, ensure
      // we don't include a run that is actually before rangeStart.
      while (cur < rangeStart || cur < effectiveStart) {
        cur.setDate(cur.getDate() + 1);
      }

      while (cur <= rangeEnd) {
        runs.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return runs;
    }

    if (parsedSchedule.frequency === FREQUENCY.WEEKLY) {
      const targetDow = parsedSchedule.weeklyDayOfWeek;
      const cur = new Date(
        Math.max(rangeStart.getTime(), effectiveStart.getTime())
      );
      cur.setHours(parsedSchedule.startTimeHours, parsedSchedule.startTimeMinutes, 0, 0);

      // Snap to target day-of-week
      let daysUntil = (targetDow - cur.getDay() + 7) % 7;
      cur.setDate(cur.getDate() + daysUntil);

      while (cur < rangeStart || cur < effectiveStart) {
        cur.setDate(cur.getDate() + 7);
      }

      while (cur <= rangeEnd) {
        runs.push(new Date(cur));
        cur.setDate(cur.getDate() + 7);
      }
      return runs;
    }

    return runs;
  }

  // ---------- Summary sentence ----------

  /**
   * Builds a human-readable summary sentence for the explorer's details modal.
   * Examples:
   *   "Runs once on Thu, 30 Apr 2026 at 02:00 against Cases where Status = 'Closed'."
   *   "Runs daily at 22:00."
   *   "Runs every Thursday at 22:00 against all Opportunities."
   *
   * @param {Object} parsedSchedule
   * @returns {string}
   */
  function buildSummarySentence(parsedSchedule) {
    if (!parsedSchedule) return '';

    const time = formatTime(parsedSchedule.startTimeHours, parsedSchedule.startTimeMinutes);

    let frequencyClause;
    if (parsedSchedule.frequency === FREQUENCY.ONCE) {
      frequencyClause = `runs once on ${formatDateLong(parsedSchedule.startDate)} at ${time}`;
    } else if (parsedSchedule.frequency === FREQUENCY.DAILY) {
      frequencyClause = `runs daily at ${time}`;
    } else if (parsedSchedule.frequency === FREQUENCY.WEEKLY) {
      frequencyClause = `runs every ${DAYS_LONG[parsedSchedule.weeklyDayOfWeek]} at ${time}`;
    } else {
      frequencyClause = 'runs on a schedule';
    }

    let targetClause;
    if (!parsedSchedule.targetObject) {
      targetClause = 'with no target object';
    } else if (!parsedSchedule.filters || parsedSchedule.filters.length === 0) {
      targetClause = `against all ${parsedSchedule.targetObject} records`;
    } else {
      const filterText = formatFilters(parsedSchedule);
      targetClause = `against ${parsedSchedule.targetObject} records where ${filterText}`;
    }

    return `This flow ${frequencyClause} ${targetClause}.`;
  }

  /**
   * Formats the schedule's filter clauses into a human-readable string.
   * E.g. "StageName = 'Prospecting' AND Amount > 10000"
   *
   * @param {Object} parsedSchedule
   * @returns {string}
   */
  function formatFilters(parsedSchedule) {
    if (!parsedSchedule || !parsedSchedule.filters) return '';
    const parts = parsedSchedule.filters.map(_formatFilterClause).filter(Boolean);
    if (parts.length === 0) return '';

    const logic = (parsedSchedule.filterLogic || 'and').toLowerCase();
    if (logic === 'and' || logic === 'or') {
      return parts.join(` ${logic.toUpperCase()} `);
    }
    // Custom filter logic (e.g. "1 AND (2 OR 3)") — fall back to a numbered listing
    return parts.map((p, i) => `${i + 1}. ${p}`).join('; ');
  }

  function _formatFilterClause(clause) {
    if (!clause || !clause.field || !clause.operator) return '';
    const operator = _humaniseOperator(clause.operator);
    const value = _formatFilterValue(clause.value);
    return `${clause.field} ${operator} ${value}`;
  }

  function _humaniseOperator(op) {
    const map = {
      EqualTo: '=',
      NotEqualTo: '!=',
      GreaterThan: '>',
      GreaterThanOrEqualTo: '>=',
      LessThan: '<',
      LessThanOrEqualTo: '<=',
      StartsWith: 'starts with',
      EndsWith: 'ends with',
      Contains: 'contains',
      DoesNotContain: 'does not contain',
      IsNull: 'is null',
      In: 'IN',
      NotIn: 'NOT IN'
    };
    return map[op] || op;
  }

  function _formatFilterValue(value) {
    if (value === null || value === undefined) return 'null';

    // Filter values come as a typed wrapper — we pick whichever field is non-null
    if (typeof value !== 'object') return String(value);

    if (value.stringValue != null) return `'${value.stringValue}'`;
    if (value.numberValue != null) return String(value.numberValue);
    if (value.booleanValue != null) return value.booleanValue ? 'true' : 'false';
    if (value.dateValue != null) return value.dateValue;
    if (value.dateTimeValue != null) return value.dateTimeValue;
    if (value.elementReference != null) return `{!${value.elementReference}}`;

    return '?';
  }

  // ---------- Formatting helpers ----------

  function formatTime(hours, minutes) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function formatDateLong(date) {
    if (!(date instanceof Date)) return '';
    return `${DAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatDateTimeLong(date) {
    if (!(date instanceof Date)) return '';
    return `${formatDateLong(date)} at ${formatTime(date.getHours(), date.getMinutes())}`;
  }

  /**
   * Returns a relative-time descriptor for a future or past datetime.
   * E.g. "in 3 days", "Tomorrow", "5 days ago".
   *
   * @param {Date} target
   * @param {Date} now
   * @returns {string}
   */
  function formatRelative(target, now) {
    if (!(target instanceof Date)) return '';
    if (!(now instanceof Date)) now = new Date();

    // Compare by calendar day (zero out time)
    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffDays = Math.round((targetDay - todayDay) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
    if (diffDays < 0 && diffDays > -7) return `${-diffDays} days ago`;
    if (diffDays >= 7 && diffDays < 30) {
      const weeks = Math.round(diffDays / 7);
      return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
    }
    if (diffDays <= -7 && diffDays > -30) {
      const weeks = Math.round(-diffDays / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }
    if (diffDays >= 30 && diffDays < 365) {
      const months = Math.round(diffDays / 30);
      return `in ${months} month${months === 1 ? '' : 's'}`;
    }
    if (diffDays <= -30 && diffDays > -365) {
      const months = Math.round(-diffDays / 30);
      return `${months} month${months === 1 ? '' : 's'} ago`;
    }
    const years = Math.round(diffDays / 365);
    return diffDays > 0
      ? `in ${years} year${years === 1 ? '' : 's'}`
      : `${-years} year${-years === 1 ? '' : 's'} ago`;
  }

  // ---------- Public API ----------

  return {
    FREQUENCY,
    DAYS_LONG,
    DAYS_SHORT,
    MONTHS_LONG,
    MONTHS_SHORT,
    parseSchedule,
    parseActivationDate,
    getScheduleStartDateTime,
    calculateNextRun,
    isExpired,
    getRunsInRange,
    buildSummarySentence,
    formatFilters,
    formatTime,
    formatDateLong,
    formatDateTimeLong,
    formatRelative
  };

})();