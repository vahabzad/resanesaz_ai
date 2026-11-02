/* eslint-disable @typescript-eslint/no-require-imports -- Node tests consume the compiled utility. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { calendarDate, calendarDay, calendarMonth, tehranLocal, fromTehranLocal, localDay, selectCalendarDay } = require("../.data/test-build/editorial-calendar.js");

test("Persian and Gregorian dates identify the same selected day, including Nowruz and leap Esfand", () => {
  const day = calendarDay(2026, 10, 14, "gregory");
  assert.deepEqual(calendarDate(day, "persian"), { year: 1405, month: 7, day: 22 });
  assert.equal(calendarDay(1405, 7, 22, "persian"), day);
  assert.equal(calendarDay(1399, 12, 30, "persian"), calendarDay(2021, 3, 20, "gregory"));
  assert.equal(calendarDay(1400, 12, 30, "persian"), null);
  assert.equal(calendarDay(1405, 1, 1, "persian"), calendarDay(2026, 3, 21, "gregory"));
  assert.equal(calendarDay(2026, 2, 30, "gregory"), null);
  assert.equal(calendarDay(1405, 13, 1, "persian"), null);
});

test("month navigation has correct Saturday-first alignment and leap-year month lengths", () => {
  const leap = calendarMonth(calendarDay(1399, 12, 1, "persian"), "persian");
  assert.equal(leap.days.length, 30);
  assert.deepEqual(calendarDate(leap.first + leap.days.length, "persian"), { year: 1400, month: 1, day: 1 });
  assert.equal(calendarMonth(calendarDay(1400, 12, 1, "persian"), "persian").days.length, 29);
  const nowruz = calendarMonth(calendarDay(1405, 1, 1, "persian"), "persian");
  assert.equal(nowruz.offset, 0); // Saturday, 21 March 2026.
  assert.equal(calendarMonth(calendarDay(2024, 2, 1, "gregory"), "gregory").days.length, 29);
});

test("calendar conversions round-trip across decades and month boundaries", () => {
  for (let year = 1990; year <= 2040; year++) {
    for (let month = 1; month <= 12; month++) {
      const day = calendarDay(year, month, 1, "gregory");
      const persian = calendarDate(day, "persian");
      assert.equal(calendarDay(persian.year, persian.month, persian.day, "persian"), day);
    }
  }
});

test("Tehran wall-clock conversion preserves seconds, midnight and historical summer offsets", () => {
  assert.equal(fromTehranLocal("2026-10-14T00:00:00"), "2026-10-13T20:30:00.000Z");
  assert.equal(tehranLocal("2026-10-13T20:30:00.000Z"), "2026-10-14T00:00:00");
  assert.equal(fromTehranLocal("2020-07-01T12:34:56"), "2020-07-01T08:04:56.000Z");
  assert.equal(fromTehranLocal("2026-02-30T00:00:00"), null);
  assert.equal(fromTehranLocal(""), null);
  const value = "2026-10-13T20:30:45.000Z";
  const next = calendarDay(1405, 7, 23, "persian");
  assert.equal(selectCalendarDay(next, value), "2026-10-14T20:30:45.000Z");
  assert.equal(localDay(value), calendarDay(2026, 10, 14, "gregory"));
});
