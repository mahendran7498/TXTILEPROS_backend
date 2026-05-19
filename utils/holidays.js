const { getDateKey, parseDateInput, startOfDay } = require('./date');

const GOVERNMENT_HOLIDAYS = [
  { date: '2026-01-15', name: 'Pongal' },
  { date: '2026-01-16', name: 'Mattu Pongal' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-04-14', name: 'Tamil New Year' },
  { date: '2026-05-01', name: 'May Day' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-10-02', name: 'Gandhi Jayanthi' },
  { date: '2026-10-19', name: 'Ayoudha Pooja' },
  { date: '2026-11-07', name: 'Deepavali Holiday' },
  { date: '2026-11-09', name: 'Deepavali Holidays' },
];

const governmentHolidayMap = new Map(
  GOVERNMENT_HOLIDAYS.map((holiday) => [holiday.date, holiday])
);

function getHolidayInfo(inputDate) {
  const date = startOfDay(parseDateInput(inputDate));
  const dateKey = getDateKey(date);
  const governmentHoliday = governmentHolidayMap.get(dateKey);

  if (governmentHoliday) {
    return {
      date: dateKey,
      name: governmentHoliday.name,
      type: 'government',
    };
  }

  if (date.getDay() === 0) {
    return {
      date: dateKey,
      name: 'Sunday',
      type: 'weekly',
    };
  }

  return null;
}

function isHoliday(inputDate) {
  return Boolean(getHolidayInfo(inputDate));
}

function getGovernmentHolidaysForMonth(inputDate) {
  const date = startOfDay(parseDateInput(inputDate));
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  return GOVERNMENT_HOLIDAYS.filter((holiday) => holiday.date.startsWith(monthKey));
}

module.exports = {
  GOVERNMENT_HOLIDAYS,
  getHolidayInfo,
  getGovernmentHolidaysForMonth,
  isHoliday,
};
