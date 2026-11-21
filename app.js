"use strict";
/* 暗記クラフト エンジン
   データ: data/index.json + data/<rangeId>.json（範囲ごとに分離）
   進捗・所持素材・制作済みアイテムは localStorage に保存する。 */

const LS_KEY = "ankiCraft.v1";
const SESSION_SIZE = 10;
const MASTER_STREAK = 2;

const app = document.getElementById("app");
const btnHome = document.getElementById("btn-home");
btnHome.addEventListener("click", () => renderRanges());

function loadStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch (e) { return {}; }
}
let store = loadStore();
store.progress = store.progress || {};   // {rangeId: {cardId: {s: streak, m: 1}}}
store.inventory = store.inventory || {}; // {rangeId: {catId: count}}
store.crafted = store.crafted || {};     // {rangeId: [itemName]}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function toast(html) {
  const t = document.getElementById("toast");
  t.innerHTML = `<span class="toast-item">${html}</span>`;
  setTimeout(() => { t.innerHTML = ""; }, 1150);
}
async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

let rangeIndex = [];
let current = null; // 読み込み済みの範囲データ

function prog(rangeId) { return store.progress[rangeId] || {}; }
function masteredCount(rangeId) {
  return Object.values(prog(rangeId)).filter(p => p.m).length;
}
function inv(rangeId) { store.inventory[rangeId] = store.inventory[rangeId] || {}; return store.inventory[rangeId]; }
function catOf(range, catId) {
  for (const s of range.subjects) for (const c of s.categories) if (c.id === catId) return c;
  return null;
}
function allEntries(range) {
  const out = [];
  for (const s of range.subjects) for (const c of s.categories)
    for (const card of c.cards) out.push({ card, cat: c, subject: s.name });
  return out;
}

/* ---------- 範囲選択 ---------- */
async function renderRanges() {
  btnHome.style.display = "none";
  current = null;
  if (!rangeIndex.length) {
    try { rangeIndex = await fetchJSON("data/index.json"); }
    catch (e) { app.innerHTML = `<div class="panel">データが読み込めませんでした。</div>`; return; }
  }
  let html = ``;
  for (const r of rangeIndex) {
    const m = masteredCount(r.id);
    const pct = r.totalCards ? Math.round(100 * m / r.totalCards) : 0;
    html += `<div class="panel">
      <h2>${esc(r.title)}</h2>
      <p class="sub">${esc(r.subjects.join("・"))} ／ カード ${r.totalCards} 枚</p>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <p class="sub">覚えたカード： ${m} / ${r.totalCards}（${pct}%）</p>
      <button class="btn big" data-range="${esc(r.id)}">PLAY</button>
    </div>`;
  }
  app.innerHTML = html;
  app.querySelectorAll("[data-range]").forEach(b =>
    b.addEventListener("click", () => openRange(b.dataset.range)));
}

async function openRange(id) {
  app.innerHTML = `<p class="loading">読み込み中…</p>`;
  try { current = await fetchJSON(`data/${id}.json`); }
  catch (e) { app.innerHTML = `<div class="panel">範囲データが読み込めませんでした。</div>`; return; }
  renderCats();
}

