'use strict';
const KEY = 'karteikarten.v1';
const DAYS = [0, 0, 2, 4, 9, 21];            // Wartezeit je Fach 1..5
const TYPES = { free: 'Freitext', choice: 'Auswahl', order: 'Reihenfolge' };
const main = document.getElementById('main');

let db = load();
let filter = '';                             // gewählte Kategorie, '' = alle

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.cards) return d; } catch (e) {}
  return { version: 1, categories: [], cards: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { alert('Speichern fehlgeschlagen! Bitte sofort exportieren.'); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cats = () => db.categories.filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const cards = (cat = filter) => db.cards.filter(c => !c.deleted && (!cat || c.cat === cat));
const catName = id => (db.categories.find(c => c.id === id) || {}).name || '–';
const prog = c => c.prog || { box: 1, right: 0, wrong: 0, due: 0, last: 0 };
const isDue = c => prog(c).due <= Date.now();
const isHard = c => { const p = prog(c); return p.wrong > 0 && p.box <= 2; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// DOM-Helfer: Texte werden nie als HTML interpretiert
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter(k => k !== null && k !== false && k !== undefined));
  return e;
}
const btn = (text, fn, cls = '') => el('button', { type: 'button', textContent: text, className: cls, onclick: fn });
const show = (...nodes) => { main.replaceChildren(...nodes.flat().filter(Boolean)); window.scrollTo(0, 0); };

function catSelect(value, withAll, onchange) {
  const s = el('select', { onchange: () => onchange && onchange(s.value) },
    withAll ? el('option', { value: '', textContent: 'Alle Kategorien' }) : null,
    cats().map(c => el('option', { value: c.id, textContent: c.name })));
  s.value = value;
  return s;
}

function go(view) {
  if (filter && !cats().some(c => c.id === filter)) filter = '';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  ({ home, cards: cardList, stats, data })[view]();
}

/* ---------- Lernen ---------- */
function home() {
  const all = cards(), due = all.filter(isDue), hard = all.filter(isHard);
  const start = (list) => session(shuffle(list));
  const b = (text, list, cls) => Object.assign(btn(`${text} (${list.length})`, () => start(list), cls), { disabled: !list.length });
  show(el('h2', { textContent: 'Lernen' }),
    catSelect(filter, true, v => { filter = v; home(); }),
    b('Fällige Karten', due, 'main'), b('Schwere Karten', hard), b('Alle üben', all),
    !db.cards.some(c => !c.deleted) ? el('p', { textContent: 'Noch keine Karten. Lege unter „Karten“ die erste an.' }) : null);
}

function rate(card, ok) {
  const p = { ...prog(card) };
  p.box = ok ? Math.min(5, p.box + 1) : 1;
  p[ok ? 'right' : 'wrong']++;
  const d = new Date(today()); d.setDate(d.getDate() + DAYS[p.box]);
  p.due = ok ? d.getTime() : 0;
  p.last = Date.now();
  card.prog = p;
  save();
}

function session(queue, i = 0, score = 0) {
  if (i >= queue.length) {
    return show(el('h2', { textContent: 'Fertig' }),
      el('div', { className: 'box', textContent: `${score} von ${queue.length} richtig` }),
      btn('Zurück', () => go('home'), 'main'));
  }
  const card = queue[i];
  const area = el('div'), result = el('div');
  const next = ok => session(queue, i + 1, score + (ok ? 1 : 0));
  const finish = (ok, solution) => {         // automatische Bewertung
    rate(card, ok);
    area.querySelectorAll('button,input').forEach(x => x.disabled = true);
    result.replaceChildren(
      el('div', { className: 'box ' + (ok ? 'ok' : 'bad'), textContent: (ok ? 'Richtig' : 'Falsch') + (solution ? '\n\nLösung:\n' + solution : '') }),
      btn('Weiter', () => next(ok), 'main'));
  };

  if (card.type === 'free') {
    const input = el('textarea', { placeholder: 'Deine Antwort' });
    const check = btn('Antwort zeigen', () => {
      check.disabled = true; input.readOnly = true;
      result.replaceChildren(
        el('div', { className: 'box', textContent: 'Musterlösung:\n' + card.answer }),
        btn('Gewusst', () => { rate(card, true); next(true); }, 'ok'),
        btn('Nicht gewusst', () => { rate(card, false); next(false); }, 'bad'));
    }, 'main');
    area.append(input, check);
  } else if (card.type === 'choice') {
    const opts = shuffle(card.options).map(o => ({ o, box: el('input', { type: 'checkbox' }) }));
    area.append(el('p', { className: 'small', textContent: 'Mehrere Antworten können richtig sein.' }),
      ...opts.map(x => el('label', { className: 'row' }, x.box, el('span', { textContent: x.o.text }))),
      btn('Prüfen', () => finish(opts.every(x => x.box.checked === x.o.ok),
        card.options.filter(o => o.ok).map(o => '• ' + o.text).join('\n')), 'main'));
  } else {
    let items = shuffle(card.items);
    for (let n = 0; n < 10 && items.join('\n') === card.items.join('\n'); n++) items = shuffle(card.items);
    const list = el('div');
    const move = (k, d) => { [items[k], items[k + d]] = [items[k + d], items[k]]; draw(); };
    const draw = () => list.replaceChildren(...items.map((t, k) => el('div', { className: 'row' },
      el('div', { className: 'box grow', textContent: `${k + 1}. ${t}` }),
      Object.assign(btn('▲', () => move(k, -1)), { disabled: k === 0 }),
      Object.assign(btn('▼', () => move(k, 1)), { disabled: k === items.length - 1 }))));
    draw();
    area.append(list, btn('Prüfen', () => finish(items.join('\n') === card.items.join('\n'),
      card.items.map((t, k) => `${k + 1}. ${t}`).join('\n')), 'main'));
  }

  show(el('div', { className: 'small', textContent: `${i + 1} / ${queue.length} · ${catName(card.cat)} · Fach ${prog(card).box}` }),
    el('div', { className: 'box', textContent: card.question }), area, result,
    el('p', {}, btn('Abbrechen', () => go('home'))));
}

/* ---------- Karten verwalten ---------- */
function addCategory() {
  const name = (prompt('Name der Kategorie') || '').trim();
  if (!name) return;
  let c = cats().find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!c) { c = { id: uid(), name, updated: Date.now() }; db.categories.push(c); save(); }
  filter = c.id; cardList();
}
function renameCategory() {
  const c = db.categories.find(x => x.id === filter);
  const name = (prompt('Neuer Name', c.name) || '').trim();
  if (!name) return;
  if (cats().some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) return alert('Diesen Namen gibt es schon.');
  c.name = name; c.updated = Date.now(); save(); cardList();
}
function deleteCategory() {
  if (cards(filter).length) return alert('Erst die Karten dieser Kategorie löschen oder verschieben.');
  const c = db.categories.find(x => x.id === filter);
  if (!confirm(`Kategorie „${c.name}“ löschen?`)) return;
  c.deleted = true; c.updated = Date.now(); filter = ''; save(); cardList();
}

