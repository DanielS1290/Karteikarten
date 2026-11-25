'use strict';
const KEY = 'karteikarten.v1';
const DAYS = [0, 0, 2, 4, 9, 21];            // Wartezeit je Fach 1..5
const TYPES = { free: 'Freitext', choice: 'Auswahl', order: 'Reihenfolge' };
const main = document.getElementById('main');

const SKEY = 'karteikarten.settings';       // nur lokal, nie im Export
let settings = {};
try { settings = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) {}
if (!settings.repo) settings.repo = 'Karteikarte_data';
let syncText = settings.token ? '' : 'Sync noch nicht eingerichtet';
let db = load();
let filter = '';                             // gewählte Kategorie, '' = alle

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.cards) return d; } catch (e) {}
  return { version: 1, categories: [], cards: [] };
}
function save() { persist(); scheduleSync(); }
function persist() {
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
let screen = '';
const show = (...nodes) => { screen = ''; main.replaceChildren(...nodes.flat().filter(Boolean)); window.scrollTo(0, 0); };

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
  document.body.classList.toggle('start', view === 'home');
  ({ home, learn, cats: categoryList, cards: cardList, stats, data })[view]();
}

/* ---------- Startseite ---------- */
const ICONS = {
  book: 'M12 6C10 4.5 6 4.5 3 5v13c3-.5 7-.5 9 1 2-1.500 6-1.500 9-1V5c-3-.5-7-.5-9 1zM12 6v13',
  folder: 'M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 11h18',
  plus: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v8M8 12h8',
  chart: 'M6 20v-4M12 20V10M18 20V4',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM10 3h4l.5 3 2 1 3-1 2 3.500-2.500 2v1l2.500 2-2 3.500-3-1-2 1-.5 3h-4l-.5-3-2-1-3 1-2-3.500 2.500-2v-1l-2.500-2 2-3.500 3 1 2-1z'
};
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); path.setAttribute('d', ICONS[name]); svg.append(path);
  return svg;
}
function home() {
  const tile = (ic, title, sub, fn) => el('button', { type: 'button', className: 'tile', onclick: fn },
    icon(ic), el('strong', { textContent: title }), el('span', { textContent: sub }));
  show(el('div', { className: 'panel' },
    el('div', { className: 'over', textContent: 'STARTSEITE' }),
    el('h1', { textContent: 'Lernzentrum' }),
    el('p', { className: 'muted', textContent: 'Deine persönliche Wissensdatenbank' }),
    el('div', { className: 'tiles' },
      tile('book', 'Lernen', 'Karteikarten starten', () => go('learn')),
      tile('folder', 'Kategorien', 'Wissensgebiete', () => go('cats')),
      tile('plus', 'Neue Karte', 'Fragen erstellen', () => { document.body.classList.remove('start'); editCard(); }),
      tile('chart', 'Statistik', 'Lernfortschritt', () => go('stats'))),
    el('button', { type: 'button', className: 'manage', onclick: () => go('data') },
      el('span', {}, el('strong', { textContent: 'Fragenverwaltung' }), el('span', { textContent: 'Importieren, exportieren, bearbeiten' })),
      icon('gear')),
    el('p', { className: 'small status', textContent: syncText })));
  screen = 'home';
}

/* ---------- Lernen ---------- */
function learn() {
  const all = cards(), due = all.filter(isDue), hard = all.filter(isHard);
  const b = (text, list, cls) => Object.assign(btn(`${text} (${list.length})`, () => session(shuffle(list)), 'wide ' + (cls || '')), { disabled: !list.length });
  show(el('h2', { textContent: 'Lernen' }),
    catSelect(filter, true, v => { filter = v; learn(); }),
    b('Fällige Karten', due, 'main'), b('Schwere Karten', hard), b('Alle üben', all),
    !all.length ? el('p', { textContent: 'Hier gibt es noch keine Karten.' }) : null);
  screen = 'learn';
}

function categoryList() {
  const row = c => el('div', { className: 'box list', onclick: () => { filter = c.id; go('cards'); } },
    el('div', { textContent: c.name }),
    el('div', { className: 'small', textContent: `${cards(c.id).length} Karten` }));
  show(el('h2', { textContent: 'Kategorien' }), btn('+ Kategorie', addCategory, 'main'), cats().map(row));
  screen = 'cats';
}

function rate(card, ok) {
  card = db.cards.find(x => x.id === card.id) || card;
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
      btn('Zurück', () => go('learn'), 'main'));
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
    el('p', {}, btn('Abbrechen', () => go('learn'))));
}

