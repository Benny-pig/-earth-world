let ZH_HANT = {};
export function setZhHantNames(map) { ZH_HANT = map || {}; }
export function zhHantName(code) { return ZH_HANT[code] || null; }
