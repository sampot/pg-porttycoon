// 藍港大亨 — 純邏輯層（無 DOM）。

export const TOTAL_QUARTERS = 12;
export const START_CASH = 85;
export const DOCK_COUNT = 6;
export const MAX_MISSED = 3;
export const DISPATCH_COST = 6;
export const RIVAL_NAME = "海岳航運";

export const CARGO = {
  container: { name: "貨櫃", unit: 2 },
  bulk: { name: "散裝", unit: 1 },
  cold: { name: "冷鏈", unit: 3 },
};

export const ROUTE_DEFS = [
  { id: "tokyo", name: "東京", openCost: 25, upgradeCost: 15, specialty: "container", baseYield: 2, dist: 0.55 },
  { id: "shanghai", name: "上海", openCost: 20, upgradeCost: 12, specialty: "bulk", baseYield: 2, dist: 0.35 },
  { id: "singapore", name: "新加坡", openCost: 30, upgradeCost: 18, specialty: "container", baseYield: 3, dist: 0.72 },
  { id: "la", name: "洛杉磯", openCost: 40, upgradeCost: 22, specialty: "cold", baseYield: 2, dist: 0.95 },
];

/** 倉庫等級：capacity = 該格可存單位、cost = 升到該級費用。 */
export const DOCK_LEVELS = [
  { capacity: 0, cost: 0, upkeep: 0 },
  { capacity: 4, cost: 18, upkeep: 2 },
  { capacity: 8, cost: 28, upkeep: 4 },
  { capacity: 14, cost: 40, upkeep: 6 },
];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clone = (s) => structuredClone(s);

export function seeded(state, n = 1) {
  const x = Math.sin((state.seed * 9301 + state.quarter * 49297 + state.turn * 233 + n * 17) * 0.0001) * 10000;
  return x - Math.floor(x);
}

export function createGame({ seed = 1 } = {}) {
  const routes = ROUTE_DEFS.map((r) => ({
    id: r.id,
    open: false,
    level: 0,
    ship: "idle",
    pending: null,
  }));
  const docks = Array.from({ length: DOCK_COUNT }, () => ({
    level: 0,
    stored: { container: 0, bulk: 0, cold: 0 },
  }));
  const game = {
    seed: Math.abs(Math.trunc(seed)) || 1,
    turn: 0,
    quarter: 1,
    cash: START_CASH,
    reputation: 52,
    value: 14,
    freight: 100,
    routes,
    docks,
    offers: [],
    active: [],
    rival: { value: 18, routes: 1, reputation: 48, name: RIVAL_NAME },
    history: [[14, 18]],
    missed: 0,
    outcome: "playing",
    reason: null,
    score: 14,
    report: null,
    refused: false,
    msg: `十二季內讓市值超越 ${RIVAL_NAME}。點碼頭擴倉、點航線派船、接合約準時交貨。`,
    log: [],
  };
  game.offers = generateOffers(game, 3);
  return game;
}

export function routeDef(id) {
  return ROUTE_DEFS.find((r) => r.id === id);
}

export function totalCapacity(state) {
  return state.docks.reduce((sum, d) => sum + DOCK_LEVELS[d.level].capacity, 0);
}

export function totalStored(state) {
  const t = { container: 0, bulk: 0, cold: 0 };
  for (const d of state.docks) {
    for (const k of Object.keys(t)) t[k] += d.stored[k];
  }
  return t;
}

export function storageUsed(state) {
  const s = totalStored(state);
  return s.container * CARGO.container.unit + s.bulk * CARGO.bulk.unit + s.cold * CARGO.cold.unit;
}

export function freeSpace(state) {
  return Math.max(0, totalCapacity(state) - storageUsed(state));
}

/** 依貨種單位占用，把貨物塞進各碼頭（先填低 index）。 */
export function storeCargo(state, cargo) {
  const s = clone(state);
  let left = { ...cargo };
  for (let i = 0; i < s.docks.length; i += 1) {
    const cap = DOCK_LEVELS[s.docks[i].level].capacity;
    if (cap <= 0) continue;
    let used = s.docks[i].stored.container * CARGO.container.unit
      + s.docks[i].stored.bulk * CARGO.bulk.unit
      + s.docks[i].stored.cold * CARGO.cold.unit;
    for (const type of Object.keys(left)) {
      while (left[type] > 0 && used + CARGO[type].unit <= cap) {
        s.docks[i].stored[type] += 1;
        left[type] -= 1;
        used += CARGO[type].unit;
      }
    }
  }
  const spill = Object.values(left).reduce((a, b) => a + b, 0);
  return { state: s, spill };
}

