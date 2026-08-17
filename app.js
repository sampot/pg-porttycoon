import {
  CARGO,
  DISPATCH_COST,
  MAX_MISSED,
  RIVAL_NAME,
  ROUTE_DEFS,
  TOTAL_QUARTERS,
  acceptContract,
  advanceQuarter,
  createGame,
  derive,
  dispatchShip,
  dockInfo,
  openRoute,
  routeInfo,
  setFreightRate,
  summarize,
  upgradeDock,
  upgradeRoute,
} from "./game.js";
import { loadProgress, saveProgress } from "./persist.js";
import { GameAudio } from "./audio.js";

await window.PG.ready;

const $ = (q) => document.querySelector(q);
const audio = new GameAudio();

const map = $("#map");
const ctx = map.getContext("2d");

let state = createGame({ seed: Date.now() % 997 });
let best = 0;
let selected = { kind: null, id: null };
let anim = 0;
let autoTimer = null;
let wavePhase = 0;

const W = 390;
const H = 280;
map.width = W;
map.height = H;

const PORT = { x: W * 0.5, y: H * 0.78 };
const DOCK_Y = H * 0.86;
const DOCK_W = W / 7;

function hitDock(x, y) {
  if (y < DOCK_Y - 20 || y > H - 8) return null;
  const idx = Math.floor((x - DOCK_W * 0.5) / DOCK_W);
  if (idx < 0 || idx >= state.docks.length) return null;
  return idx;
}

function hitRoute(x, y) {
  for (const def of ROUTE_DEFS) {
    const angle = (def.dist - 0.5) * Math.PI * 0.85 - Math.PI / 2;
    const rx = PORT.x + Math.cos(angle) * (W * 0.38);
    const ry = PORT.y + Math.sin(angle) * (H * 0.42);
    if ((x - rx) ** 2 + (y - ry) ** 2 < 28 ** 2) return def.id;
  }
  return null;
}

async function save() {
  best = Math.max(best, state.score);
  try {
    await saveProgress({ state, best });
  } catch {
    setMessage("存檔同步失敗（仍可繼續玩）。", "bad");
  }
}

function setMessage(text, tone = "") {
  const el = $("#msg");
  el.textContent = text;
  el.className = `msg ${tone}`;
}

function chip(label, value, sub = "", tone = "") {
  return `<div class="chip ${tone}"><b>${label}</b><span>${value}</span>${sub ? `<i>${sub}</i>` : ""}</div>`;
}

function renderHud() {
  const v = summarize(state);
  const qLabel = v.quarter > TOTAL_QUARTERS ? "季末" : `Q${v.quarter}/${TOTAL_QUARTERS}`;
  const cashTone = v.cash < 15 ? "bad" : v.cash < 40 ? "warn" : "good";
  const valTone = v.value > v.rival ? "good" : v.value + 4 < v.rival ? "bad" : "warn";
  $("#hud").innerHTML = [
    chip("季別", qLabel, `${v.sailing} 艘在途`),
    chip("現金", v.cash, `運價 ${v.freight}%`, cashTone),
    chip("市值", v.value, `對手 ${v.rival}`, valTone),
    chip("倉儲", `${v.used}/${v.capacity}`, `空位 ${v.free}`, v.free < 2 ? "warn" : ""),
    chip("貨櫃", v.stored.container, CARGO.container.name),
    chip("散裝", v.stored.bulk, CARGO.bulk.name),
    chip("冷鏈", v.stored.cold, CARGO.cold.name),
    chip("信譽", v.reputation, `逾期 ${v.missed}/${MAX_MISSED}`, v.missed >= 2 ? "bad" : ""),
  ].join("");
}

function renderContracts() {
  const offers = $("#offers");
  offers.innerHTML = "";
  if (state.offers.length === 0) {
    offers.innerHTML = '<p class="meta" style="color:var(--dim);font-size:.85rem;margin:0">本季合約已被搶光，下季刷新。</p>';
  }
  for (const o of state.offers) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `contract ${o.type}`;
    b.innerHTML = `<div class="type">${CARGO[o.type].name} ×${o.qty}</div>`
      + `<div class="meta">第 ${o.deadline} 季前</div>`
      + `<div class="pay">$${o.payout}</div>`;
    b.onclick = () => apply(acceptContract(state, o.id), o.rival ? "error" : "build");
    offers.append(b);
  }
  const active = $("#active");
  active.innerHTML = "";
  for (const c of state.active) {
    const el = document.createElement("div");
    el.className = `contract active-card ${c.type}`;
    el.innerHTML = `<div class="type">進行中 ${CARGO[c.type].name}×${c.qty}</div>`
      + `<div class="meta">期限 Q${c.deadline} · $${c.payout}</div>`;
    active.append(el);
  }
}

