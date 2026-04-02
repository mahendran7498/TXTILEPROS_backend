function startOfWeek(inputDate = new Date()) {
  const date = new Date(inputDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
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

function formatWeekKey(inputDate = new Date()) {
  return startOfWeek(inputDate).toISOString().slice(0, 10);
}

module.exports = {
  startOfWeek,
  endOfWeek,
  formatWeekKey,
};
