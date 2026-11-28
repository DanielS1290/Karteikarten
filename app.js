'use strict';
// ===== Hier anpassen =====
const EXAM_DATE = '2027-10-01';              // Prüfungstag (Jahr-Monat-Tag)
const EXAM_NAME = 'B4 Auswahl';
// =========================
const KEY = 'karteikarten.v1';
const DAYS = [0, 0, 2, 4, 9, 21];            // Wartezeit je Fach 1..5
const TYPES = { free: 'Freitext', choice: 'Auswahl', order: 'Reihenfolge', gap: 'Lückentext', match: 'Zuordnen' };
const main = document.getElementById('main');

const SKEY = 'karteikarten.settings';       // nur lokal, nie im Export
let settings = {};
try { settings = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) {}
if (!settings.repo) settings.repo = 'Karteikarte_data';
let syncText = settings.token ? '' : 'Sync noch nicht eingerichtet';
let db = load();
let filter = '';                             // gewählte Kategorie, '' = alle
let query = '';                              // Suchbegriff
const GOAL = 25;                             // richtige Antworten pro Tag
const SIZES = [10, 25, 33, 50, 0];           // Blockgröße, 0 = alle
const LEVELS = { 'B2': '#4ade80', 'B3': '#fde047', 'B4': '#f87171', 'Allg.': '#60a5fa' };
const STREAKS = { 3: '🔥 Läuft, Daniel!', 5: '💪 Fünfer-Pack, sauber!', 10: '🧑‍🚒 Stark, 10 am Stück!', 20: '🏆 Maschine!' };
const saveLocal = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) {} };

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
if (!settings.dev) { settings.dev = uid(); saveLocal(); }
const levelOf = c => Object.prototype.hasOwnProperty.call(LEVELS, c.level) ? c.level : 'Allg.';
function levelBadge(c) {
  const b = el('span', { className: 'level', textContent: levelOf(c) });
  b.style.color = b.style.borderColor = LEVELS[levelOf(c)];
  return b;
}
// Tagesprotokoll je Gerät, damit der Sync nichts doppelt zählt
const dayKey = (back = 0) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toLocaleDateString('sv'); };
function dayTotal(key) {
  return Object.values((db.log || {})[key] || {}).reduce((s, x) => ({ r: s.r + x.r, w: s.w + x.w }), { r: 0, w: 0 });
}
function dayStreak() {
  let back = dayTotal(dayKey()).r >= GOAL ? 0 : 1, n = 0;
  while (dayTotal(dayKey(back)).r >= GOAL) { n++; back++; }
  return n;
}
function toast(text) {
  let box = document.getElementById('toasts');
  if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
  const t = el('div', { className: 'toast', textContent: text });
  box.append(t); setTimeout(() => t.remove(), 2200);
}
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cats = () => db.categories.filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const cards = (cat = filter) => db.cards.filter(c => !c.deleted && (!cat || c.cat === cat));
const catName = id => (db.categories.find(c => c.id === id) || {}).name || '–';
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00d5e8', '#1e4fd8', '#e91eaa', '#8d5a3b', '#f5f5f5',
  '#8e24aa', '#a3e635', '#0f766e', '#7f1d1d', '#fda4af', '#6b7280', '#d4a017'];
const OLD_COLORS = { '#ef4444': 0, '#f97316': 1, '#eab308': 2, '#22c55e': 3, '#14b8a6': 4, '#3b82f6': 5, '#8b5cf6': 6, '#ec4899': 6 };
const textOn = col => ['#e53935', '#1e4fd8', '#e91eaa', '#8d5a3b', '#8e24aa', '#0f766e', '#7f1d1d', '#6b7280'].includes(col) ? '#fff' : '#111';
function catColor(id) {
  const c = db.categories.find(x => x.id === id);
  if (c && COLORS.includes(c.color)) return c.color;
  if (c && c.color in OLD_COLORS) return COLORS[OLD_COLORS[c.color]];
  return COLORS[[...String(id)].reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORS.length];
}
function mdi(id) {
  const c = db.categories.find(x => x.id === id);
  if (!c || !Object.prototype.hasOwnProperty.call(MDI, c.icon)) return null;
  return mdiSvg(c.icon);
}
function mdiSvg(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'mdi'); path.setAttribute('d', MDI[name]); svg.append(path);
  return svg;
}
function iconPicker(c) {
  const set = name => { c.icon = name; c.updated = Date.now(); save(); catEdit(c.id); };
  return el('div', { className: 'icons' }, btn('–', () => set(''), c.icon ? '' : 'on'),
    Object.keys(MDI).map(name => {
      const b = btn('', () => set(name), c.icon === name ? 'on' : '');
      b.append(mdiSvg(name)); b.setAttribute('aria-label', name);
      return b;
    }));
}
function pencilIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'mdi');
  path.setAttribute('d', 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z');
  svg.append(path); return svg;
}
function colored(node, id) { node.style.borderLeft = '8px solid ' + catColor(id); return node; }
function badge(id) {
  const b = el('span', { className: 'badge' }, mdi(id), catName(id));
  b.style.background = catColor(id); b.style.color = textOn(catColor(id));
  return b;
}
function colorPicker(c) {
  return el('div', { className: 'swatches' }, COLORS.map(col => {
    const b = btn('', () => { c.color = col; c.updated = Date.now(); save(); catEdit(c.id); }, catColor(c.id) === col ? 'on' : '');
    b.style.background = col; b.setAttribute('aria-label', 'Farbe ' + col);
    return b;
  }));
}
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
let guard = '';                              // Rückfrage bei laufender Abfrage / ungespeicherten Eingaben
let back = null;                             // Ziel der Zurück-Taste, null = Startseite
const show = (...nodes) => {
  screen = ''; guard = ''; back = null;
  main.replaceChildren(...nodes.flat().filter(Boolean));
  main.classList.remove('fade'); void main.offsetWidth; main.classList.add('fade');
  window.scrollTo(0, 0);
};

