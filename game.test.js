import { describe, expect, it } from "vitest";

import {
  CARGO,
  DISPATCH_COST,
  DOCK_COUNT,
  DOCK_LEVELS,
  MAX_MISSED,
  ROUTE_DEFS,
  START_CASH,
  TOTAL_QUARTERS,
  acceptContract,
  advanceQuarter,
  checkOutcome,
  createGame,
  derive,
  dispatchShip,
  dockInfo,
  freeSpace,
  generateOffers,
  getOutcome,
  openRoute,
  routeInfo,
  setFreightRate,
  settleContracts,
  storageUsed,
  storeCargo,
  summarize,
  takeCargo,
  totalCapacity,
  totalStored,
  upgradeDock,
  upgradeRoute,
} from "./game.js";

const rich = (s, cash = 500) => ({ ...structuredClone(s), cash });

describe("初始局面", () => {
  it("有六格碼頭、起始資金與三份合約", () => {
    const s = createGame({ seed: 3 });
    expect(s.docks).toHaveLength(DOCK_COUNT);
    expect(s.cash).toBe(START_CASH);
    expect(s.quarter).toBe(1);
    expect(s.offers.length).toBeGreaterThanOrEqual(2);
    expect(getOutcome(s)).toBe("playing");
  });

  it("四條航線一開始都未開闢", () => {
    const s = createGame({ seed: 1 });
    expect(s.routes.every((r) => !r.open)).toBe(true);
    expect(ROUTE_DEFS).toHaveLength(4);
  });
});

describe("倉儲", () => {
  it("空港容量為零", () => {
    const s = createGame();
    expect(totalCapacity(s)).toBe(0);
    expect(freeSpace(s)).toBe(0);
  });

  it("升級碼頭增加容量並扣款", () => {
    let s = createGame({ seed: 2 });
    s = upgradeDock(s, 0);
    expect(s.refused).toBe(false);
    expect(s.docks[0].level).toBe(1);
    expect(totalCapacity(s)).toBe(DOCK_LEVELS[1].capacity);
    expect(s.cash).toBeLessThan(START_CASH);
  });

  it("storeCargo 依單位占用塞貨", () => {
    let s = createGame();
    s.docks[0].level = 2;
    const { state, spill } = storeCargo(s, { container: 2, bulk: 0, cold: 0 });
    expect(spill).toBe(0);
    expect(totalStored(state).container).toBe(2);
    expect(storageUsed(state)).toBe(2 * CARGO.container.unit);
  });

  it("容量不足時溢貨", () => {
    let s = createGame();
    s.docks[0].level = 1;
    const { spill } = storeCargo(s, { container: 5, bulk: 0, cold: 0 });
    expect(spill).toBeGreaterThan(0);
  });

  it("takeCargo 在庫存足夠時扣貨", () => {
    let s = createGame();
    s.docks[0].level = 2;
    s = storeCargo(s, { container: 3, bulk: 0, cold: 0 }).state;
    const out = takeCargo(s, { container: 2, bulk: 0, cold: 0 });
    expect(out).not.toBeNull();
    expect(totalStored(out).container).toBe(1);
  });
});

describe("航線", () => {
  it("開闢航線後可派船", () => {
    let s = rich(createGame({ seed: 5 }), 200);
    s = openRoute(s, "shanghai");
    expect(s.routes.find((r) => r.id === "shanghai").open).toBe(true);
    s = dispatchShip(s, "shanghai");
    expect(s.refused).toBe(false);
    expect(s.routes.find((r) => r.id === "shanghai").ship).toBe("sailing");
    expect(s.cash).toBeLessThan(200 - ROUTE_DEFS[1].openCost);
  });

  it("資金不足時拒絕開闢", () => {
    let s = createGame();
    s.cash = 15;
    const out = openRoute(s, "la");
    expect(out.refused).toBe(true);
    expect(out.routes.find((r) => r.id === "la").open).toBe(false);
  });

  it("同一航線不能重複派船", () => {
    let s = rich(createGame(), 300);
    s = openRoute(s, "tokyo");
    s = dispatchShip(s, "tokyo");
    const again = dispatchShip(s, "tokyo");
    expect(again.refused).toBe(true);
  });

  it("升級航線提高等級", () => {
    let s = rich(createGame(), 300);
    s = openRoute(s, "tokyo");
    s = upgradeRoute(s, "tokyo");
    expect(s.routes.find((r) => r.id === "tokyo").level).toBe(2);
  });

  it("routeInfo 反映可操作狀態", () => {
    let s = rich(createGame(), 300);
    const closed = routeInfo(s, "tokyo");
    expect(closed.canOpen).toBe(true);
    s = openRoute(s, "tokyo");
    const open = routeInfo(s, "tokyo");
    expect(open.canDispatch).toBe(true);
    expect(open.canOpen).toBeFalsy();
  });
});