function renderInspect() {
  const panel = $("#inspect");
  if (!selected.kind) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (selected.kind === "dock") {
    const info = dockInfo(state, selected.id);
    if (!info) { panel.hidden = true; return; }
    const acts = [];
    if (info.canUpgrade) {
      acts.push(`<button type="button" class="primary act-upgrade-dock">擴建 ($${info.upgradeCost})</button>`);
    }
    panel.innerHTML = `<h3>碼頭 ${info.index + 1} · Lv${info.level}</h3>`
      + `<ul><li>容量 ${info.used}/${info.capacity}</li>`
      + `<li>貨櫃 ${info.stored.container} · 散裝 ${info.stored.bulk} · 冷鏈 ${info.stored.cold}</li></ul>`
      + `<div class="acts">${acts.join("") || "<span style='color:var(--dim)'>已滿級或資金不足</span>"}</div>`;
    const btn = panel.querySelector(".act-upgrade-dock");
    if (btn) btn.onclick = () => apply(upgradeDock(state, info.index), "build");
    return;
  }
  if (selected.kind === "route") {
    const info = routeInfo(state, selected.id);
    if (!info) { panel.hidden = true; return; }
    const acts = [];
    if (!info.open) acts.push(`<button type="button" class="primary act-open">開闢 ($${info.openCost})</button>`);
    else {
      if (info.canUpgrade) acts.push(`<button type="button" class="act-upgrade">升級 ($${info.upgradeCost})</button>`);
      if (info.canDispatch) acts.push(`<button type="button" class="primary act-dispatch">派船 ($${DISPATCH_COST})</button>`);
      else if (info.ship === "sailing") acts.push(`<span style="color:var(--warn)">航行中…</span>`);
    }
    panel.innerHTML = `<h3>${info.name} 航線${info.open ? ` Lv${info.level}` : ""}</h3>`
      + `<ul><li>專運 ${CARGO[info.specialty].name}</li>`
      + `<li>每趟約 ${info.baseYield * Math.max(1, info.level)} 單位</li></ul>`
      + `<div class="acts">${acts.join("")}</div>`;
    const open = panel.querySelector(".act-open");
    const up = panel.querySelector(".act-upgrade");
    const disp = panel.querySelector(".act-dispatch");
    if (open) open.onclick = () => apply(openRoute(state, info.id), "ship");
    if (up) up.onclick = () => apply(upgradeRoute(state, info.id), "build");
    if (disp) disp.onclick = () => apply(dispatchShip(state, info.id), "ship");
  }
}

function renderReport() {
  const r = state.report;
  const box = $("#report");
  if (!r) {
    box.innerHTML = "<span>尚未結算。</span>";
  } else {
    box.innerHTML = [
      `<span>Q${r.quarter} 結算</span>`,
      `<span>交約 +${r.income}</span>`,
      `<span>罰款 −${r.penalties}</span>`,
      `<span>維護 −${r.upkeep}</span>`,
      `<span>市值 ${r.value} vs ${r.rival}</span>`,
    ].join("");
  }
  $("#log").innerHTML = state.log.slice(0, 24).map((line) => `<li>${line}</li>`).join("");
}

function drawSea() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1a5a7a");
  g.addColorStop(0.55, "#0d3b5c");
  g.addColorStop(1, "#082638");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    const y = 40 + i * 28 + Math.sin(wavePhase + i) * 4;
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 18) {
      ctx.lineTo(x, y + Math.sin(wavePhase * 1.2 + x * 0.04 + i) * 3);
    }
    ctx.stroke();
  }
}