export function takeCargo(state, need) {
  const s = clone(state);
  const have = totalStored(s);
  for (const k of Object.keys(need)) {
    if (have[k] < need[k]) return null;
  }
  let left = { ...need };
  for (let i = s.docks.length - 1; i >= 0; i -= 1) {
    for (const type of Object.keys(left)) {
      while (left[type] > 0 && s.docks[i].stored[type] > 0) {
        s.docks[i].stored[type] -= 1;
        left[type] -= 1;
      }
    }
  }
  return s;
}

export function upgradeDock(state, index) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;
  if (!Number.isInteger(index) || index < 0 || index >= DOCK_COUNT) {
    s.refused = true;
    s.msg = "無效的碼頭格。";
    return s;
  }
  const dock = s.docks[index];
  if (dock.level >= DOCK_LEVELS.length - 1) {
    s.refused = true;
    s.msg = `碼頭 ${index + 1} 已是最大倉等級。`;
    return s;
  }
  const next = DOCK_LEVELS[dock.level + 1];
  if (s.cash < next.cost) {
    s.refused = true;
    s.msg = `擴建碼頭 ${index + 1} 需要 ${next.cost} 資金。`;
    return s;
  }
  s.cash -= next.cost;
  dock.level += 1;
  s.value += 2;
  s.msg = `碼頭 ${index + 1} 升級至 Lv${dock.level}，容量 ${next.capacity}。`;
  s.log.unshift(`Q${s.quarter} 碼頭 ${index + 1} → Lv${dock.level}`);
  return s;
}

export function openRoute(state, routeId) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;
  const route = s.routes.find((r) => r.id === routeId);
  const def = routeDef(routeId);
  if (!route || !def) {
    s.refused = true;
    s.msg = "航線不存在。";
    return s;
  }
  if (route.open) {
    s.refused = true;
    s.msg = `${def.name} 航線已開闢。`;
    return s;
  }
  if (s.cash < def.openCost) {
    s.refused = true;
    s.msg = `開闢 ${def.name} 需要 ${def.openCost} 資金。`;
    return s;
  }
  s.cash -= def.openCost;
  route.open = true;
  route.level = 1;
  s.value += 3;
  s.reputation += 2;
  s.msg = `${def.name} 航線開航！專運 ${CARGO[def.specialty].name}。`;
  s.log.unshift(`Q${s.quarter} 開闢 ${def.name} 航線`);
  return s;
}

export function upgradeRoute(state, routeId) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;
  const route = s.routes.find((r) => r.id === routeId);
  const def = routeDef(routeId);
  if (!route || !def || !route.open) {
    s.refused = true;
    s.msg = "請先開闢航線。";
    return s;
  }
  if (route.level >= 3) {
    s.refused = true;
    s.msg = `${def.name} 已是最高航線等級。`;
    return s;
  }
  if (s.cash < def.upgradeCost) {
    s.refused = true;
    s.msg = `升級 ${def.name} 需要 ${def.upgradeCost} 資金。`;
    return s;
  }
  s.cash -= def.upgradeCost;
  route.level += 1;
  s.value += 2;
  s.msg = `${def.name} 升級至 Lv${route.level}，每趟載貨增加。`;
  s.log.unshift(`Q${s.quarter} ${def.name} → Lv${route.level}`);
  return s;
}

export function dispatchShip(state, routeId) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;
  const route = s.routes.find((r) => r.id === routeId);
  const def = routeDef(routeId);
  if (!route || !def || !route.open) {
    s.refused = true;
    s.msg = "請先開闢航線再派船。";
    return s;
  }
  if (route.ship !== "idle") {
    s.refused = true;
    s.msg = `${def.name} 的船還在海上。`;
    return s;
  }
  if (s.cash < DISPATCH_COST) {
    s.refused = true;
    s.msg = `派船需要 ${DISPATCH_COST} 燃料費。`;
    return s;
  }
  s.cash -= DISPATCH_COST;
  route.ship = "sailing";
  const bonus = Math.floor(seeded(s, 9) * (route.level + 1));
  route.pending = { type: def.specialty, qty: def.baseYield * route.level + bonus };
  s.msg = `貨輪駛向 ${def.name}，下季返港。`;
  s.log.unshift(`Q${s.quarter} 派船 → ${def.name}`);
  return s;
}

export function setFreightRate(state, rate) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;
  const next = clamp(Math.round(rate), 80, 120);
  if (next === s.freight) {
    s.refused = true;
    s.msg = `運價已是 ${next}%。`;
    return s;
  }
  s.freight = next;
  const tone = next > 105 ? "偏高，合約較少但單價高" : next < 95 ? "偏低，搶市占但毛利薄" : "均衡運價";
  s.msg = `運價調至 ${next}% — ${tone}。`;
  return s;
}

function contractPayout(type, qty, freight) {
  const base = { container: 5, bulk: 3, cold: 7 }[type];
  return Math.round(qty * base * (freight / 100));
}