describe("合約", () => {
  it("可承接合約並移出牌列", () => {
    let s = createGame({ seed: 9 });
    const id = s.offers[0].id;
    s = acceptContract(s, id);
    expect(s.refused).toBe(false);
    expect(s.active.some((c) => c.id === id)).toBe(true);
    expect(s.offers.some((c) => c.id === id)).toBe(false);
  });

  it("庫存足夠時 settle 交約收款", () => {
    let s = createGame({ seed: 11 });
    const offer = s.offers[0];
    s = acceptContract(s, offer.id);
    s.docks[0].level = 3;
    s.docks[1].level = 3;
    s = storeCargo(s, { container: offer.type === "container" ? offer.qty : 0, bulk: offer.type === "bulk" ? offer.qty : 0, cold: offer.type === "cold" ? offer.qty : 0 }).state;
    const cashBefore = s.cash;
    const { state, income } = settleContracts(s);
    expect(income).toBeGreaterThan(0);
    expect(state.cash).toBeGreaterThan(cashBefore);
    expect(state.active).toHaveLength(0);
  });

  it("逾期合約計入 missed", () => {
    let s = createGame({ seed: 4 });
    s.active = [{
      id: "x", type: "bulk", qty: 2, deadline: 1, payout: 20, acceptedQ: 1,
    }];
    s.quarter = 2;
    const { state } = settleContracts(s);
    expect(state.missed).toBe(1);
  });

  it("generateOffers 高運價時較少被對手搶", () => {
    const low = generateOffers({ ...createGame({ seed: 1 }), freight: 85, quarter: 2, seed: 1 }, 5);
    const high = generateOffers({ ...createGame({ seed: 1 }), freight: 118, quarter: 2, seed: 1 }, 5);
    expect(low.length).toBeGreaterThanOrEqual(high.length);
  });
});

describe("季度結算", () => {
  it("advanceQuarter 推進季別並產生新合約", () => {
    let s = rich(createGame({ seed: 6 }), 400);
    s = openRoute(s, "shanghai");
    s = dispatchShip(s, "shanghai");
    const q0 = s.quarter;
    s = advanceQuarter(s);
    expect(s.quarter).toBe(q0 + 1);
    expect(s.report).toBeTruthy();
    expect(s.history.length).toBeGreaterThan(1);
    expect(s.offers.length).toBeGreaterThan(0);
  });

  it("派船返港後倉儲增加貨物", () => {
    let s = rich(createGame({ seed: 8 }), 400);
    s.docks[0].level = 2;
    s = openRoute(s, "shanghai");
    s = dispatchShip(s, "shanghai");
    s = advanceQuarter(s);
    expect(totalStored(s).bulk).toBeGreaterThan(0);
  });

  it("連續結算十二季後判定勝敗", () => {
    let s = rich(createGame({ seed: 12 }), 9999);
    for (let i = 0; i < TOTAL_QUARTERS; i += 1) {
      if (s.outcome !== "playing") break;
      s = openRoute(s, ROUTE_DEFS[i % 4].id);
      s = dispatchShip(s, ROUTE_DEFS[i % 4].id);
      s = upgradeDock(s, i % DOCK_COUNT);
      s = advanceQuarter(s);
    }
    while (s.quarter <= TOTAL_QUARTERS && s.outcome === "playing") {
      s = advanceQuarter(s);
    }
    expect(["won", "lost"]).toContain(s.outcome);
  });
});

describe("勝敗與運價", () => {
  it("現金為負時破產", () => {
    let s = createGame();
    s.cash = -1;
    s = checkOutcome(s);
    expect(s.outcome).toBe("lost");
    expect(s.reason).toBe("bankrupt");
  });

  it("逾期達上限落敗", () => {
    let s = createGame();
    s.missed = MAX_MISSED;
    s = checkOutcome(s);
    expect(s.outcome).toBe("lost");
    expect(s.reason).toBe("contracts");
  });

  it("setFreightRate 限制在 80–120", () => {
    let s = createGame();
    s = setFreightRate(s, 200);
    expect(s.freight).toBe(120);
    s = setFreightRate(s, 50);
    expect(s.freight).toBe(80);
  });

  it("derive 與 summarize 一致", () => {
    let s = rich(createGame(), 200);
    s = upgradeDock(s, 0);
    const d = derive(s);
    const sum = summarize(s);
    expect(sum.capacity).toBe(d.capacity);
    expect(sum.free).toBe(d.free);
  });

  it("dockInfo 顯示升級費用", () => {
    const s = createGame();
    const info = dockInfo(s, 2);
    expect(info.index).toBe(2);
    expect(info.canUpgrade).toBe(s.cash >= DOCK_LEVELS[1].cost);
  });
});

describe("可重現性", () => {
  it("相同 seed 的合約牌一致", () => {
    const a = createGame({ seed: 42 });
    const b = createGame({ seed: 42 });
    expect(a.offers.map((o) => o.type)).toEqual(b.offers.map((o) => o.type));
    expect(a.offers.map((o) => o.qty)).toEqual(b.offers.map((o) => o.qty));
  });
});
