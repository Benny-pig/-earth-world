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

// 某時區在指定時刻相對 UTC 的偏移小時數(含半小時區,如印度 +5.5)。無法解析時回傳 null。
export function tzOffsetHours(timeZone, date = new Date()) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    const part = dtf.formatToParts(date).find((p) => p.type === "timeZoneName");
    if (!part) return null;
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part.value);
    if (!m) return 0; // 純 "GMT"
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3] || 0) / 60);
  } catch { return null; }
}

// 太陽此刻直射的地表點(近似,忽略均時差)。lon:UTC 正午時在 0°,每小時西移 15°;lat:太陽赤緯。
// 天文計算共用:距 J2000.0 的日數、格林威治恆星時(度)
export const daysSinceJ2000 = (date) => date.getTime() / 86400000 + 2440587.5 - 2451545.0;
export const gmstDeg = (d) => (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360;
const RAD = Math.PI / 180;
const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

// 太陽的黃經(度)——天文年曆的低精度公式,誤差約 0.01°
export function sunEclipticLon(d) {
  const g = (357.529 + 0.98560028 * d) * RAD;
  return 280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
}

// 黃道座標 → 地面正下方那一點的經緯度(赤經減去恆星時)
export function eclipticToSubPoint(lonDeg, latDeg, d) {
  const e = (23.439 - 0.00000036 * d) * RAD, l = lonDeg * RAD, b = latDeg * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / RAD;
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / RAD;
  return { lat: dec, lon: wrap180(ra - gmstDeg(d)) };
}

// 太陽直射點(照亮地球的方向)。以前用「中午 12 點在經度 0」的簡化算法,誤差最多約 4°;
// 改成跟月亮同一套天文公式,月相(太陽、月亮的相對角度)才會對
export function subsolarPoint(date = new Date()) {
  const d = daysSinceJ2000(date);
  return eclipticToSubPoint(sunEclipticLon(d), 0, d);
}

export function weekdayFromISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
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
