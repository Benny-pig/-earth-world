const DEG = Math.PI / 180;

export function latLonToXYZ(latDeg, lonDeg, radius = 1) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cosLat = Math.cos(lat);
  return {
    x: radius * cosLat * Math.cos(lon),
    y: radius * Math.sin(lat),
    z: -radius * cosLat * Math.sin(lon),
  };
}

export function xyzToLatLon({ x, y, z }) {
  const r = Math.hypot(x, y, z);
  const lat = Math.asin(y / r) / DEG;
  const lon = Math.atan2(-z, x) / DEG;
  return { lat, lon };
}

export function ringCentroid(ring) {
  let x = 0, y = 0, z = 0, n = 0;
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1) : ring;
  for (const [lon, lat] of pts) {
    const p = latLonToXYZ(lat, lon, 1);
    x += p.x; y += p.y; z += p.z; n++;
  }
  const b = xyzToLatLon({ x: x / n, y: y / n, z: z / n });
  return [b.lon, b.lat];
}

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export function formatZonedTime(date, timeZone) {
  const dp = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).replace(/-/g, "/");
  const tp = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
  const wdIndex = new Date(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).format(date)
  ).getDay();
  return { date: dp, time: tp, weekday: WEEKDAYS[wdIndex] };
}

export function weatherCodeToIcon(code) {
  const table = [
    [[0], "☀️", "晴"],
    [[1, 2], "⛅", "多雲"],
    [[3], "☁️", "陰"],
    [[45, 48], "🌫️", "起霧"],
    [[51, 53, 55, 56, 57], "🌦️", "毛毛雨"],
    [[61, 63, 65, 66, 67], "🌧️", "下雨"],
    [[71, 73, 75, 77], "🌨️", "下雪"],
    [[80, 81, 82], "🌦️", "陣雨"],
    [[85, 86], "🌨️", "陣雪"],
    [[95, 96, 99], "⛈️", "雷雨"],
  ];
  for (const [codes, icon, label] of table) if (codes.includes(code)) return { icon, label };
  return { icon: "—", label: "—" };
}