/* ---------- 科目・カテゴリ選択 ---------- */
function renderCats() {
  btnHome.style.display = "";
  const r = current, p = prog(r.id), iv = inv(r.id);
  const total = allEntries(r).length, m = masteredCount(r.id);
  let html = `<div class="panel">
    <h2>${esc(r.title)}</h2>
    <div class="bar"><div style="width:${total ? Math.round(100 * m / total) : 0}%"></div></div>
    <p class="sub">覚えたカード： ${m} / ${total}</p>
    <button class="btn sub2" id="btn-craft">🔨 クラフト・図鑑を見る</button>
    <button class="btn ghost small" id="btn-all">範囲ぜんぶ（ミックス）</button>
  </div>`;
  for (const s of r.subjects) {
    html += `<div class="panel"><h3>${esc(s.name)}</h3>`;
    for (const c of s.categories) {
      const done = c.cards.filter(cd => (p[cd.id] || {}).m).length;
      html += `<div class="cat-row">
        <div class="cat-name">${esc(c.material.icon)} ${esc(c.name)}</div>
        <div class="cat-meta">素材：${esc(c.material.name)}（所持 ${iv[c.id] || 0}）／ 覚えた ${done} / ${c.cards.length}</div>
        <div class="cat-btns">
          <button class="btn small" data-cat="${esc(c.id)}" data-mode="flip">暗記カード</button>
          <button class="btn small sub2" data-cat="${esc(c.id)}" data-mode="choice">4択</button>
        </div>
      </div>`;
    }
    html += `<div class="cat-row"><div class="cat-name">📚 ${esc(s.name)} 全部ミックス</div>
      <div class="cat-btns">
        <button class="btn small" data-subj="${esc(s.name)}" data-mode="flip">暗記カード</button>
        <button class="btn small sub2" data-subj="${esc(s.name)}" data-mode="choice">4択</button>
      </div></div>`;
    html += `</div>`;
  }
  html += `<div class="panel"><button class="btn ghost small" id="btn-reset">この範囲の記録をリセット</button></div>`;
  app.innerHTML = html;
  app.querySelector("#btn-craft").addEventListener("click", renderCraft);
  app.querySelector("#btn-all").addEventListener("click", () =>
    startSession(allEntries(r), "flip", "範囲ぜんぶ"));
  app.querySelector("#btn-reset").addEventListener("click", () => {
    if (confirm("この範囲の記録（覚えたカード・素材・アイテム）を消します。よいですか？")) {
      delete store.progress[r.id]; delete store.inventory[r.id]; delete store.crafted[r.id];
      save(); renderCats();
    }
  });
  app.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
    const cat = catOf(r, b.dataset.cat);
    startSession(cat.cards.map(cd => ({ card: cd, cat, subject: "" })), b.dataset.mode, cat.name);
  }));
  app.querySelectorAll("[data-subj]").forEach(b => b.addEventListener("click", () => {
    const subj = r.subjects.find(x => x.name === b.dataset.subj);
    const pool = [];
    for (const c of subj.categories) for (const cd of c.cards) pool.push({ card: cd, cat: c, subject: subj.name });
    startSession(pool, b.dataset.mode, subj.name + " 全部");
  }));
}

/* ---------- 学習セッション ---------- */
let session = null;
function pickDeck(pool, rangeId) {
  const p = prog(rangeId);
  const scored = pool.map(e => {
    const pr = p[e.card.id] || { s: 0, m: 0 };
    return { e, key: (pr.m ? 100 : 0) + (pr.s || 0) * 2 + Math.random() };
  });
  scored.sort((a, b) => a.key - b.key);
  return scored.slice(0, SESSION_SIZE).map(x => x.e);
}

function startSession(pool, mode, label) {
  const deck = pickDeck(pool, current.id);
  session = {
    queue: deck.slice(), mode, label, rangeId: current.id,
    totalDistinct: deck.length, doneDistinct: 0,
    counted: new Set(), drops: {}, masteredNow: 0, answered: 0,
  };
  renderPlay();
}

function recordResult(entry, correct) {
  const p = prog(session.rangeId);
  const pr = p[entry.card.id] || { s: 0, m: 0 };
  if (correct) {
    pr.s = (pr.s || 0) + 1;
    if (pr.s >= MASTER_STREAK && !pr.m) { pr.m = 1; if (session) session.masteredNow++; }
  } else { pr.s = 0; pr.m = 0; }
  p[entry.card.id] = pr; save();
}

function giveDrop(entry) {
  const iv = inv(session.rangeId);
  iv[entry.cat.id] = (iv[entry.cat.id] || 0) + 1;
  session.drops[entry.cat.id] = (session.drops[entry.cat.id] || 0) + 1;
  save();
  toast(`+1 ${esc(entry.cat.material.icon)} ${esc(entry.cat.material.name)}`);
}