/* ---------- Karten verwalten ---------- */
function addCategory() {
  const name = (prompt('Name der Kategorie') || '').trim();
  if (!name) return;
  let c = cats().find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!c) { c = { id: uid(), name, updated: Date.now() }; db.categories.push(c); save(); }
  filter = c.id; go('cards');
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
  screen = 'cards';
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
    if (card) Object.assign(db.cards.find(x => x.id === card.id), data); else db.cards.push({ id: uid(), ...data });
    save();
    if (card) cardList(); else { editCard(null, data); }   // direkt die nächste Karte
  };

  show(el('h2', { textContent: card ? 'Karte bearbeiten' : 'Neue Karte' }),
    el('div', { className: 'box form' }, 'Kategorie', cat, 'Typ', type, 'Frage', q, Object.values(parts)),
    btn(card ? 'Speichern' : 'Speichern & nächste', submit, 'main'),
    btn('Zurück', cardList),
    card ? btn('Löschen', () => {
      if (!confirm('Karte löschen?')) return;
      Object.assign(db.cards.find(x => x.id === card.id), { deleted: true, updated: Date.now() }); save(); cardList();
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
  screen = 'stats';
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
    const id = map[c.id] || c.id;
    let own = db.categories.find(x => x.id === id);
    if (!own && !c.deleted) {
      own = db.categories.find(x => !x.deleted && x.name.toLowerCase() === c.name.toLowerCase());
      if (own) {                              // kleinere ID gewinnt, auf allen Geräten gleich
        const keep = own.id < c.id ? own.id : c.id, drop = keep === own.id ? c.id : own.id;
        map[drop] = keep;
        db.cards.forEach(k => { if (k.cat === drop) k.cat = keep; });
        if (filter === drop) filter = keep;
        own.id = keep;
      }
    }
    if (!own) db.categories.push({ ...c });
    else if ((c.updated || 0) > (own.updated || 0)) Object.assign(own, c, { id: own.id });
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
  persist();
  return { added, changed };
}

function data() {
  const file = el('input', { type: 'file', accept: '.json,application/json' });
  file.onchange = async () => {
    try {
      const r = merge(JSON.parse(await file.files[0].text()));
      scheduleSync();
      alert(`Import fertig: ${r.added} neu, ${r.changed} aktualisiert.`);
      go('home');
sync();
    } catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
  };
  const field = (label, key, type = 'text') => {
    const i = el('input', { type, value: settings[key] || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
    return { key, i, node: el('label', {}, label, i) };
  };
  const fields = [field('GitHub-Benutzername', 'owner'),
    field('Privates Daten-Repository', 'repo'), field('Token', 'token', 'password')];
  const saveSettings = () => {
    fields.forEach(f => settings[f.key] = f.i.value.trim());
    localStorage.setItem(SKEY, JSON.stringify(settings));
    if (settings.token) sync(true); else alert('Gespeichert.');
  };
  show(el('h2', { textContent: 'Fragenverwaltung' }),
    btn('Karten bearbeiten', () => { filter = ''; go('cards'); }, 'wide main'),
    el('div', { className: 'box form' }, fields.map(f => f.node), btn('Speichern & synchronisieren', saveSettings, 'main'),
      el('p', { className: 'small status', textContent: syncText })),
    el('div', { className: 'box form' }, el('p', { textContent: 'Backup: alle Karten und Lernstand als Datei.' }), btn('Exportieren', exportData, 'main')),
    el('div', { className: 'box form' }, el('p', { textContent: 'Import führt zusammen. Bei Änderungen an derselben Karte gilt die neuere, auch beim Löschen.' }), file));
}

/* ---------- Sync über privates GitHub-Repository ---------- */
const FILE = 'karten.json';
let timer = 0, busy = false, again = false;

function setStatus(t) {
  syncText = t;
  document.querySelectorAll('.status').forEach(e => e.textContent = t);
}
function scheduleSync(ms = 5000) {
  if (!settings.token) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync(), ms);
}
// Einheitliche Reihenfolge, damit nur bei echten Änderungen hochgeladen wird
function canon(d) {
  const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
  const byId = (a, b) => a.id < b.id ? -1 : 1;
  return JSON.stringify(sorted({ version: 1, categories: [...d.categories].sort(byId), cards: [...d.cards].sort(byId) }), null, 1);
}
const toB64 = t => { let s = ''; new TextEncoder().encode(t).forEach(x => s += String.fromCharCode(x)); return btoa(s); };
const fromB64 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));

function api(path, options = {}) {
  return fetch(`https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}${path}`, {
    ...options, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + settings.token, Accept: 'application/vnd.github+json' }
  });
}
function fail(r) {
  const text = { 401: 'Token ungültig oder abgelaufen', 403: 'Zugriff verweigert (Berechtigung prüfen)', 404: 'Repository nicht gefunden' };
  throw new Error(text[r.status] || 'GitHub-Fehler ' + r.status);
}
async function syncOnce() {
  const repo = await api('');
  if (!repo.ok) fail(repo);
  if (!(await repo.json()).private) throw new Error('Repository ist öffentlich, Sync abgebrochen');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await api('/contents/' + FILE);
    let sha, remote = null;
    if (res.ok) {
      const meta = await res.json();
      sha = meta.sha;
      let content = meta.content;
      if (meta.encoding !== 'base64') {       // Dateien über 1 MB
        const blob = await api('/git/blobs/' + sha);
        if (!blob.ok) fail(blob);
        content = (await blob.json()).content;
      }
      remote = JSON.parse(fromB64(content));
      merge(remote);
    } else if (res.status !== 404) fail(res);
    const local = canon(db);
    if (remote && canon(remote) === local) return;
    const put = await api('/contents/' + FILE, { method: 'PUT', body: JSON.stringify({ message: 'Sync', content: toB64(local), sha }) });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) fail(put);   // sonst: parallel geändert, neu laden
  }
  throw new Error('Gleichzeitige Änderung, bitte nochmal versuchen');
}
async function sync(manual) {
  if (!settings.token || !settings.owner || !settings.repo) { if (manual) alert('Bitte Benutzername, Repository und Token eintragen.'); return; }
  if (busy) { again = true; return; }
  if (!navigator.onLine) { setStatus('Offline, Abgleich folgt später'); return; }
  busy = true; clearTimeout(timer); setStatus('Synchronisiere …');
  try {
    await syncOnce();
    setStatus('Synchronisiert um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    if (screen) ({ home, learn, cats: categoryList, cards: cardList, stats })[screen]();   // nie ein Formular oder eine Abfrage stören
  } catch (e) {
    setStatus('Sync fehlgeschlagen: ' + e.message);
    if (manual) alert('Sync fehlgeschlagen: ' + e.message);
  }
  busy = false;
  if (again) { again = false; scheduleSync(500); }
}
window.addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => sync());

document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.view));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
go('home');
sync();