function catSelect(value, withAll, onchange) {
  const s = el('select', { onchange: () => onchange && onchange(s.value) },
    withAll ? el('option', { value: '', textContent: 'Alle Kategorien' }) : null,
    cats().map(c => el('option', { value: c.id, textContent: c.name })));
  s.value = value;
  return s;
}

function go(view) {
  query = '';
  if (filter && !cats().some(c => c.id === filter)) filter = '';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.body.classList.toggle('start', view === 'home');
  ({ home, learn, cats: categoryList, cards: cardList, stats, data })[view]();
}

/* ---------- Startseite ---------- */
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
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
function greeting() {
  const h = new Date().getHours();
  return `${h < 9 ? 'Moin' : h < 18 ? 'Gude' : 'Abend'} Daniel!`;
}
function countdown() {
  const [y, m, d] = EXAM_DATE.split('-').map(Number), now = new Date();
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (days < 0) return null;
  return `Vorbereitung zur ${EXAM_NAME} ${days === 0 ? 'heute' : `in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`}`;
}
// Balken gleitet vom alten zum neuen Wert
function barNode(pct, from = 0, cls = '') {
  const bar = el('div', { className: 'bar ' + cls }, el('div'));
  bar.firstChild.style.width = from + '%';
  requestAnimationFrame(() => requestAnimationFrame(() => bar.firstChild.style.width = pct + '%'));
  return bar;
}
function goalBox() {
  const done = dayTotal(dayKey()).r, hit = done >= GOAL, streak = dayStreak();
  const share = Math.min(1, done / GOAL);
  const bar = barNode(100 * share, 0, hit ? 'hit' : share >= 0.5 ? 'half' : '');
  return el('div', { className: 'goal' },
    el('div', { className: 'progress' }, el('span', { textContent: hit ? 'Tagesziel ✅' : 'Tagesziel' }),
      el('span', { textContent: `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` })),
    bar,
    el('div', { className: 'progress' }, el('span', { textContent: hit ? 'Geschafft!' : `Noch ${GOAL - done} richtige` }),
      el('span', { textContent: `${done} / ${GOAL}` })));
}
function percentRight(list) {
  const r = list.reduce((s, c) => s + prog(c).right, 0), w = list.reduce((s, c) => s + prog(c).wrong, 0);
  return r + w ? Math.round(100 * r / (r + w)) + ' %' : '–';
}
function home() {
  const all = cards('');
  const tile = (ic, title, sub, fn) => el('button', { type: 'button', className: 'tile', onclick: fn },
    icon(ic), el('strong', { textContent: title }), el('span', { textContent: sub }));
  show(el('div', { className: 'panel' },
    el('h1', { textContent: greeting() }),
    countdown() ? el('p', { className: 'muted', textContent: countdown() }) : null,
    goalBox(),
    el('div', { className: 'tiles' },
      tile('book', 'Lernen', `${all.filter(isDue).length} fällig`, () => go('learn')),
      tile('folder', 'Kategorien', `${cats().length} Wissensgebiete`, () => go('cats')),
      tile('plus', 'Neue Karte', `${all.length} Karten`, () => { document.body.classList.remove('start'); editCard(null, {}, () => go('home')); }),
      tile('chart', 'Statistik', `${percentRight(all)} richtig`, () => go('stats'))),
    el('button', { type: 'button', className: 'manage', onclick: () => go('data') },
      el('span', {}, el('strong', { textContent: 'Fragenverwaltung' }), el('span', { textContent: 'Importieren, exportieren, bearbeiten' })),
      icon('gear')),
    el('p', { className: 'small status', textContent: syncText })));
  screen = 'home';
}

/* ---------- Lernen ---------- */
function learn() {
  const all = cards(), due = all.filter(isDue), hard = all.filter(isHard);
  const size = SIZES.includes(settings.block) ? settings.block : 25;
  const start = list => { const q = shuffle(list); session(size ? q.slice(0, size) : q); };
  const b = (text, list, cls) => Object.assign(btn(`${text} (${list.length})`, () => start(list), 'wide ' + (cls || '')), { disabled: !list.length });
  show(el('h2', { textContent: 'Lernen' }),
    el('div', { className: 'cattiles' }, [{ id: '', name: 'Alle' }, ...cats()].map(c => {
      const b = btn('', () => { filter = c.id; learn(); }, filter === c.id ? 'on' : '');
      const color = c.id ? catColor(c.id) : '#3a3f47';
      b.append(c.id && mdi(c.id) || '', el('span', { textContent: c.name }), el('small', { textContent: `${cards(c.id).length}` }));
      b.style.background = color; b.style.color = c.id ? textOn(color) : '#fff';
      return b;
    })),
    el('div', { className: 'small', textContent: 'Karten pro Block' }),
    el('div', { className: 'chips' }, SIZES.map(n => btn(n || 'alle', () => { settings.block = n; saveLocal(); learn(); }, n === size ? 'on' : ''))),
    b('Fällige Karten', due, 'main'), b('Schwere Karten', hard), b('Alle üben', all),
    !all.length ? el('p', { textContent: 'Hier gibt es noch keine Karten.' }) : null);
  screen = 'learn';
}

