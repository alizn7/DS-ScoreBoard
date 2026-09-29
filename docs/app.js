const CFG = window.LEAGUE_CONFIG;
const FORM_LENGTH = 5;
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹", AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const fa = n => (typeof n === "number" ? n.toLocaleString("fa-IR", {maximumFractionDigits: 2}) : n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const toLatin = s => String(s).replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));

let data = null, active = "total", openName = null;

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

// A column counts as graded once any student has a non-zero score in it.
// Inside a graded column, an empty cell means 0.
function buildData(rows){
  const head = rows[0].map(h => h.trim());
  const raw = rows.slice(1)
    .map(r => ({name: (r[0] || "").trim(), vals: head.slice(1).map((_, k) => toNum(r[k + 1]))}))
    .filter(s => s.name);
  const items = head.slice(1).map((label, k) => ({
    label, slug: slugFor(label, k),
    graded: raw.some(s => s.vals[k] != null && s.vals[k] !== 0)
  })).filter(it => it.label);
  const students = raw.map(s => ({
    name: s.name,
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

const gradedIdx = () => data.items.map((it, i) => (it.graded ? i : -1)).filter(i => i >= 0);
const sumOf = (s, idxs) => idxs.reduce((t, i) => t + (s.scores[i] ?? 0), 0);

function computeBoard(){
  const graded = gradedIdx();
  if (active === "total") {
    const prevIdx = graded.slice(0, -1);
    return {
      now: rankBy(s => sumOf(s, graded)),
      prev: prevIdx.length ? rankBy(s => sumOf(s, prevIdx)) : null,
      unit: "امتیاز کل"
    };
  }
  const idx = data.items.findIndex(it => it.slug === active);
  const pos = graded.indexOf(idx);
  const prevIdx = pos > 0 ? graded[pos - 1] : null;
  return {
    now: rankBy(s => s.scores[idx]),
    prev: prevIdx != null ? rankBy(s => s.scores[prevIdx]) : null,
    unit: data.items[idx].label
  };
}

let formCache = null;
function formFor(s){
  if (!formCache) {
    formCache = gradedIdx().slice(-FORM_LENGTH).map(i => ({
      i, label: data.items[i].label,
      vals: data.students.map(x => x.scores[i]).sort((a, b) => b - a)
    }));
  }
  return formCache.map(({i, label, vals}) => {
    const v = s.scores[i];
    const p = vals.indexOf(v) / Math.max(1, vals.length - 1);
    return {cls: p <= 1 / 3 ? "d-hi" : p <= 2 / 3 ? "d-mid" : "d-lo", tip: label + ": " + fa(v)};
  });
}

function changeHTML(s, board){
  if (!board.prev) return '<span class="chg flat">—</span>';
  const d = board.prev.ranks.get(s) - board.now.ranks.get(s);
  if (d > 0) return `<span class="chg up" aria-label="${fa(d)} پله صعود">▲ ${fa(d)}</span>`;
  if (d < 0) return `<span class="chg down" aria-label="${fa(-d)} پله سقوط">▼ ${fa(-d)}</span>`;
  return '<span class="chg flat" aria-label="بدون تغییر">—</span>';
}

function detailHTML(s){
  return '<span class="detail">' + gradedIdx().map(i => {
    const r = rankBy(x => x.scores[i]).ranks.get(s);
    return `<span class="cell"><small>${esc(data.items[i].label)}</small><b class="num">${fa(s.scores[i])}</b><small class="num">رتبه ${fa(r)}</small></span>`;
  }).join("") + "</span>";
}

function rowHTML(x, board, isTop){
  const s = x.s, r = board.now.ranks.get(s);
  const q = document.getElementById("me").value.trim();
  const open = openName === s.name;
  return `<button type="button" class="row${q && s.name.includes(q) ? " me" : ""}" data-name="${esc(s.name)}" aria-expanded="${open}">
    <span class="rank num">${isTop && r <= 3 ? `<span class="medal m${r}">${fa(r)}</span>` : fa(r)}</span>
    <span class="who"><span class="name">${esc(s.name)}</span><span class="form" title="فرم اخیر">${formFor(s).map(f => `<i class="dot ${f.cls}" title="${esc(f.tip)}"></i>`).join("")}</span></span>
    <span class="score num">${fa(x.v)}</span>
    ${changeHTML(s, board)}
    ${open ? detailHTML(s) : ""}
  </button>`;
}

function renderBoard(){
  const tabs = [{slug: "total", label: "مجموع", graded: true}, ...data.items];
  document.getElementById("tabs").innerHTML = tabs.map(t =>
    `<button class="tab" role="tab" type="button" data-key="${t.slug}" aria-selected="${t.slug === active}">${esc(t.label)}${t.graded ? "" : '<span class="soon">به‌زودی</span>'}</button>`
  ).join("");

  const el = document.getElementById("board");
  const item = data.items.find(it => it.slug === active);
  if (!gradedIdx().length || (item && !item.graded)) {
    el.innerHTML = `<div class="empty">${item ? `برای «${esc(item.label)}» هنوز نمره‌ای ثبت نشده.` : "هنوز نمره‌ای ثبت نشده."}</div>`;
    return;
  }
  const board = computeBoard();
  const top = board.now.list.filter(x => board.now.ranks.get(x.s) <= CFG.topSize);
  const rest = board.now.list.filter(x => board.now.ranks.get(x.s) > CFG.topSize);
  const gap = top.length && rest.length ? top[top.length - 1].v - rest[0].v : null;

  el.innerHTML = `
    <section class="top12" aria-label="${fa(CFG.topSize)} نفر برتر">
      <div class="top12-head"><h2>${fa(CFG.topSize)} نفر برتر</h2><span>${esc(board.unit)}</span></div>
      <div class="rows">${top.map(x => rowHTML(x, board, true)).join("")}</div>
    </section>
    ${rest.length ? `<div class="cutline">${gap ? `${fa(gap)} امتیاز تا ورود به جمع ${fa(CFG.topSize)} نفر` : "مرز " + fa(CFG.topSize) + " نفر برتر"}</div>
    <section class="rest" aria-label="سایر دانشجویان"><div class="rows">${rest.map(x => rowHTML(x, board, false)).join("")}</div></section>` : ""}`;
}

function renderGuide(){
  const rows = CFG.leaguePoints.map(p => `<tr>
    <td>${p.medal ? `<span class="emoji" aria-hidden="true">${p.medal}</span> ` : ""}نفر ${fa(p.ranks[0])} و ${fa(p.ranks[1])}</td>
    <td class="num">${fa(p.percent)}٪</td>
    <td class="num"><b>${fa(p.points)}</b></td>
  </tr>`).join("");
  document.getElementById("points").innerHTML =
    `<thead><tr><th>رتبه</th><th>ضریب</th><th>نمره</th></tr></thead><tbody>${rows}</tbody>`;

  document.getElementById("checkpoints").innerHTML = CFG.checkpoints.map(c => {
    const known = c.points != null;
    return `<div class="cp${known ? "" : " cp-pending"}">
      <div class="cp-title">${esc(c.title)}</div>
      <div class="cp-value num">${known ? fa(c.points) + " نمره" : "به‌زودی اعلام می‌شود"}</div>
      ${c.date ? `<div class="cp-meta">${esc(c.date)}</div>` : ""}
      ${c.note ? `<p class="cp-note">${esc(c.note)}</p>` : ""}
    </div>`;
  }).join("");
}

const fmtDate = d => new Date(d).toLocaleString("fa-IR", {dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran"});

// Last commit that touched scores.csv; falls back to the Pages Last-Modified header.
async function showUpdated(fallback){
  const el = document.getElementById("updated");
  try {
    const res = await fetch(`https://api.github.com/repos/${CFG.repo}/commits?path=docs/scores.csv&per_page=1`);
    if (!res.ok) throw new Error(res.status);
    const [c] = await res.json();
    el.textContent = fmtDate(c.commit.committer.date);
  } catch (err) {
    el.textContent = fallback ? fmtDate(fallback) : "—";
  }
}

async function load(){
  const el = document.getElementById("board");
  let res;
  try {
    res = await fetch("scores.csv?t=" + Date.now());
    if (!res.ok) throw new Error(res.status);
    data = buildData(parseCSV(await res.text()));
  } catch (err) {
    el.innerHTML = '<div class="empty">فایل نمره‌ها خوانده نشد. چند دقیقه دیگر دوباره امتحان کنید.</div>';
    return;
  }
  showUpdated(res.headers.get("last-modified"));
  formCache = null;
  const h = location.hash.slice(1);
  if (h && (h === "total" || data.items.some(it => it.slug === h))) active = h;
  renderBoard();
}

function currentTheme(){
  const t = document.documentElement.getAttribute("data-theme");
  return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
document.getElementById("theme").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (err) {}
});

document.getElementById("title").innerHTML = `${esc(CFG.course)} <span class="year">${esc(CFG.year)}</span>`;
document.title = "لیگ " + CFG.course;

document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab"); if (!b) return;
  active = b.dataset.key; openName = null;
  try { history.replaceState(null, "", "#" + active); } catch (err) {}
  renderBoard();
  document.querySelector(`.tab[data-key="${active}"]`)?.scrollIntoView({inline: "nearest", block: "nearest"});
});

document.getElementById("board").addEventListener("click", e => {
  const r = e.target.closest(".row"); if (!r) return;
  openName = openName === r.dataset.name ? null : r.dataset.name;
  renderBoard();
});

document.getElementById("me").addEventListener("input", () => {
  renderBoard();
  document.querySelector(".row.me")?.scrollIntoView({block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
});

renderGuide();
load();