export function generateOffers(state, count = 3) {
  const types = Object.keys(CARGO);
  const offers = [];
  for (let i = 0; i < count; i += 1) {
    const type = types[Math.floor(seeded(state, 20 + i) * types.length)];
    const qty = 2 + Math.floor(seeded(state, 30 + i) * 5);
    const deadline = state.quarter + 1 + Math.floor(seeded(state, 40 + i) * 2);
    const payout = contractPayout(type, qty, state.freight);
    offers.push({
      id: `c-${state.quarter}-${i}-${Math.floor(seeded(state, 50 + i) * 9999)}`,
      type,
      qty,
      deadline,
      payout,
      rival: seeded(state, 60 + i) < 0.22 + (state.freight - 100) * 0.004,
    });
  }
  return offers.filter((o) => !o.rival);
}

export function acceptContract(state, offerId) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;
  const idx = s.offers.findIndex((o) => o.id === offerId);
  if (idx < 0) {
    s.refused = true;
    s.msg = "合約已失效或被對手搶走。";
    return s;
  }
  if (s.active.length >= 4) {
    s.refused = true;
    s.msg = "同時最多承接四份合約。";
    return s;
  }
  const offer = s.offers[idx];
  s.offers.splice(idx, 1);
  s.active.push({ ...offer, acceptedQ: s.quarter });
  s.reputation += 1;
  s.msg = `承接 ${CARGO[offer.type].name} ×${offer.qty}，第 ${offer.deadline} 季前交貨。`;
  s.log.unshift(`Q${s.quarter} 接約 ${CARGO[offer.type].name}×${offer.qty}`);
  return s;
}

function receiveShipsFixed(state) {
  const s = clone(state);
  for (const route of s.routes) {
    if (route.ship !== "sailing" || !route.pending) continue;
    const def = routeDef(route.id);
    const { type, qty } = route.pending;
    const cargo = { container: 0, bulk: 0, cold: 0 };
    cargo[type] = qty;
    const { state: stored, spill } = storeCargo(s, cargo);
    Object.assign(s.docks, stored.docks);
    route.ship = "idle";
    route.pending = null;
    if (spill > 0) {
      s.cash -= spill * 3;
      s.reputation = clamp(s.reputation - spill, 0, 100);
      s.log.unshift(`Q${s.quarter} ${def.name} 返港溢貨 ${spill}，罰 ${spill * 3}`);
    } else {
      s.log.unshift(`Q${s.quarter} ${def.name} 返港 +${qty} ${CARGO[type].name}`);
    }
  }
  return s;
}

export function settleContracts(state) {
  const s = clone(state);
  const done = [];
  const still = [];
  let income = 0;
  let penalties = 0;
  for (const c of s.active) {
    const need = { container: 0, bulk: 0, cold: 0 };
    need[c.type] = c.qty;
    const have = totalStored(s)[c.type] >= c.qty;
    if (have) {
      const after = takeCargo(s, need);
      if (after) {
        Object.assign(s, after);
        s.cash += c.payout;
        income += c.payout;
        s.reputation = clamp(s.reputation + 4, 0, 100);
        s.value += 2;
        done.push({ ...c, status: "done" });
        s.log.unshift(`Q${s.quarter} 交約 ${CARGO[c.type].name}×${c.qty} +${c.payout}`);
        continue;
      }
    }
    if (s.quarter >= c.deadline) {
      const pen = Math.round(c.payout * 0.6);
      s.cash -= pen;
      s.missed += 1;
      s.reputation = clamp(s.reputation - 8, 0, 100);
      penalties += pen;
      done.push({ ...c, status: "missed", pen });
      s.log.unshift(`Q${s.quarter} 逾期 ${CARGO[c.type].name}×${c.qty} −${pen}`);
    } else {
      still.push(c);
    }
  }
  s.active = still;
  return { state: s, income, penalties, done };
}

function upkeep(state) {
  let cost = 0;
  for (const d of state.docks) cost += DOCK_LEVELS[d.level].upkeep;
  for (const r of state.routes) if (r.open) cost += r.level * 2;
  return cost;
}

export function rivalTurn(state) {
  const s = clone(state);
  const r = s.rival;
  const roll = seeded(s, 77);
  if (roll < 0.38 && r.routes < 4) {
    r.routes += 1;
    r.value += 3;
    s.log.unshift(`Q${s.quarter} ${RIVAL_NAME} 開闢新航線`);
  } else if (roll < 0.68) {
    r.value += 2 + Math.floor(seeded(s, 78) * 3);
  } else {
    r.reputation = clamp(r.reputation + 2, 0, 100);
    r.value += 1;
  }
  if (s.freight > 108) r.value += 2;
  if (s.freight < 92) s.value += 1;
  if (s.reputation > r.reputation + 10) r.value -= 1;
  r.value = Math.max(8, r.value);
  return s;
}