function categoryList() {
  const row = c => {
    const list = cards(c.id);
    const pct = list.length ? Math.round(100 * list.filter(k => prog(k).box >= 4).length / list.length) : 0;
    const square = el('div', { className: 'square' }, mdi(c.id) || c.name.slice(0, 1).toUpperCase());
    square.style.background = catColor(c.id); square.style.color = textOn(catColor(c.id));
    const bar = el('div', { className: 'bar' }, el('div'));
    bar.firstChild.style.width = pct + '%'; bar.firstChild.style.background = catColor(c.id);
    const edit = btn('', e => { e.stopPropagation(); catEdit(c.id); }, 'pencil');
    edit.append(pencilIcon());
    edit.setAttribute('aria-label', 'Kategorie bearbeiten');
    return el('div', { className: 'box list catrow', onclick: () => { filter = c.id; go('cards'); } }, square,
      el('div', { className: 'grow' }, el('strong', { textContent: c.name }), bar,
        el('div', { className: 'small', textContent: `${list.length} Karten · ${pct} % sitzt` })),
      edit);
  };
  show(el('h2', { textContent: 'Kategorien' }), btn('+ Kategorie', addCategory, 'main'),
    btn('Alle Karten / Suche', () => { filter = ''; go('cards'); }), cats().map(row));
  screen = 'cats';
}

function catEdit(id) {
  const c = db.categories.find(x => x.id === id);
  show(el('h2', { textContent: 'Kategorie bearbeiten' }), badge(id),
    el('div', {}, btn('Umbenennen', () => renameCategory(id)), btn('Löschen', () => deleteCategory(id), 'bad')),
    el('p', { textContent: 'Farbe' }), colorPicker(c),
    el('p', { textContent: 'Icon' }), iconPicker(c),
    btn('Fertig', () => go('cats'), 'wide main'));
  back = () => go('cats');
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
  const key = dayKey(), before = dayTotal(key).r;
  db.log = db.log || {};
  const day = db.log[key] = db.log[key] || {};
  const mine = day[settings.dev] = day[settings.dev] || { r: 0, w: 0 };
  mine[ok ? 'r' : 'w']++;
  if (ok && before < GOAL && dayTotal(key).r >= GOAL) toast('🎯 Tagesziel geschafft!');
  save();
}