function drawRouteLine(def, route) {
  const angle = (def.dist - 0.5) * Math.PI * 0.85 - Math.PI / 2;
  const rx = PORT.x + Math.cos(angle) * (W * 0.38);
  const ry = PORT.y + Math.sin(angle) * (H * 0.42);
  ctx.strokeStyle = route.open ? "rgba(72,202,228,0.55)" : "rgba(255,255,255,0.12)";
  ctx.lineWidth = route.open ? 2.5 : 1.5;
  ctx.setLineDash(route.open ? [] : [6, 6]);
  ctx.beginPath();
  ctx.moveTo(PORT.x, PORT.y - 10);
  ctx.lineTo(rx, ry);
  ctx.stroke();
  ctx.setLineDash([]);

  if (route.ship === "sailing") {
    const t = 0.35 + (Math.sin(anim * 0.04 + def.dist * 5) + 1) * 0.15;
    const sx = PORT.x + (rx - PORT.x) * t;
    const sy = PORT.y + (ry - PORT.y) * t - 8;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8);
    ctx.lineTo(sx + 10, sy + 6);
    ctx.lineTo(sx - 10, sy + 6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = route.open ? "#48cae4" : "#ffffff30";
  ctx.beginPath();
  ctx.arc(rx, ry, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = route.open ? "#061018" : "#eef6fb";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.name.slice(0, 2), rx, ry);

  if (selected.kind === "route" && selected.id === def.id) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry, 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  return { rx, ry };
}

function drawDock(i) {
  const x = DOCK_W * 0.5 + i * DOCK_W;
  const dock = state.docks[i];
  const info = dockInfo(state, i);
  const h = 18 + dock.level * 8;
  ctx.fillStyle = dock.level > 0 ? "#2a5570" : "#1a3348";
  ctx.fillRect(x - DOCK_W * 0.34, DOCK_Y - h, DOCK_W * 0.68, h);
  ctx.fillStyle = "#48cae4";
  ctx.fillRect(x - DOCK_W * 0.34, DOCK_Y - h, DOCK_W * 0.68, 4);

  const fill = info.used / Math.max(1, info.capacity);
  if (fill > 0) {
    ctx.fillStyle = `rgba(110,231,168,${0.25 + fill * 0.45})`;
    ctx.fillRect(x - DOCK_W * 0.3, DOCK_Y - h + 6, DOCK_W * 0.6, (h - 8) * fill);
  }

  ctx.fillStyle = "#eef6fb";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`L${dock.level}`, x, DOCK_Y - h - 6);

  if (selected.kind === "dock" && selected.id === i) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - DOCK_W * 0.36, DOCK_Y - h - 2, DOCK_W * 0.72, h + 4);
  }
}

