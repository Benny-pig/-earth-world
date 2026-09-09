import { test } from "node:test";
import assert from "node:assert/strict";
import { latLonToXYZ, xyzToLatLon, ringCentroid, formatZonedTime, weatherCodeToIcon, weekdayFromISODate } from "../src/lib/geo.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("latLonToXYZ 原點對齊 +X", () => {
  const p = latLonToXYZ(0, 0, 1);
  near(p.x, 1); near(p.y, 0); near(p.z, 0);
});

test("latLonToXYZ 北極對齊 +Y", () => {
  const p = latLonToXYZ(90, 0, 2);
  near(p.x, 0); near(p.y, 2); near(p.z, 0);
});

test("latLonToXYZ 經度 90 度落在 -Z", () => {
  const p = latLonToXYZ(0, 90, 1);
  near(p.x, 0); near(p.z, -1);
});

test("xyzToLatLon 為 latLonToXYZ 的逆", () => {
  for (const [lat, lon] of [[0, 0], [35.68, 139.69], [-33.9, 18.4], [64, -21]]) {
    const b = xyzToLatLon(latLonToXYZ(lat, lon, 1));
    near(b.lat, lat, 1e-6); near(b.lon, lon, 1e-6);
  }
});

test("ringCentroid 傳回矩形中心附近", () => {
  const ring = [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]];
  const [lon, lat] = ringCentroid(ring);
  assert.ok(lon > 13 && lon < 17, `lon=${lon}`);
  assert.ok(lat > 13 && lat < 17, `lat=${lat}`);
});

test("formatZonedTime 依時區給出日期時間與星期", () => {
  const d = new Date("2026-01-15T00:00:00Z");
  const tokyo = formatZonedTime(d, "Asia/Tokyo");
  assert.equal(tokyo.date, "2026/01/15");
  assert.equal(tokyo.time, "09:00:00");
  assert.equal(tokyo.weekday, "週四");
});

test("weekdayFromISODate 由 ISO 日期字串給出星期(不受 UTC 位移影響)", () => {
  assert.equal(weekdayFromISODate("2026-09-09"), "週三");
  assert.equal(weekdayFromISODate("2026-01-15"), "週四");
  assert.equal(weekdayFromISODate("2026-01-01"), "週四");
  assert.equal(weekdayFromISODate("bad"), "—");
});

test("weatherCodeToIcon 對應已知碼", () => {
  assert.equal(weatherCodeToIcon(0).label, "晴");
  assert.equal(weatherCodeToIcon(3).label, "陰");
  assert.equal(weatherCodeToIcon(61).label, "下雨");
  assert.equal(weatherCodeToIcon(95).label, "雷雨");
  assert.equal(weatherCodeToIcon(999).label, "—");
});