function session(queue, i = 0, st = { answered: 0, score: 0, streak: 0, best: 0, wrong: [], practice: false }) {
  if (i >= queue.length) return finished(st);
  const card = db.cards.find(x => x.id === queue[i].id);
  if (!card || card.deleted) return session(queue, i + 1, st);
  const box = prog(card).box;
  const area = el('div');
  const actions = el('div', { className: 'actions' });
  let answered = false;
  const buttons = (main) => actions.replaceChildren(btn('Abbrechen', () => go('learn')), main);
  const finish = ok => {                     // bewerten, Knopf wird zu „Weiter“
    answered = true;
    if (!st.practice) rate(card, ok);        // Wiederholung ändert den Lernstand nicht
    st.answered++;
    if (ok) { st.score++; st.streak++; st.best = Math.max(st.best, st.streak); }
    else { st.streak = 0; st.wrong.push(card); }
    if (ok && STREAKS[st.streak]) toast(STREAKS[st.streak]);
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [80, 60, 80]);
    buttons(btn('Weiter', () => session(queue, i + 1, st), 'main'));
  };
  let check;
  const questionBox = el('div', { className: 'box', textContent: card.question });

  if (card.type === 'free') {
    const nums = numbers(card.answer);
    const input = el('input', { className: 'answer', placeholder: 'Deine Antwort', autocomplete: 'off', inputMode: nums.length === 1 ? 'decimal' : 'text' });
    const solution = el('div');
    if (nums.length) thousands(input);
    check = () => {
      const ok = matches(input.value, card.answer);
      input.readOnly = true; input.classList.add(ok ? 'right' : 'wrong');
      input.value = (ok ? '✓ ' : '✗ ') + input.value;
      if (!ok) solution.replaceChildren(el('div', { className: 'opt right', textContent: card.answer }));
      finish(ok);
    };
    input.onkeydown = e => { if (e.key === 'Enter' && !input.readOnly) { e.preventDefault(); check(); } };
    area.append(input, solution);
  } else if (card.type === 'gap') {
    const test = gapQuestion(card, area, questionBox);
    check = () => finish(test());
  } else if (card.type === 'match') {
    const test = matchQuestion(card, area);
    check = () => finish(test());
  } else if (card.type === 'choice') {
    const single = card.options.filter(o => o.ok).length === 1;
    const opts = shuffle(card.options).map(o => {
      const b = btn(o.text, () => {
        if (single) opts.forEach(x => { if (x.b !== b) x.b.classList.remove('sel'); });
        b.classList.toggle('sel');
      }, 'opt');
      return { o, b };
    });
    area.append(el('p', { className: 'small', textContent: single ? 'Eine Antwort ist richtig.' : 'Mehrere Antworten sind richtig.' }), ...opts.map(x => x.b));
    check = () => {
      const ok = opts.every(x => x.b.classList.contains('sel') === x.o.ok);
      opts.forEach(x => {
        x.b.disabled = true;
        if (x.o.ok) x.b.classList.add('right'); else if (x.b.classList.contains('sel')) x.b.classList.add('wrong');
      });
      finish(ok);
    };
  } else {
    let items = shuffle(card.items);
    for (let n = 0; n < 10 && items.join('\n') === card.items.join('\n'); n++) items = shuffle(card.items);
    const list = el('div');
    let checked = false;
    const draw = () => list.replaceChildren(...items.map((t, k) => {
      const ok = t === card.items[k];
      const row = el('div', { className: 'opt sortrow' + (checked ? (ok ? ' right' : ' wrong') : '') },
        el('div', { className: 'grow' }, `${k + 1}. ${t}`,
          checked && !ok ? el('div', { className: 'small', textContent: `gehört auf ${card.items.indexOf(t) + 1}` }) : null));
      if (!checked) row.append(handle(row));
      row.dataset.text = t;
      return row;
    }));
    // Zeile am Griff ziehen (Finger oder Maus)
    const handle = row => {
      const h = el('div', { className: 'handle', textContent: '≡' });
      h.setAttribute('aria-label', 'Verschieben');
      h.onpointerdown = e => {
        e.preventDefault();
        row.classList.add('drag');
        let startY = e.clientY;
        const move = ev => {
          const prev = row.previousElementSibling, next = row.nextElementSibling;
          const mid = n => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; };
          const top = row.offsetTop;
          if (prev && ev.clientY < mid(prev)) { list.insertBefore(row, prev); startY += row.offsetTop - top; }
          else if (next && ev.clientY > mid(next)) { list.insertBefore(next, row); startY += row.offsetTop - top; }
          row.style.transform = `translateY(${ev.clientY - startY}px)`;
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          items = [...list.children].map(n => n.dataset.text);
          draw();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      };
      return h;
    };
    draw();
    area.append(list);
    check = () => { checked = true; draw(); finish(items.every((t, k) => t === card.items[k])); };
  }
  buttons(btn('Prüfen', () => check(), 'main'));

  const edit = btn('', () => {
    const saved = [...main.children];
    editCard(card, { hideAnswers: true }, () => {
      const now = db.cards.find(x => x.id === card.id);
      if (now.deleted) return session(queue, i + 1, st);
      if (!answered) return session(queue, i, st);
      show(saved); guard = 'Abfrage wirklich abbrechen?';
    });
    guard = 'Abfrage wirklich abbrechen?';
  }, 'pencil');
  edit.setAttribute('aria-label', 'Karte bearbeiten');
  edit.append(pencilIcon());
  const bar = barNode(100 * (i + 1) / queue.length, 100 * i / queue.length);
  show(el('div', { className: 'progress' }, el('span', { textContent: st.practice ? 'Wiederholung' : `Fach ${box}` }), el('span', { textContent: `${i + 1} / ${queue.length}` })), bar,
    el('div', { className: 'cardhead' }, el('div', {}, badge(card.cat), ' ', levelBadge(card)), edit),
    card.img ? imageView(card.img) : null, colored(questionBox, card.cat), area, actions);
  guard = 'Abfrage wirklich abbrechen?';
}

function finished(st) {
  const pct = st.answered ? Math.round(100 * st.score / st.answered) : 0;
  const again = st.wrong.slice();
  const ring = el('div', { className: 'ring' }, el('div', { className: 'pct', textContent: pct + ' %' }));
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
  ring.style.background = `conic-gradient(${color} ${pct}%, var(--card) 0)`;
  show(el('div', { className: 'result' }, ring,
      el('div', { textContent: `${st.score} von ${st.answered} richtig · beste Serie: ${st.best}` })),
    again.length ? btn(`${again.length} falsche nochmal`, () => session(shuffle(again), 0, { answered: 0, score: 0, streak: 0, best: 0, wrong: [], practice: true }), 'wide') : null,
    btn('Fertig', () => go('learn'), 'wide main'));
}

// Zahlenvergleich: Komma = Dezimalzeichen, Punkt in 3er-Gruppen = Tausender, keine Toleranz
const NUMBER = /(?:(?<![\d.,])-)?(?:[1-9]\d{0,2}(?:\.\d{3})+(?!\d)|\d+)(?:[.,]\d+)?/g;
const numbers = t => (String(t).match(NUMBER) || []).map(n =>
  Number((/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(n) ? n.replace(/\./g, '') : n).replace(',', '.')));
const group = t => t.replace(/(\d+)(,\d*)?/g, (m, int, dec = '') =>
  (int[0] === '0' ? int : int.replace(/\B(?=(\d{3})+$)/g, '.')) + dec);

// Beim Tippen Tausenderpunkte setzen; ein selbst getippter Punkt wird zum Komma
function thousands(input) {
  let last = input.value;
  input.addEventListener('input', e => {
    let v = input.value, pos = input.selectionStart ?? v.length;
    const type = e.inputType || '';
    if (type === 'insertFromPaste') { last = v; return; }
    if (type.startsWith('insert') && v[pos - 1] === '.') v = v.slice(0, pos - 1) + ',' + v.slice(pos);
    // Rücktaste auf einem Tausenderpunkt löscht die Ziffer davor
    if (type === 'deleteContentBackward' && last[pos] === '.' && v.replace(/\./g, '') === last.replace(/\./g, '')) {
      v = v.slice(0, pos - 1) + v.slice(pos); pos--;
    }
    const keep = v.slice(0, pos).replace(/\./g, '').length;
    input.value = last = group(v.replace(/\./g, ''));
    let p = 0;
    for (let n = 0; p < input.value.length && n < keep; p++) if (input.value[p] !== '.') n++;
    input.setSelectionRange(p, p);
  });
}
function matches(given, expected) {
  const want = numbers(expected), got = numbers(given);
  if (want.length) return got.length === want.length && want.every((n, k) => n === got[k]);
  const norm = t => t.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(given) === norm(expected);
}