function drawPort() {
  ctx.fillStyle = "#3d2917";
  ctx.beginPath();
  ctx.moveTo(PORT.x - 70, PORT.y + 20);
  ctx.lineTo(PORT.x + 70, PORT.y + 20);
  ctx.lineTo(PORT.x + 50, PORT.y - 8);
  ctx.lineTo(PORT.x - 50, PORT.y - 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#c9d6df";
  ctx.fillRect(PORT.x - 18, PORT.y - 38, 36, 30);
  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.arc(PORT.x + 28, PORT.y - 48, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eef6fb";
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("藍港", PORT.x, PORT.y - 52);
}

function renderMap() {
  drawSea();
  for (const def of ROUTE_DEFS) {
    const route = state.routes.find((r) => r.id === def.id);
    drawRouteLine(def, route);
  }
  drawPort();
  for (let i = 0; i < state.docks.length; i += 1) drawDock(i);

  const hist = state.history;
  if (hist.length > 1) {
    const last = hist.at(-1);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(8, 8, 110, 36);
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#48cae4";
    ctx.fillText(`你 ${last[0]}`, 14, 22);
    ctx.fillStyle = "#f07167";
    ctx.fillText(`${RIVAL_NAME} ${last[1]}`, 14, 36);
  }
}

function renderAll() {
  renderHud();
  renderMap();
  renderInspect();
  renderContracts();
  renderReport();
  setMessage(state.msg, state.refused ? "bad" : "");
  $("#next-q").disabled = state.outcome !== "playing";
  $("#auto").disabled = state.outcome !== "playing";
  $("#freight").value = String(state.freight);
  $("#freight-val").textContent = String(state.freight);
}

function apply(next, sound = "click") {
  const rejected = next.refused;
  state = next;
  audio.play(rejected ? "error" : sound, { volume: rejected ? 0.45 : 0.5 });
  void save();
  renderAll();
  if (state.outcome !== "playing") finish();
}

function cellFromEvent(e) {
  const rect = map.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

map.addEventListener("pointerdown", (e) => {
  const p = cellFromEvent(e);
  const dock = hitDock(p.x, p.y);
  if (dock !== null) {
    selected = { kind: "dock", id: dock };
    audio.play("click", { volume: 0.35 });
    renderAll();
    return;
  }
  const route = hitRoute(p.x, p.y);
  if (route) {
    selected = { kind: "route", id: route };
    audio.play("click", { volume: 0.35 });
    renderAll();
  }
});

$("#freight").addEventListener("change", (e) => {
  apply(setFreightRate(state, Number(e.target.value)), "click");
});

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  $("#auto").setAttribute("aria-pressed", "false");
  $("#auto").textContent = "▶ 自動";
}

function nextQuarter() {
  if (state.outcome !== "playing") return;
  state = advanceQuarter(state);
  audio.play("quarter", { volume: 0.45 });
  void save();
  renderAll();
  if (state.outcome !== "playing") finish();
}

$("#next-q").onclick = () => {
  stopAuto();
  nextQuarter();
};

$("#auto").onclick = () => {
  if (autoTimer) {
    stopAuto();
    setMessage("已暫停自動結算。");
    return;
  }
  autoTimer = setInterval(nextQuarter, 4500);
  $("#auto").setAttribute("aria-pressed", "true");
  $("#auto").textContent = "⏸ 暫停";
  setMessage("每 4.5 秒自動結算一季。");
};

let confirmResolve = null;
function askConfirm({ title, body, okLabel = "確定", cancelLabel = "取消" }) {
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-ok").textContent = okLabel;
  $("#confirm-cancel").textContent = cancelLabel;
  $("#confirm").hidden = false;
  $("#confirm-cancel").focus();
  return new Promise((resolve) => { confirmResolve = resolve; });
}
function closeConfirm(answer) {
  $("#confirm").hidden = true;
  const r = confirmResolve;
  confirmResolve = null;
  if (r) r(answer);
}
$("#confirm-ok").onclick = () => closeConfirm(true);
$("#confirm-cancel").onclick = () => closeConfirm(false);
$("#confirm").onclick = (e) => { if (e.target === $("#confirm")) closeConfirm(false); };

$("#quit").onclick = async () => {
  stopAuto();
  const ok = await askConfirm({
    title: "放棄這局？",
    body: "進度將重置，最佳市值仍保留。",
    okLabel: "確定放棄",
    cancelLabel: "繼續經營",
  });
  if (!ok) return;
  toLobby();
};

const OUTCOME = {
  market: ["市值決勝", "十二季後比誰的港務估值更高。"],
  bankrupt: ["現金流斷裂", "維護費與罰款耗盡資金。"],
  contracts: ["交約失信", `逾期達 ${MAX_MISSED} 次，貨主集體轉單給對手。`],
};

function finish() {
  stopAuto();
  const v = summarize(state);
  const won = state.outcome === "won";
  audio.play(won ? "win" : "lose", { volume: 0.55 });
  const [title, body] = won
    ? ["港務勝利！", state.msg]
    : OUTCOME[state.reason] ?? ["結束", state.msg];
  $("#overlay-title").textContent = title;
  $("#overlay-body").textContent = body;
  $("#overlay-stats").innerHTML = [
    ["市值", v.value],
    ["對手", v.rival],
    ["現金", v.cash],
    ["信譽", v.reputation],
    ["逾期", `${v.missed}/${MAX_MISSED}`],
    ["評分", v.score],
  ].map(([k, val]) => `<li><span>${k}</span><b>${val}</b></li>`).join("");
  const actions = $("#overlay-actions");
  actions.innerHTML = "";
  const again = document.createElement("button");
  again.className = "primary";
  again.textContent = "再經營一港";
  again.onclick = () => {
    $("#overlay").hidden = true;
    newGame();
    enterGame();
  };
  const lobby = document.createElement("button");
  lobby.className = "ghost";
  lobby.textContent = "回大廳";
  lobby.onclick = () => {
    $("#overlay").hidden = true;
    toLobby();
  };
  actions.append(again, lobby);
  $("#overlay").hidden = false;
  again.focus();
}

function newGame() {
  state = createGame({ seed: Date.now() % 997 });
  selected = { kind: null, id: null };
  stopAuto();
  setMessage(state.msg);
  void save();
  renderAll();
}

function enterGame() {
  $("#lobby").hidden = true;
  $("#game").hidden = false;
  renderAll();
}

function toLobby() {
  stopAuto();
  newGame();
  $("#game").hidden = true;
  $("#lobby").hidden = false;
  $("#best").textContent = best;
  $("#resume").hidden = true;
}

function suspend() {
  stopAuto();
  audio.suspend();
}

function resumeVisible() {
  audio.resume();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") suspend();
  else resumeVisible();
});
window.addEventListener("pagehide", suspend);

function tick() {
  anim += 1;
  wavePhase += 0.06;
  if (!$("#game").hidden) renderMap();
}

async function boot() {
  const saved = await loadProgress();
  best = saved.best ?? 0;
  $("#best").textContent = best;

  const resumable = saved.state?.outcome === "playing" && saved.state.quarter > 1;
  if (resumable) {
    $("#resume").hidden = false;
    $("#resume-q").textContent = saved.state.quarter;
    $("#resume").onclick = async () => {
      state = saved.state;
      selected = { kind: null, id: null };
      await audio.start();
      enterGame();
    };
  }

  $("#sound").onclick = () => {
    const on = $("#sound").getAttribute("aria-pressed") !== "true";
    $("#sound").setAttribute("aria-pressed", String(on));
    $("#sound").textContent = on ? "♫ 音效" : "♪ 靜音";
    audio.setEnabled(on);
  };

  $("#start").onclick = async () => {
    await audio.start();
    newGame();
    enterGame();
  };

  setInterval(tick, 120);
}

void boot();