function cardList() {
  show(el('h2', { textContent: 'Karten' }),
    catSelect(filter, true, v => { filter = v; cardList(); }),
    btn('+ Karte', () => editCard(), 'main'), btn('+ Kategorie', addCategory),
    filter ? btn('Umbenennen', renameCategory) : null,
    filter ? btn('Kategorie löschen', deleteCategory) : null,
    cards().map(c => el('div', { className: 'box list', onclick: () => editCard(c) },
      el('div', { textContent: c.question }),
      el('div', { className: 'small', textContent: `${catName(c.cat)} · ${TYPES[c.type]} · Fach ${prog(c).box}` }))));
}

function editCard(card, preset = {}) {
  if (!cats().length) { alert('Lege zuerst eine Kategorie an.'); return addCategory(); }
  const cat = catSelect(card ? card.cat : preset.cat || filter || cats()[0].id, false);
  const type = el('select', {}, Object.entries(TYPES).map(([v, t]) => el('option', { value: v, textContent: t })));
  type.value = card ? card.type : preset.type || 'free';
  const q = el('textarea', { value: card ? card.question : '' });
  const answer = el('textarea', { value: card && card.answer || '' });
  const items = el('textarea', { value: card && card.items ? card.items.join('\n') : '' });
  const rows = el('div');
  const addRow = (o = { text: '', ok: false }) => {
    const row = el('div', { className: 'row' },
      el('input', { type: 'checkbox', checked: o.ok, title: 'richtig' }),
      el('input', { className: 'grow', value: o.text, placeholder: 'Antwort' }));
    row.append(btn('✕', () => row.remove()));
    rows.append(row);
  };
  (card && card.options || [undefined, undefined, undefined]).forEach(o => addRow(o));

  const parts = {
    free: el('div', {}, 'Musterlösung', answer),
    choice: el('div', {}, 'Antworten (Haken = richtig)', rows, btn('+ Antwort', () => addRow())),
    order: el('div', {}, 'Schritte in richtiger Reihenfolge (je Zeile einer)', items)
  };
  type.onchange = () => Object.entries(parts).forEach(([k, p]) => p.hidden = k !== type.value);
  type.onchange();

  const submit = () => {
    const data = { cat: cat.value, type: type.value, question: q.value.trim() };
    if (!data.question) return alert('Die Frage fehlt.');
    if (data.type === 'free') {
      data.answer = answer.value.trim();
      if (!data.answer) return alert('Die Musterlösung fehlt.');
    } else if (data.type === 'choice') {
      data.options = [...rows.children].map(r => ({ ok: r.children[0].checked, text: r.children[1].value.trim() })).filter(o => o.text);
      if (data.options.length < 2 || !data.options.some(o => o.ok)) return alert('Mindestens 2 Antworten, davon 1 richtige.');
    } else {
      data.items = items.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (data.items.length < 2) return alert('Mindestens 2 Zeilen.');
    }
    data.updated = Date.now();
    if (card) Object.assign(card, data); else db.cards.push({ id: uid(), ...data });
    save();
    if (card) cardList(); else { editCard(null, data); }   // direkt die nächste Karte
  };

  show(el('h2', { textContent: card ? 'Karte bearbeiten' : 'Neue Karte' }),
    el('div', { className: 'box form' }, 'Kategorie', cat, 'Typ', type, 'Frage', q, Object.values(parts)),
    btn(card ? 'Speichern' : 'Speichern & nächste', submit, 'main'),
    btn('Zurück', cardList),
    card ? btn('Löschen', () => {
      if (!confirm('Karte löschen?')) return;
      card.deleted = true; card.updated = Date.now(); save(); cardList();
    }, 'bad') : null);
}