/* ---------- Karten verwalten ---------- */
function addCategory() {
  const name = (prompt('Name der Kategorie') || '').trim();
  if (!name) return;
  let c = cats().find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!c) { c = { id: uid(), name, color: COLORS[cats().length % COLORS.length], updated: Date.now() }; db.categories.push(c); save(); }
  catEdit(c.id);
}
function renameCategory(id) {
  const c = db.categories.find(x => x.id === id);
  const name = (prompt('Neuer Name', c.name) || '').trim();
  if (!name) return;
  if (cats().some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) return alert('Diesen Namen gibt es schon.');
  c.name = name; c.updated = Date.now(); save(); catEdit(id);
}
async function deleteCategory(id) {
  const c = db.categories.find(x => x.id === id), n = cards(id).length;
  if (!confirm(n ? `Kategorie „${c.name}“ und ${n} Karten löschen?\nGilt auf allen Geräten. Vorher wird ein Backup gespeichert.` : `Kategorie „${c.name}“ löschen?`)) return;
  if (n) {
    try { await exportData(); } catch (e) { return alert('Backup fehlgeschlagen, es wurde nichts gelöscht.'); }
  }
  const now = Date.now();
  cards(id).forEach(k => Object.assign(k, { deleted: true, updated: now }));
  Object.assign(db.categories.find(x => x.id === id), { deleted: true, updated: now });
  if (filter === id) filter = '';
  save(); go('cats');
}

function cardList() {
  const list = el('div');
  const text = c => [c.question, c.answer, ...(c.options || []).map(o => o.text), ...(c.items || []), ...(c.extra || []), ...(c.pairs || []).flat()].join(' ').toLowerCase();
  const draw = () => {
    const hits = cards().filter(c => text(c).includes(query.trim().toLowerCase()));
    list.replaceChildren(...hits.map(c => colored(el('div', { className: 'box list', onclick: () => editCard(c) }, badge(c.cat), ' ', levelBadge(c),
      el('div', { textContent: c.question }),
      el('div', { className: 'small', textContent: `${TYPES[c.type]} · Fach ${prog(c).box}${c.img ? ' · 🖼️' : ''}` })), c.cat)),
      ...(hits.length ? [] : [el('p', { textContent: 'Keine Karten gefunden.' })]));
  };
  const search = el('input', { type: 'search', placeholder: '🔍 Suchen', value: query, oninput: () => { query = search.value; draw(); } });
  draw();
  show(el('h2', { textContent: 'Karten' }),
    catSelect(filter, true, v => { filter = v; cardList(); }), search,
    btn('+ Karte', () => editCard(null), 'main'), list);
  screen = 'cards';
  back = () => go('cats');
}