function renderPlay() {
  const s = session;
  if (!s.queue.length) { renderResult(); return; }
  const entry = s.queue[0];
  const remain = s.queue.length;
  let html = `<div class="session-label">${esc(s.label)}</div>
    <div class="progress-line">あと ${remain} 問</div>
    <div class="panel">
      <div class="cardbox" id="cardbox">
        <div class="q">${esc(entry.card.q)}</div>
        <div class="a" id="card-a" style="display:none">${esc(entry.card.a)}</div>
        ${s.mode === "flip" ? `<div class="hint" id="card-hint">タップすると答えが見える</div>` : ""}
      </div>
      <div id="play-ui"></div>
    </div>
    <button class="btn ghost" id="p-back">もどる</button>`;
  app.innerHTML = html;
  app.querySelector("#p-back").addEventListener("click", () => { session = null; renderCats(); });
  const ui = app.querySelector("#play-ui");
  if (s.mode === "flip") {
    app.querySelector("#cardbox").addEventListener("click", () => {
      app.querySelector("#card-a").style.display = "";
      const h = app.querySelector("#card-hint"); if (h) h.style.display = "none";
      ui.innerHTML = `<button class="btn big ok" id="j-ok">⭕ できた</button>
                      <button class="btn big ng" id="j-ng">❌ まだ</button>`;
      ui.querySelector("#j-ok").addEventListener("click", () => judge(entry, true));
      ui.querySelector("#j-ng").addEventListener("click", () => judge(entry, false));
    }, { once: true });
  } else {
    const poolAnswers = [...new Set(
      (catOf(current, entry.cat.id) ? catOf(current, entry.cat.id).cards : allEntries(current).map(e => e.card))
        .map(c => c.a))].filter(a => a !== entry.card.a);
    const choices = shuffle([entry.card.a, ...shuffle(poolAnswers).slice(0, 3)]);
    if (choices.length < 2) { s.mode = "flip"; renderPlay(); return; }
    ui.innerHTML = `<div class="choices">${choices.map(c =>
      `<button class="btn ghost" data-choice="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
    ui.querySelectorAll("[data-choice]").forEach(b => b.addEventListener("click", () => {
      const correct = b.dataset.choice === entry.card.a;
      b.classList.add(correct ? "right" : "wrong");
      ui.querySelectorAll("[data-choice]").forEach(x => {
        x.disabled = true;
        if (x.dataset.choice === entry.card.a) x.classList.add("right");
      });
      setTimeout(() => judge(entry, correct), 650);
    }));
  }
}

function judge(entry, correct) {
  const s = session;
  s.queue.shift();
  recordResult(entry, correct);
  if (correct) {
    if (!s.counted.has(entry.card.id)) {
      s.counted.add(entry.card.id);
      s.doneDistinct++;
      giveDrop(entry);
    }
  } else {
    // 間違えたカードは、少し後でもう一度出す
    s.queue.splice(Math.min(3, s.queue.length), 0, entry);
  }
  s.answered++;
  renderPlay();
}

function renderResult() {
  const s = session; session = null;
  const dropLines = Object.entries(s.drops).map(([catId, n]) => {
    const c = catOf(current, catId);
    return `${c.material.icon} ${esc(c.material.name)} × ${n}`;
  });
  app.innerHTML = `<div class="panel center">
    <h2>おつかれさま！</h2>
    <p>新しく答えられたカード： ${s.doneDistinct} 枚</p>
    ${s.masteredNow ? `<p>「覚えた」になったカード： ${s.masteredNow} 枚 🎉</p>` : ""}
    <h3>手に入れた素材</h3>
    <p class="drop-list">${dropLines.length ? dropLines.join("<br>") : "（今回はなし）"}</p>
    <button class="btn big" id="r-again">つづける</button>
    <button class="btn big sub2" id="r-craft">🔨 クラフトを見る</button>
    <button class="btn big ghost" id="r-cats">カテゴリ選択へ</button>
  </div>`;
  app.querySelector("#r-again").addEventListener("click", renderCats);
  app.querySelector("#r-craft").addEventListener("click", renderCraft);
  app.querySelector("#r-cats").addEventListener("click", renderCats);
}

/* ---------- クラフト ---------- */
let finisher = null;
function renderCraft() {
  const r = current, iv = inv(r.id);
  const crafted = store.crafted[r.id] || [];
  let html = `<div class="panel"><h2>🔨 クラフト</h2><button class="btn ghost small" id="c-back-top">もどる</button><h3>持っている素材</h3><div class="inv-grid">`;
  let any = false;
  for (const s of r.subjects) for (const c of s.categories) {
    const n = iv[c.id] || 0;
    if (n > 0) { any = true; html += `<div class="inv-item">${esc(c.material.icon)} ${esc(c.material.name)}<br>× ${n}</div>`; }
  }
  if (!any) html += `<p class="sub">まだ素材がない。問題に正解すると素材が手に入るよ。</p>`;
  html += `</div><h3>作れるもの（レシピ）</h3>`;
  (r.recipes || []).forEach((rec, i) => {
    const done = crafted.includes(rec.item);
    const needs = Object.entries(rec.needs).map(([catId, n]) => {
      const c = catOf(r, catId), have = iv[catId] || 0;
      return `<span class="${have >= n ? "need-ok" : "need-ng"}">${esc(c.material.icon)}${esc(c.material.name)} ${have}/${n}</span>`;
    }).join("　");
    const can = Object.entries(rec.needs).every(([catId, n]) => (iv[catId] || 0) >= n);
    html += `<div class="recipe">
      <div style="font-size:19px">${esc(rec.icon)} ${esc(rec.item)} ${done ? `<span class="done-badge">（図鑑に登録済み）</span>` : ""}</div>
      <div class="sub">${needs}</div>
      <button class="btn" data-craft="${i}" ${can ? "" : "disabled"}>作る（仕上げ問題3問）</button>
    </div>`;
  });
  html += `<h3>📖 図鑑</h3>`;
  html += crafted.length
    ? `<p style="font-size:19px">${crafted.map(n => {
        const rec = (r.recipes || []).find(x => x.item === n);
        return rec ? `${esc(rec.icon)} ${esc(n)}` : esc(n);
      }).join("　")}</p>`
    : `<p class="sub">まだ何も作っていない。</p>`;
  html += `<button class="btn ghost" id="c-back">もどる</button></div>`;
  app.innerHTML = html;
  app.querySelector("#c-back").addEventListener("click", renderCats);
  app.querySelector("#c-back-top").addEventListener("click", renderCats);
  app.querySelectorAll("[data-craft]").forEach(b => b.addEventListener("click", () =>
    startCraft((r.recipes || [])[Number(b.dataset.craft)])));
}

