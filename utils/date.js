function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function parseDateInput(inputDate = new Date()) {
  if (inputDate instanceof Date) {
    return new Date(inputDate);
  }

  const rawValue = String(inputDate || '').trim();
  const dateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const monthMatch = rawValue.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    return new Date(Number(year), Number(month) - 1, 1);
  }

  return new Date(inputDate);
}

function formatDateKey(inputDate = new Date()) {
  const date = new Date(inputDate);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatMonthKey(inputDate = new Date()) {
  const date = new Date(inputDate);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function startOfWeek(inputDate = new Date()) {
  const date = parseDateInput(inputDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  // Week starts on Monday (day 1)
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function endOfWeek(inputDate = new Date()) {
  const start = startOfWeek(inputDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

function startOfDay(inputDate = new Date()) {
  const date = parseDateInput(inputDate);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(inputDate, days) {
  const date = parseDateInput(inputDate);
  date.setDate(date.getDate() + days);
  return date;
}

function getDateKey(inputDate = new Date()) {
  return formatDateKey(startOfDay(inputDate));
}

function formatWeekKey(inputDate = new Date()) {
  return formatDateKey(startOfWeek(inputDate));
}

module.exports = {
  addDays,
  formatDateKey,
  formatMonthKey,
  getDateKey,
  parseDateInput,
  startOfWeek,
  endOfWeek,
  startOfDay,
  formatWeekKey,
};