function editCard(card, preset = {}, done = cardList) {
  if (!cats().length) { alert('Lege zuerst eine Kategorie an.'); return addCategory(); }
  const cat = catSelect(card ? card.cat : preset.cat || filter || cats()[0].id, false);
  const type = el('select', {}, Object.entries(TYPES).map(([v, t]) => el('option', { value: v, textContent: t })));
  type.value = card ? card.type : preset.type || 'free';
  let level = card ? levelOf(card) : preset.level || settings.level || 'Allg.';
  const levels = el('div', { className: 'chips' });
  const drawLevels = () => levels.replaceChildren(...Object.entries(LEVELS).map(([name, color]) => {
    const b = btn(name, () => { level = name; drawLevels(); levels.dispatchEvent(new Event('change', { bubbles: true })); }, name === level ? 'on' : '');
    b.style.borderColor = color;
    if (name === level) { b.style.background = color; b.style.color = '#111'; } else b.style.color = color;
    return b;
  }));
  drawLevels();
  const q = el('textarea', { value: card ? card.question : '' });
  const answer = el('textarea', { value: card && card.answer || '' });
  const items = el('textarea', { value: card && card.items ? card.items.join('\n') : '' });
  const mode = el('select', {}, el('option', { value: 'bank', textContent: 'Begriffe in die Lücken ziehen' }),
    el('option', { value: 'type', textContent: 'Lücken selbst tippen' }));
  mode.value = card && card.mode === 'type' ? 'type' : 'bank';
  const extra = el('textarea', { value: card && card.extra ? card.extra.join('\n') : '' });
  const extraBox = el('div', {}, 'Falsche Begriffe (je Zeile einer, freiwillig)', extra);
  mode.onchange = () => extraBox.hidden = mode.value !== 'bank';
  mode.onchange();
  const pairs = el('textarea', { value: card && card.pairs ? card.pairs.map(p => p.join(' = ')).join('\n') : '' });
  const picture = imageField(card && card.img);
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
    free: el('div', {}, 'Richtige Antwort (wird automatisch geprüft)', answer),
    choice: el('div', {}, 'Antworten (Haken = richtig)', rows, btn('+ Antwort', () => addRow())),
    order: el('div', {}, 'Schritte in richtiger Reihenfolge (je Zeile einer)', items),
    gap: el('div', {}, el('p', { className: 'small', textContent: 'Lücken im Fragetext in [eckige Klammern] setzen. Alternativen: [TF|Truppführer]' }), 'Art', mode, extraBox),
    match: el('div', {}, 'Paare (je Zeile: links = rechts)', pairs)
  };
  const qLabel = el('span', { textContent: 'Frage' });
  const qField = el('div', {}, qLabel, q);
  const spoiler = el('div');
  type.onchange = () => {
    Object.entries(parts).forEach(([k, p]) => p.hidden = k !== type.value);
    qLabel.textContent = type.value === 'gap' ? 'Text mit [Lücken]' : 'Frage';
    // Beim Bearbeiten aus der Abfrage verrät der Lückentext die Lösung: einklappen
    if (preset.hideAnswers && type.value === 'gap') {
      if (!spoiler.firstChild) spoiler.append(el('details', {}, el('summary', { textContent: 'Text mit Lösungen anzeigen' })));
      spoiler.firstChild.append(qField);
    } else if (spoiler.firstChild) { spoiler.before(qField); spoiler.replaceChildren(); }
  };
  type.onchange();

  let saving = false;
  const submit = async () => {
    const data = { cat: cat.value, type: type.value, level, question: q.value.trim() };
    if (!data.question) return alert('Die Frage fehlt.');
    if (data.type === 'free') {
      data.answer = answer.value.trim();
      if (!data.answer) return alert('Die richtige Antwort fehlt.');
    } else if (data.type === 'choice') {
      data.options = [...rows.children].map(r => ({ ok: r.children[0].checked, text: r.children[1].value.trim() })).filter(o => o.text);
      if (data.options.length < 2 || !data.options.some(o => o.ok)) return alert('Mindestens 2 Antworten, davon 1 richtige.');
    } else if (data.type === 'gap') {
      if (!gapSolutions(data.question).length) return alert('Mindestens eine Lücke in [eckigen Klammern] angeben.');
      data.mode = mode.value;
      data.extra = extra.value.split('\n').map(s => s.trim()).filter(Boolean);
    } else if (data.type === 'match') {
      const list = parsePairs(pairs.value.split('\n').filter(l => l.trim()));
      if (list.length < 2 || list.some(p => !p || !p[0] || !p[1])) return alert('Mindestens 2 Zeilen im Format links = rechts.');
      data.pairs = list;
    } else {
      data.items = items.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (data.items.length < 2) return alert('Mindestens 2 Zeilen.');
    }
    if (saving) return;
    saving = true;
    try { data.img = await picture.value(); }
    catch (e) { saving = false; return alert('Bild konnte nicht gespeichert werden.'); }
    data.updated = Date.now();
    settings.level = level; saveLocal();
    if (card) Object.assign(db.cards.find(x => x.id === card.id), data); else db.cards.push({ id: uid(), ...data });
    save();
    if (card) done(); else { editCard(null, data, done); }   // direkt die nächste Karte
  };

  show(el('h2', { textContent: card ? 'Karte bearbeiten' : 'Neue Karte' }),
    el('div', { className: 'box form card-form' }, 'Kategorie', cat, 'Niveau', levels, 'Typ', type, qField, spoiler, picture.node, preset.hideAnswers
      ? el('details', {}, el('summary', { textContent: 'Antworten anzeigen' }), Object.values(parts))
      : Object.values(parts)),
    btn(card ? 'Speichern' : 'Speichern & nächste', submit, 'main'),
    btn('Zurück', () => done()),
    card ? btn('Löschen', () => {
      if (!confirm('Karte löschen?')) return;
      Object.assign(db.cards.find(x => x.id === card.id), { deleted: true, updated: Date.now() }); save(); done();
    }, 'bad') : null);
  back = () => done();
  type.onchange();
}

// Eingaben im Kartenformular merken
['input', 'change'].forEach(t => main.addEventListener(t, () => {
  if (main.querySelector('.card-form')) guard = 'Ungespeicherte Eingaben verwerfen?';
}));

/* ---------- Zurück-Taste ---------- */
const exitBox = el('div', { className: 'overlay', hidden: true }, el('div', { className: 'box form' },
  el('h2', { textContent: 'Wirklich verlassen?' }),
  el('p', { textContent: 'Zum Schließen noch einmal „Zurück“.' }),
  btn('Hier bleiben', () => {}, 'wide main')));
document.body.append(exitBox);
const arm = () => { if (!history.state) history.pushState({ app: 1 }, ''); };
document.addEventListener('click', () => { exitBox.hidden = true; arm(); }, true);
window.addEventListener('popstate', e => {
  if (e.state) return;
  if (document.body.classList.contains('start')) { exitBox.hidden = false; return; }
  if (!guard || confirm(guard)) (back || (() => go('home')))();
  history.forward();
});