function startCraft(recipe) {
  const pool = [];
  for (const catId of Object.keys(recipe.needs)) {
    const c = catOf(current, catId);
    if (c) for (const cd of c.cards) pool.push({ card: cd, cat: c, subject: "" });
  }
  const qs = shuffle(pool).slice(0, Math.min(3, pool.length));
  if (!qs.length) return;
  finisher = { recipe, qs, idx: 0 };
  session = { queue: [], mode: "flip", label: "", rangeId: current.id, counted: new Set(), drops: {}, masteredNow: 0 };
  renderFinisher();
}

function renderFinisher() {
  const f = finisher;
  if (f.idx >= f.qs.length) { finishCraft(true); return; }
  const entry = f.qs[f.idx];
  app.innerHTML = `<div class="session-label">🔨 ${esc(f.recipe.item)} の仕上げ問題（${f.idx + 1} / ${f.qs.length}）</div>
    <div class="progress-line">全部正解で完成！</div>
    <div class="panel">
      <div class="cardbox" id="cardbox">
        <div class="q">${esc(entry.card.q)}</div>
        <div class="a" id="card-a" style="display:none">${esc(entry.card.a)}</div>
        <div class="hint" id="card-hint">タップすると答えが見える</div>
      </div>
      <div id="play-ui"></div>
    </div>
    <button class="btn ghost" id="fin-back">もどる</button>`;
  app.querySelector("#fin-back").addEventListener("click", () => { finisher = null; session = null; renderCraft(); });
  const ui = app.querySelector("#play-ui");
  app.querySelector("#cardbox").addEventListener("click", () => {
    app.querySelector("#card-a").style.display = "";
    const h = app.querySelector("#card-hint"); if (h) h.style.display = "none";
    ui.innerHTML = `<button class="btn big ok" id="j-ok">⭕ できた</button>
                    <button class="btn big ng" id="j-ng">❌ まだ</button>`;
    ui.querySelector("#j-ok").addEventListener("click", () => { recordResult(entry, true); f.idx++; renderFinisher(); });
    ui.querySelector("#j-ng").addEventListener("click", () => { recordResult(entry, false); finishCraft(false); });
  }, { once: true });
}

function finishCraft(success) {
  const f = finisher; finisher = null; session = null;
  const r = current;
  if (success) {
    const iv = inv(r.id);
    for (const [catId, n] of Object.entries(f.recipe.needs)) iv[catId] = (iv[catId] || 0) - n;
    store.crafted[r.id] = store.crafted[r.id] || [];
    if (!store.crafted[r.id].includes(f.recipe.item)) store.crafted[r.id].push(f.recipe.item);
    save();
    toast(`${esc(f.recipe.icon)} ${esc(f.recipe.item)} 完成！`);
    app.innerHTML = `<div class="panel center">
      <h2>${esc(f.recipe.icon)} ${esc(f.recipe.item)} が完成した！</h2>
      <p>図鑑に登録したよ。</p>
      <button class="btn big" id="f-back">クラフトへ戻る</button>
      <button class="btn big ghost" id="f-cats">カテゴリ選択へ</button>
    </div>`;
  } else {
    app.innerHTML = `<div class="panel center">
      <h2>ざんねん、仕上げ問題で止まってしまった。</h2>
      <p>素材は減らないから、また挑戦できるよ。</p>
      <button class="btn big" id="f-back">クラフトへ戻る</button>
      <button class="btn big ghost" id="f-cats">カテゴリ選択へ</button>
    </div>`;
  }
  app.querySelector("#f-back").addEventListener("click", renderCraft);
  app.querySelector("#f-cats").addEventListener("click", renderCats);
}

renderRanges();
