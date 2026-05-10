function startOfWeek(inputDate = new Date()) {
  const date = new Date(inputDate);
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
  const date = new Date(inputDate);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(inputDate, days) {
  const date = new Date(inputDate);
  date.setDate(date.getDate() + days);
  return date;
}

function getDateKey(inputDate = new Date()) {
  return startOfDay(inputDate).toISOString().slice(0, 10);
}

function formatWeekKey(inputDate = new Date()) {
  return startOfWeek(inputDate).toISOString().slice(0, 10);
}

module.exports = {
  addDays,
  getDateKey,
  startOfWeek,
  endOfWeek,
  startOfDay,
  formatWeekKey,
};