/* ---------- Statistik ---------- */
function stats() {
  const line = (name, list) => {
    const r = list.reduce((s, c) => s + prog(c).right, 0), w = list.reduce((s, c) => s + prog(c).wrong, 0);
    return el('tr', {}, [name, list.length, list.filter(isDue).length, list.filter(isHard).length,
      r + w ? Math.round(100 * r / (r + w)) + ' %' : '–'].map(v => el('td', { textContent: v })));
  };
  const all = cards('');
  const days = [...Array(14).keys()].reverse().map(back => ({ key: dayKey(back), ...dayTotal(dayKey(back)) }));
  const max = Math.max(1, ...days.map(d => d.r + d.w));
  const column = d => {
    const part = (n, cls) => { const e = el('div', { className: cls }); e.style.height = `${110 * n / max}px`; return e; };
    return el('div', { className: 'col', title: `${d.key}: ${d.r} richtig, ${d.w} falsch` },
      el('span', { textContent: d.r + d.w || '' }), part(d.w, 'w'), part(d.r, 'r'), el('span', { textContent: d.key.slice(8) }));
  };
  show(el('h2', { textContent: 'Statistik' }),
    el('div', { className: 'box list' }, el('strong', { textContent: 'Letzte 14 Tage' }),
      el('div', { className: 'chart' }, days.map(column)),
      el('div', { className: 'small', textContent: '🟩 richtig · 🟥 falsch' })),
    el('div', { className: 'box list' }, el('table', {},
      el('tr', {}, ['Kategorie', 'Karten', 'Fällig', 'Schwer', 'Richtig'].map(v => el('th', { textContent: v }))),
      cats().map(c => line(c.name, cards(c.id))), line('Gesamt', all))),
    el('h2', { textContent: 'Lernfächer' }),
    el('div', { className: 'box list' }, [1, 2, 3, 4, 5].map(n => {
      const count = all.filter(c => prog(c).box === n).length;
      const pct = all.length ? Math.round(100 * count / all.length) : 0;
      return el('div', { className: 'boxrow' }, el('span', { textContent: `Fach ${n}` }), barNode(pct),
        el('span', { textContent: `${count} · ${pct} %` }));
    })));
  screen = 'stats';
}