/* ---------- Statistik ---------- */
function stats() {
  const line = (name, list) => {
    const r = list.reduce((s, c) => s + prog(c).right, 0), w = list.reduce((s, c) => s + prog(c).wrong, 0);
    return el('tr', {}, [name, list.length, list.filter(isDue).length, list.filter(isHard).length,
      r + w ? Math.round(100 * r / (r + w)) + ' %' : '–'].map(v => el('td', { textContent: v })));
  };
  const all = cards('');
  show(el('h2', { textContent: 'Statistik' }),
    el('div', { className: 'box list' }, el('table', {},
      el('tr', {}, ['Kategorie', 'Karten', 'Fällig', 'Schwer', 'Richtig'].map(v => el('th', { textContent: v }))),
      cats().map(c => line(c.name, cards(c.id))), line('Gesamt', all))),
    el('h2', { textContent: 'Lernfächer' }),
    el('div', { className: 'box list' }, [1, 2, 3, 4, 5].map(n =>
      el('div', { textContent: `Fach ${n}: ${all.filter(c => prog(c).box === n).length} Karten` }))));
}

/* ---------- Export / Import ---------- */
function exportData() {
  const a = el('a', {
    href: URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' })),
    download: `karteikarten_${new Date().toLocaleDateString('sv')}_${new Date().toTimeString().slice(0, 5).replace(':', '')}.json`
  });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function validCard(c) {
  return c && typeof c.id === 'string' && typeof c.question === 'string' && typeof c.cat === 'string' &&
    (c.deleted || (c.type === 'free' && typeof c.answer === 'string') ||
      (c.type === 'choice' && Array.isArray(c.options)) || (c.type === 'order' && Array.isArray(c.items)));
}

// Zusammenführen: Inhalt = neuere Änderung gewinnt, Lernstand = zuletzt gelernter gewinnt
function merge(inc) {
  if (!inc || inc.version !== 1 || !Array.isArray(inc.categories) || !Array.isArray(inc.cards) ||
      !inc.categories.every(c => c && typeof c.id === 'string' && typeof c.name === 'string') ||
      !inc.cards.every(validCard)) throw new Error('Keine gültige Karteikarten-Datei.');
  const map = {};
  let added = 0, changed = 0;
  for (const c of inc.categories) {
    let own = db.categories.find(x => x.id === c.id);
    if (!own) own = db.categories.find(x => !x.deleted && !c.deleted && x.name.toLowerCase() === c.name.toLowerCase());
    if (!own) db.categories.push({ ...c });
    else {
      map[c.id] = own.id;
      if ((c.updated || 0) > (own.updated || 0)) Object.assign(own, c, { id: own.id });
    }
  }
  for (const raw of inc.cards) {
    const c = { ...raw, cat: map[raw.cat] || raw.cat };
    const i = db.cards.findIndex(x => x.id === c.id);
    if (i < 0) { db.cards.push(c); if (!c.deleted) added++; continue; }
    const own = db.cards[i];
    const newer = (c.updated || 0) > (own.updated || 0);
    const p = prog(c).last > prog(own).last ? c.prog : own.prog;
    if (newer || p !== own.prog) changed++;
    db.cards[i] = { ...(newer ? c : own), prog: p };
  }
  // Kategorien mit noch vorhandenen Karten dürfen nicht gelöscht bleiben
  for (const c of db.categories) if (c.deleted && cards(c.id).length) { c.deleted = false; c.updated = Date.now(); }
  save();
  return { added, changed };
}

function data() {
  const file = el('input', { type: 'file', accept: '.json,application/json' });
  file.onchange = async () => {
    try {
      const r = merge(JSON.parse(await file.files[0].text()));
      alert(`Import fertig: ${r.added} neu, ${r.changed} aktualisiert.`);
      go('home');
    } catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
  };
  show(el('h2', { textContent: 'Daten' }),
    el('div', { className: 'box form' }, el('p', { textContent: 'Sichert alle Karten und den Lernstand als Datei.' }), btn('Exportieren', exportData, 'main')),
    el('div', { className: 'box form' }, el('p', { textContent: 'Import führt zusammen. Bei Änderungen an derselben Karte gilt die neuere, auch beim Löschen.' }), file));
}

document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.view));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
go('home');
