const CFG = window.LEAGUE_CONFIG;
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";

const fa = n => (typeof n === "number" ? n.toLocaleString("fa-IR", {maximumFractionDigits: 2}) : n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const toLatin = s => String(s).replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => AR.indexOf(d));
const $ = id => document.getElementById(id);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
};

let data = null, active = "total", openIdx = null, meIdx = null;
let graded = [], rankHist = new Map(), totalNow = null, totalPrev = null;

/* ---------- data ---------- */

function parseCSV(text){
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function toNum(v){
  const t = toLatin(v ?? "").trim().replace("٫", ".");
  if (t === "" || t.toLowerCase() === "null") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function slugFor(label, k){
  const m = toLatin(label).match(/(تمرین|پروژه)\s*(\d+)/);
  return m ? (m[1] === "تمرین" ? "hw" : "proj") + m[2] : "c" + k;
}

// A column is graded once any student has a non-zero score; inside it, empty = 0.
function buildData(rows){
  const head = rows[0].map(h => h.trim());
  const raw = rows.slice(1)
    .map(r => ({name: (r[0] || "").trim(), vals: head.slice(1).map((_, k) => toNum(r[k + 1]))}))
    .filter(s => s.name);
  const items = head.slice(1).map((label, k) => ({
    label, slug: slugFor(label, k),
    graded: raw.some(s => s.vals[k] != null && s.vals[k] !== 0)
  })).filter(it => it.label);
  const students = raw.map((s, i) => ({
    i, name: s.name,
    scores: items.map((it, k) => (it.graded ? s.vals[k] ?? 0 : null))
  }));
  return {items, students};
}

function rankBy(valueOf){
  const list = data.students.map(s => ({s, v: valueOf(s)})).filter(x => x.v != null);
  list.sort((a, b) => b.v - a.v || a.s.name.localeCompare(b.s.name, "fa"));
  const ranks = new Map();
  list.forEach((x, i) => ranks.set(x.s, i > 0 && x.v === list[i - 1].v ? ranks.get(list[i - 1].s) : i + 1));
  return {list, ranks};
}

const sumOf = (s, idxs) => idxs.reduce((t, i) => t + (s.scores[i] ?? 0), 0);

function prepare(){
  graded = data.items.map((it, i) => (it.graded ? i : -1)).filter(i => i >= 0);
  rankHist = new Map(data.students.map(s => [s, []]));
  let prev = null, now = null;
  graded.forEach((_, k) => {
    const idxs = graded.slice(0, k + 1);
    prev = now;
    now = rankBy(s => sumOf(s, idxs));
    data.students.forEach(s => rankHist.get(s).push(now.ranks.get(s)));
  });
  totalNow = now; totalPrev = prev;
}

function boardFor(key){
  if (key === "total") return {now: totalNow, prev: totalPrev, unit: "امتیاز کل", total: true};
  const idx = data.items.findIndex(it => it.slug === key);
  const pos = graded.indexOf(idx);
  const p = pos > 0 ? graded[pos - 1] : null;
  return {
    now: rankBy(s => s.scores[idx]),
    prev: p != null ? rankBy(s => s.scores[p]) : null,
    unit: data.items[idx].label, total: false
  };
}

const tierOf = rank => CFG.leaguePoints.find(t => rank >= t.ranks[0] && rank <= t.ranks[1]);

/* ---------- pieces ---------- */

function changeHTML(s, board){
  if (!board.prev) return '<span class="chg flat">—</span>';
  const d = board.prev.ranks.get(s) - board.now.ranks.get(s);
  if (d > 0) return `<span class="chg up" aria-label="${fa(d)} پله صعود">▲ ${fa(d)}</span>`;
  if (d < 0) return `<span class="chg down" aria-label="${fa(-d)} پله سقوط">▼ ${fa(-d)}</span>`;
  return '<span class="chg flat" aria-label="بدون تغییر">—</span>';
}

function trendSVG(s){
  const h = rankHist.get(s);
  if (h.length < 2) return '<svg class="trend" aria-hidden="true"></svg>';
  const lo = Math.min(...h), span = Math.max(8, Math.max(...h) - lo), mid = (lo + Math.max(...h)) / 2;
  const W = 56, H = 20, x = i => 3 + i * (W - 6) / (h.length - 1), y = r => H / 2 + (r - mid) / span * (H - 6);
  const pts = h.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  const last = h[h.length - 1], before = h[h.length - 2];
  const cls = last < before ? "up" : last > before ? "down" : "flat";
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="direction:ltr">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle class="end ${cls}" cx="${x(h.length - 1)}" cy="${y(last)}" r="2.6" fill="currentColor" style="color:var(--${cls})"/>
  </svg>`;
}

function detailHTML(s){
  const cells = graded.map(i => {
    const r = rankBy(x => x.scores[i]).ranks.get(s);
    return `<span class="cell"><small>${esc(data.items[i].label)}</small><b class="num">${fa(s.scores[i])}</b><small class="num">رتبه ${fa(r)}</small></span>`;
  }).join("");
  const mine = meIdx === s.i;
  return `<div class="detail">
    <div class="cells">${cells}</div>
    ${mine ? "" : `<button class="linkish" type="button" data-set-me="${s.i}">این منم — کارتم را بالای صفحه نشان بده</button>`}
  </div>`;
}

function rowHTML(x, board, inTop){
  const s = x.s, r = board.now.ranks.get(s), open = openIdx === s.i;
  const rankCell = inTop && r <= 3 ? `<span class="medal m${r}">${fa(r)}</span>` : fa(r);
  return `<div class="row${meIdx === s.i ? " is-me" : ""}">
    <button class="row-main" type="button" data-i="${s.i}" aria-expanded="${open}">
      <span class="rank num">${rankCell}</span>
      <span class="name">${esc(s.name)}</span>
      ${trendSVG(s)}
      <span class="score num">${fa(x.v)}</span>
      ${changeHTML(s, board)}
    </button>
    ${open ? detailHTML(s) : ""}
  </div>`;
}

/* ---------- sections ---------- */

function renderHeader(){
  $("title").innerHTML = `لیگ ${esc(CFG.course)} <span class="yr">${esc(CFG.year)}</span>`;
  $("footer-year").textContent = CFG.year;
  const n = data.items.length, g = graded.length;
  const pips = data.items.map(it => `<i class="pip${it.graded ? " on" : ""}"></i>`).join("");
  $("matchday").innerHTML = `<span class="pips" aria-hidden="true">${pips}</span><span><b class="num">${fa(g)}</b> از ${fa(n)} تمرین و پروژه نمره خورده</span>`;
}

function renderMe(){
  const el = $("me");
  const s = meIdx != null ? data.students[meIdx] : null;
  if (!s || !graded.length) {
    const opts = data.students.map(x => `<option value="${esc(x.name)}"></option>`).join("");
    el.innerHTML = `<form class="me-ask" id="me-form" autocomplete="off">
      <label for="me-input">من کجای جدولم؟</label>
      <div class="me-field">
        <input id="me-input" list="names" placeholder="اسم و فامیلت را بنویس" required>
        <button class="btn" type="submit">نشانم بده</button>
      </div>
      <datalist id="names">${opts}</datalist>
      <p class="hint" id="me-hint">این انتخاب فقط در همین مرورگر می‌ماند تا دفعه بعد لازم نباشد دوباره بنویسی.</p>
    </form>`;
    return;
  }

  const r = totalNow.ranks.get(s), list = totalNow.list;
  const mine = sumOf(s, graded);
  const lines = [`<span><b class="num">${fa(mine)}</b> امتیاز</span>`];
  const tier = tierOf(r);
  if (tier) lines.push(`<span class="lp">نمره لیگ فعلی: +${fa(tier.points)}</span>`);
  if (r === 1) {
    const second = list.find(x => x.v < mine);
    lines.push(second ? `<span>${fa(mine - second.v)} امتیاز جلوتر از نفر بعدی</span>` : "<span>صدرنشین</span>");
  } else {
    const above = [...list].reverse().find(x => x.v > mine);
    lines.push(`<span>${fa(above.v - mine)} امتیاز تا رتبه ${fa(totalNow.ranks.get(above.s))}</span>`);
  }
  if (r > CFG.topSize) {
    const cut = list.filter(x => totalNow.ranks.get(x.s) <= CFG.topSize).pop();
    if (cut) lines.push(`<span>${fa(cut.v - mine)} امتیاز تا ${fa(CFG.topSize)} نفر برتر</span>`);
  }
  const steps = graded.map((i, k) => `<span class="step"><span>${esc(data.items[i].label)}</span><b class="num">${fa(rankHist.get(s)[k])}</b></span>`).join("");

  el.innerHTML = `<div class="me-card">
    <div class="me-rank"><small>رتبه</small><b class="display num">${fa(r)}</b></div>
    <div class="me-name"><strong>${esc(s.name)}</strong>${changeHTML(s, {now: totalNow, prev: totalPrev})}</div>
    <div class="me-line">${lines.join("")}</div>
    <div class="me-foot">
      <div class="steps" aria-label="رتبه کلی بعد از هر تمرین">${steps}</div>
      <button class="linkish" type="button" id="me-clear">من نیستم</button>
    </div>
  </div>`;
}

function renderTabs(){
  const tabs = [{slug: "total", label: "مجموع", graded: true}, ...data.items];
  $("tabs").innerHTML = tabs.map(t =>
    `<button class="tab" role="tab" type="button" data-key="${t.slug}" aria-selected="${t.slug === active}"${t.graded ? "" : " data-pending"}>${esc(t.label)}${t.graded ? "" : '<span class="soon">به‌زودی</span>'}</button>`
  ).join("");
}

function renderBoard(animate){
  const el = $("board");
  el.classList.toggle("board-in", !!animate);
  const item = data.items.find(it => it.slug === active);
  if (!graded.length || (item && !item.graded)) {
    el.innerHTML = `<div class="empty">${item ? `برای «${esc(item.label)}» هنوز نمره‌ای ثبت نشده.` : "هنوز نمره‌ای ثبت نشده."}</div>`;
    return;
  }
  const board = boardFor(active);
  const rankOf = x => board.now.ranks.get(x.s);
  const top = board.now.list.filter(x => rankOf(x) <= CFG.topSize);
  const rest = board.now.list.filter(x => rankOf(x) > CFG.topSize);

  const groups = [];
  top.forEach(x => {
    const t = Math.ceil(rankOf(x) / 2);
    (groups[groups.length - 1]?.t === t ? groups[groups.length - 1].xs : (groups.push({t, xs: []}), groups[groups.length - 1].xs)).push(x);
  });
  const tiers = groups.map(g => {
    const tier = CFG.leaguePoints[g.t - 1];
    const a = g.t * 2 - 1, b = g.t * 2;
    const tag = board.total && tier
      ? `<b class="display num">+${fa(tier.points)}</b><small class="num">${fa(a)}–${fa(b)}</small>`
      : `<b class="display num">${fa(a)}–${fa(b)}</b><small>رتبه</small>`;
    return `<div class="tier"><div class="tier-tag">${tag}</div><div class="tier-rows">${g.xs.map(x => rowHTML(x, board, true)).join("")}</div></div>`;
  }).join("");

  const gap = top.length && rest.length ? top[top.length - 1].v - rest[0].v : null;
  el.innerHTML = `
    <section aria-labelledby="top-title">
      <div class="sec-head"><h2 class="display" id="top-title">${fa(CFG.topSize)} نفر برتر</h2><span>${board.total ? "عدد طلایی: نمره لیگ" : esc(board.unit)}</span></div>
      <div class="tiers">${tiers}</div>
    </section>
    ${rest.length ? `
    <div class="cutline">${gap ? `<span>نفر ${fa(CFG.topSize + 1)}ام <b class="num">${fa(gap)}</b> امتیاز با ${fa(CFG.topSize)} نفر برتر فاصله دارد</span>` : `<span>مرز ${fa(CFG.topSize)} نفر برتر</span>`}</div>
    <section aria-label="ادامه جدول">
      <div class="cols"><span>#</span><span>نام</span><span class="c-trend">مسیر</span><span>امتیاز</span><span>تغییر</span></div>
      <div class="table">${rest.map(x => rowHTML(x, board, false)).join("")}</div>
    </section>` : ""}`;
}

function renderGuide(){
  $("points").innerHTML = `<thead><tr><th>رتبه</th><th>ضریب</th><th>نمره</th></tr></thead><tbody>${
    CFG.leaguePoints.map(p => `<tr>
      <td>${p.medal ? `<span class="emoji" aria-hidden="true">${p.medal}</span> ` : ""}نفر ${fa(p.ranks[0])} و ${fa(p.ranks[1])}</td>
      <td class="num">${fa(p.percent)}٪</td>
      <td class="num"><b>${fa(p.points)}</b></td>
    </tr>`).join("")}</tbody>`;
  $("checkpoints").innerHTML = CFG.checkpoints.map(c => {
    const known = c.points != null;
    return `<div class="cp${known ? "" : " pending"}">
      <div><div class="cp-title">${esc(c.title)}</div>${c.date || c.note ? `<div class="cp-meta">${esc([c.date, c.note].filter(Boolean).join(" · "))}</div>` : ""}</div>
      <div class="cp-value num">${known ? fa(c.points) + " نمره" : "به‌زودی اعلام می‌شود"}</div>
    </div>`;
  }).join("");
}

function renderAll(animate){
  renderMe(); renderTabs(); renderBoard(animate);
}

/* ---------- load ---------- */

const fmtDate = d => new Date(d).toLocaleString("fa-IR", {dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran"});

// Last commit that touched scores.csv; falls back to the Pages Last-Modified header.
async function showUpdated(fallback){
  try {
    const res = await fetch(`https://api.github.com/repos/${CFG.repo}/commits?path=docs/scores.csv&per_page=1`);
    if (!res.ok) throw new Error(res.status);
    const [c] = await res.json();
    $("updated").textContent = fmtDate(c.commit.committer.date);
  } catch (err) {
    $("updated").textContent = fallback ? fmtDate(fallback) : "—";
  }
}

async function load(){
  let res;
  try {
    res = await fetch("scores.csv?t=" + Date.now());
    if (!res.ok) throw new Error(res.status);
    data = buildData(parseCSV(await res.text()));
  } catch (err) {
    $("board").innerHTML = '<div class="empty">فایل نمره‌ها خوانده نشد. چند دقیقه دیگر دوباره امتحان کنید.</div>';
    return;
  }
  prepare();
  showUpdated(res.headers.get("last-modified"));
  const saved = store.get("me-name");
  const hit = saved && data.students.find(s => s.name === saved);
  meIdx = hit ? hit.i : null;
  const h = location.hash.slice(1);
  if (h === "total" || data.items.some(it => it.slug === h && it.graded)) active = h;
  renderHeader(); renderGuide(); renderAll(false);
}

function setMe(i){
  meIdx = i;
  store.set("me-name", i == null ? null : data.students[i].name);
  renderMe(); renderBoard(false);
}

/* ---------- events ---------- */

$("tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab"); if (!b) return;
  active = b.dataset.key; openIdx = null;
  try { window.history.replaceState(null, "", "#" + active); } catch (err) {}
  renderTabs(); renderBoard(true);
  document.querySelector(`.tab[data-key="${active}"]`)?.scrollIntoView({inline: "nearest", block: "nearest"});
});

$("board").addEventListener("click", e => {
  const setBtn = e.target.closest("[data-set-me]");
  if (setBtn) { setMe(+setBtn.dataset.setMe); window.scrollTo({top: 0, behavior: "smooth"}); return; }
  const r = e.target.closest(".row-main"); if (!r) return;
  const i = +r.dataset.i;
  openIdx = openIdx === i ? null : i;
  renderBoard(false);
});

$("me").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("me-input").value.trim();
  const exact = data.students.find(s => s.name === q);
  const partial = data.students.filter(s => s.name.includes(q));
  const hit = exact || (partial.length === 1 ? partial[0] : null);
  if (hit) setMe(hit.i);
  else $("me-hint").textContent = partial.length > 1
    ? "چند نفر با این اسم پیدا شدند؛ اسم کامل را از فهرست انتخاب کن."
    : "این اسم در جدول پیدا نشد. املای اسم را چک کن.";
});

$("me").addEventListener("click", e => {
  if (e.target.id === "me-clear") setMe(null);
});

$("theme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme")
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  store.set("theme", next);
});

load();
