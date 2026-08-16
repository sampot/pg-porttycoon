/** pg-porttycoon — 港口大亨 (大亨／產業鏈) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1 } = {}) {
  return { seed, turn: 0, score: 0, level: 1, meter: 0, resources: 10, flags: {}, log: ["港口大亨：航線"], outcome: "playing", msg: "港口大亨：航線" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["route","warehouse","contract","undercut"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.turn * 19);
  s.turn++;
  
  s.flags.cargo = s.flags.cargo ?? 0;
  s.flags.rival = s.flags.rival ?? 50;
  if (action === "route") { s.flags.cargo += 3; s.resources += 2; s.msg = "開航線"; }
  else if (action === "warehouse") { s.resources -= 3; s.flags.cap = (s.flags.cap||5)+3; s.msg = "擴倉"; }
  else if (action === "contract") { s.score += 40; s.meter += 15; s.flags.cargo = Math.max(0, s.flags.cargo-2); s.msg = "完成合約"; }
  else { s.flags.rival -= 8; s.resources -= 2; s.msg = "削價搶市"; }
  if (s.flags.rival <= 0) { s.level = 5; s.meter = 100; s.msg = "對手出局你稱霸"; }

  if (s.resources < 0) s.resources = 0;
  if (s.outcome === "playing" && s.level >= 5 && s.meter >= 100) {
    s.outcome = "won";
    s.msg = "目標達成！";
  }
  if (s.outcome === "playing" && (s.resources <= 0 && s.meter < 20 && s.turn > 8)) {
    s.outcome = "lost";
    s.msg = "資源崩盤";
  }
  return s;
}
export function summarize(s) {
  return { turn: s.turn, level: s.level, meter: s.meter, score: s.score, resources: s.resources, msg: s.msg, outcome: s.outcome, flags: s.flags };
}
export function getOutcome(s) { return s.outcome; }