export function recomputeValue(state) {
  const s = clone(state);
  const openRoutes = s.routes.filter((r) => r.open).length;
  const cargoVal = storageUsed(s);
  s.value = 10
    + openRoutes * 3
    + s.docks.reduce((a, d) => a + d.level * 2, 0)
    + Math.floor(s.reputation / 8)
    + Math.floor(cargoVal / 4)
    + Math.floor(s.cash / 20);
  s.score = s.value;
  return s;
}

export function checkOutcome(state) {
  const s = clone(state);
  if (s.cash < 0) {
    s.outcome = "lost";
    s.reason = "bankrupt";
    s.msg = "現金流斷裂，銀行接管碼頭。";
    return s;
  }
  if (s.missed >= MAX_MISSED) {
    s.outcome = "lost";
    s.reason = "contracts";
    s.msg = `三次交約失敗，貨主聯合抵制 ${RIVAL_NAME} 趁勢取得特許。`;
    return s;
  }
  if (s.quarter > TOTAL_QUARTERS) {
    if (s.value > s.rival.value) {
      s.outcome = "won";
      s.reason = "market";
      s.msg = `第 ${TOTAL_QUARTERS} 季市值 ${s.value} 超越 ${RIVAL_NAME}（${s.rival.value}）！`;
    } else {
      s.outcome = "lost";
      s.reason = "market";
      s.msg = `${RIVAL_NAME} 以 ${s.rival.value} 市值勝出，港務特許歸對手。`;
    }
  }
  return s;
}

export function advanceQuarter(state) {
  const s = clone(state);
  s.refused = false;
  s.turn += 1;
  if (s.outcome !== "playing") return s;

  let next = receiveShipsFixed(s);
  const settled = settleContracts(next);
  next = settled.state;
  const up = upkeep(next);
  next.cash -= up;
  next.cash += Math.floor(next.routes.filter((r) => r.open).length * (next.freight / 25));
  next = recomputeValue(next);
  next = rivalTurn(next);
  next.history.push([next.value, next.rival.value]);
  next.quarter += 1;
  next.offers = generateOffers(next, 3);
  next.report = {
    quarter: next.quarter - 1,
    income: settled.income,
    penalties: settled.penalties,
    upkeep: up,
    cash: next.cash,
    value: next.value,
    rival: next.rival.value,
  };
  next = checkOutcome(next);
  if (next.outcome === "playing") {
    next.msg = `第 ${next.quarter - 1} 季結算完成。市值 ${next.value}，對手 ${next.rival.value}。`;
  }
  next.log.unshift(`── Q${next.quarter - 1} 結算：市庫 ${next.cash}，市值 ${next.value} vs ${next.rival.value} ──`);
  return next;
}

export function derive(state) {
  const stored = totalStored(state);
  return {
    capacity: totalCapacity(state),
    used: storageUsed(state),
    free: freeSpace(state),
    stored,
    openRoutes: state.routes.filter((r) => r.open).length,
    sailing: state.routes.filter((r) => r.ship === "sailing").length,
  };
}

export function summarize(state) {
  const d = derive(state);
  return {
    quarter: state.quarter,
    cash: state.cash,
    reputation: state.reputation,
    value: state.value,
    rival: state.rival.value,
    freight: state.freight,
    missed: state.missed,
    score: state.score,
    outcome: state.outcome,
    reason: state.reason,
    capacity: d.capacity,
    used: d.used,
    free: d.free,
    stored: d.stored,
    openRoutes: d.openRoutes,
    sailing: d.sailing,
    msg: state.msg,
  };
}

export function getOutcome(state) {
  return state.outcome;
}

export function routeInfo(state, routeId) {
  const route = state.routes.find((r) => r.id === routeId);
  const def = routeDef(routeId);
  if (!route || !def) return null;
  return {
    ...def,
    open: route.open,
    level: route.level,
    ship: route.ship,
    pending: route.pending,
    canOpen: !route.open && state.cash >= def.openCost,
    canUpgrade: route.open && route.level < 3 && state.cash >= def.upgradeCost,
    canDispatch: route.open && route.ship === "idle" && state.cash >= DISPATCH_COST,
  };
}

export function dockInfo(state, index) {
  const dock = state.docks[index];
  if (!dock) return null;
  const lvl = DOCK_LEVELS[dock.level];
  const next = DOCK_LEVELS[dock.level + 1] ?? null;
  const used = dock.stored.container * CARGO.container.unit
    + dock.stored.bulk * CARGO.bulk.unit
    + dock.stored.cold * CARGO.cold.unit;
  return {
    index,
    level: dock.level,
    capacity: lvl.capacity,
    used,
    stored: { ...dock.stored },
    canUpgrade: next !== null && state.cash >= next.cost,
    upgradeCost: next?.cost ?? null,
    nextCapacity: next?.capacity ?? null,
  };
}