/* ---------- Export / Import ---------- */
async function exportData() {
  const images = {};
  for (const id of usedImages()) { const d = await imgGet(id); if (d) images[id] = d; }
  const a = el('a', {
    href: URL.createObjectURL(new Blob([JSON.stringify({ ...db, images }, null, 1)], { type: 'application/json' })),
    download: `karteikarten_${new Date().toLocaleDateString('sv')}_${new Date().toTimeString().slice(0, 5).replace(':', '')}.json`
  });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function validCard(c) {
  return c && typeof c.id === 'string' && typeof c.question === 'string' && typeof c.cat === 'string' &&
    (c.deleted || (c.type === 'free' && typeof c.answer === 'string') ||
      (c.type === 'choice' && Array.isArray(c.options)) || (c.type === 'order' && Array.isArray(c.items)) ||
      c.type === 'gap' || (c.type === 'match' && Array.isArray(c.pairs) && c.pairs.every(Array.isArray)));
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
  const safe = k => !['__proto__', 'constructor', 'prototype'].includes(k);
  for (const [key, devs] of Object.entries(inc.log || {})) {
    if (!/^\d{4}-\d\d-\d\d$/.test(key)) continue;
    db.log = db.log || {};
    const day = db.log[key] = db.log[key] || {};
    for (const [dev, x] of Object.entries(devs || {})) {
      if (!safe(dev)) continue;
      const own = day[dev] || { r: 0, w: 0 };     // je Gerät gilt der höhere Stand
      day[dev] = { r: Math.max(own.r, Number(x.r) || 0), w: Math.max(own.w, Number(x.w) || 0) };
    }
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
      const inc = JSON.parse(await file.files[0].text());
      const r = merge(inc);
      for (const [id, d] of Object.entries(inc.images || {})) if (IMG_ID.test(id) && isImage(d)) await imgPut(id, d);
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
    importBox(),
    el('div', { className: 'box form' }, fields.map(f => f.node), btn('Speichern & synchronisieren', saveSettings, 'main'),
      el('p', { className: 'small status', textContent: syncText })),
    el('div', { className: 'box form' }, el('p', { textContent: 'Backup: alle Karten und Lernstand als Datei.' }), btn('Exportieren', exportData, 'main')),
    el('div', { className: 'box form' }, el('p', { textContent: 'Import führt zusammen. Bei Änderungen an derselben Karte gilt die neuere, auch beim Löschen.' }), file));
}

/* ---------- Import aus Excel (kopieren und einfügen) ---------- */
// Excel kopiert tabgetrennt; Zellen mit Sonderzeichen stehen in Anführungszeichen
function parseTable(text) {
  const rows = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { rows.at(-1).push(cell); cell = ''; }
    else if (ch === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else if (ch !== '\r') cell += ch;
  }
  rows.at(-1).push(cell);
  return rows;
}
const IMPORT_TYPES = { frei: 'free', freitext: 'free', auswahl: 'choice', ordnen: 'order', reihenfolge: 'order',
  'lückentext': 'gap', 'lückenwahl': 'gap', zuordnen: 'match' };
function readImport(text) {
  const rows = parseTable(text);
  let col = { cat: 0, level: 1, type: 2, q: 3, answers: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }, start = 0;
  const head = rows[0].map(h => h.trim().toLowerCase());
  const find = re => head.findIndex(h => re.test(h));
  if (find(/^kategorie/) >= 0 && find(/^frage$/) >= 0) {   // Kopfzeile mitkopiert: Spalten danach zuordnen
    col = { cat: find(/^kategorie/), level: find(/^niveau/), type: find(/typ/), q: find(/^frage$/),
      answers: head.map((h, i) => /antwort/.test(h) ? i : -1).filter(i => i >= 0) };
    start = 1;
  }
  const good = [], bad = [];
  rows.slice(start).forEach((r, n) => {
    if (r.every(c => !c.trim())) return;
    const get = i => (r[i] || '').trim();
    const line = n + start + 1, cat = get(col.cat), question = get(col.q);
    const type = IMPORT_TYPES[get(col.type).toLowerCase()];
    const lv = get(col.level).toLowerCase();
    const level = !lv || lv.startsWith('allg') ? 'Allg.' : Object.keys(LEVELS).find(k => k.toLowerCase() === lv);
    const answers = col.answers.map(get).filter(Boolean);
    const err = text => bad.push(`Zeile ${line}: ${text}`);
    if (!cat) return err('Kategorie fehlt');
    if (!question) return err('Frage fehlt');
    if (!type) return err('Typ unbekannt');
    if (!level) return err('Niveau unbekannt');
    const card = { type, level, question };
    if (type === 'free') {
      if (!answers.length) return err('Antwort fehlt');
      card.answer = answers[0];
    } else if (type === 'choice') {
      card.options = answers.map(a => ({ ok: a.startsWith('*'), text: a.replace(/^\*\s*/, '') })).filter(o => o.text);
      if (card.options.length < 2 || !card.options.some(o => o.ok)) return err('mind. 2 Antworten, richtige mit *');
    } else if (type === 'gap') {
      if (!gapSolutions(question).length) return err('keine [Lücke] im Text');
      card.mode = get(col.type).toLowerCase() === 'lückentext' ? 'type' : 'bank';
      card.extra = card.mode === 'bank' ? answers : [];
    } else if (type === 'match') {
      const list = parsePairs(answers);
      if (list.length < 2 || list.some(p => !p || !p[0] || !p[1])) return err('mind. 2 Paare als links=rechts');
      card.pairs = list;
    } else {
      if (answers.length < 2) return err('mind. 2 Antworten');
      card.items = answers;
    }
    good.push({ cat, card });
  });
  return { good, bad };
}
// Gleiche Frage in gleicher Kategorie: die importierte gewinnt, der Lernstand bleibt
function applyImport(list) {
  const norm = t => t.trim().replace(/\s+/g, ' ').toLowerCase();
  let added = 0, changed = 0;
  for (const { cat, card } of list) {
    let c = cats().find(x => norm(x.name) === norm(cat));
    if (!c) { c = { id: uid(), name: cat, color: COLORS[cats().length % COLORS.length], updated: Date.now() }; db.categories.push(c); }
    const own = db.cards.find(x => !x.deleted && x.cat === c.id && norm(x.question) === norm(card.question));
    const sig = k => JSON.stringify([k.type, levelOf(k), k.question,
      k.type === 'free' ? k.answer : k.type === 'choice' ? k.options.map(o => [o.text, !!o.ok])
        : k.type === 'gap' ? [k.mode, k.extra] : k.type === 'match' ? k.pairs : k.items]);
    const same = own && sig(own) === sig(card);
    if (same) continue;
    if (own) { delete own.answer; delete own.options; delete own.items; delete own.pairs; delete own.mode; delete own.extra; Object.assign(own, card, { updated: Date.now() }); changed++; }
    else { db.cards.push({ id: uid(), cat: c.id, ...card, updated: Date.now() }); added++; }
  }
  save();
  return { added, changed };
}
function importBox() {
  const area = el('textarea', { placeholder: 'Zeilen in Excel kopieren und hier einfügen' });
  const out = el('div');
  const check = () => {
    const { good, bad } = readImport(area.value);
    out.replaceChildren(el('p', { textContent: `${good.length} Karten bereit, ${bad.length} fehlerhafte Zeilen` }),
      ...bad.slice(0, 15).map(t => el('div', { className: 'small', textContent: t })),
      ...good.slice(0, 3).map(g => el('div', { className: 'small', textContent: `✓ ${g.cat}: ${g.card.question}` })),
      good.length ? btn(`${good.length} Karten importieren`, () => {
        const r = applyImport(good);
        area.value = ''; out.replaceChildren(el('p', { textContent: `Fertig: ${r.added} neu, ${r.changed} aktualisiert.` }));
      }, 'main') : '');
  };
  area.oninput = () => out.replaceChildren();
  return el('div', { className: 'box form' }, el('strong', { textContent: 'Aus Excel einfügen' }), area, btn('Prüfen', check, 'main'), out);
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
  return JSON.stringify(sorted({ version: 1, categories: [...d.categories].sort(byId), cards: [...d.cards].sort(byId), log: d.log || {} }), null, 1);
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
    await syncImages();
    setStatus('Synchronisiert um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    if (screen && document.activeElement?.type !== 'search') ({ home, learn, cats: categoryList, cards: cardList, stats })[screen]();   // nie ein Formular oder eine Abfrage stören
  } catch (e) {
    setStatus('Sync fehlgeschlagen: ' + e.message);
    if (manual) alert('Sync fehlgeschlagen: ' + e.message);
  }
  busy = false;
  if (again) { again = false; scheduleSync(500); }
}
window.addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => sync());

const NAVICONS = { home: 'home', learn: 'book', cats: 'folder', stats: 'chart' };
document.querySelectorAll('nav button').forEach(b => { b.prepend(icon(NAVICONS[b.dataset.view])); b.onclick = () => go(b.dataset.view); });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
go('home');
sync();
