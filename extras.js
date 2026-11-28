'use strict';
/* ---------- Lückentext, Zuordnen, Ziehen ---------- */
const GAP = /\[([^\[\]]+)\]/g;
const gapSolutions = q => [...String(q).matchAll(GAP)].map(m => m[1].trim());
const gapMatches = (given, solution) => solution.split('|').some(s => matches(given, s.trim()));
const parsePairs = lines => lines.map(l => {
  const i = l.indexOf('=');
  return i < 0 ? null : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
});

// Begriffe in Felder ziehen (Antippen geht auch)
function dragBoard(slots, terms) {
  const pool = el('div', { className: 'pool' });
  const place = (chip, target) => {
    if (target !== pool) { const old = target.querySelector('.chip'); if (old && old !== chip) pool.append(old); }
    target.append(chip);
  };
  let locked = false;
  const make = term => {
    const chip = el('div', { className: 'chip', textContent: term });
    chip.onpointerdown = e => {
      if (locked) return;
      e.preventDefault();
      const x = e.clientX, y = e.clientY;
      let moved = false;
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - x, ev.clientY - y) < 6) return;
        moved = true; chip.classList.add('drag');
        chip.style.transform = `translate(${ev.clientX - x}px,${ev.clientY - y}px)`;
        if (ev.clientY > innerHeight - 110) scrollBy(0, 12); else if (ev.clientY < 60) scrollBy(0, -12);
      };
      const up = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
        chip.classList.remove('drag'); chip.style.transform = '';
        if (!moved) {                          // nur angetippt
          const free = slots.find(s => !s.querySelector('.chip'));
          if (chip.parentNode !== pool) pool.append(chip); else if (free) place(chip, free);
          return;
        }
        chip.style.visibility = 'hidden';
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        chip.style.visibility = '';
        const slot = slots.find(s => s.contains(hit));
        if (slot) {
          const from = chip.parentNode, old = slot.querySelector('.chip');
          if (old && old !== chip && from !== pool) from.append(old), slot.append(chip);   // tauschen
          else place(chip, slot);
        } else if (hit && pool.contains(hit)) pool.append(chip);
      };
      const cancel = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
        chip.classList.remove('drag'); chip.style.transform = '';
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
    };
    return chip;
  };
  pool.append(...shuffle(terms).map(make));
  return {
    pool,
    values: () => slots.map(s => s.querySelector('.chip')?.textContent ?? ''),
    lock: () => { locked = true; }
  };
}

// Liefert die Prüffunktion, die den Bereich einfärbt und true/false zurückgibt
function gapQuestion(card, area, questionBox) {
  const solutions = gapSolutions(card.question), bank = card.mode !== 'type';
  const slots = [], text = [];
  card.question.split(GAP).forEach((part, i) => {
    if (i % 2 === 0) return text.push(part);
    const slot = bank ? el('span', { className: 'slot gap' })
      : el('input', { className: 'gapinput', autocomplete: 'off', inputMode: numbers(part).length === 1 ? 'decimal' : 'text' });
    if (!bank && numbers(part).length) thousands(slot);
    slots.push(slot); text.push(slot);
  });
  questionBox.replaceChildren(...text);
  const board = bank ? dragBoard(slots, [...solutions.map(s => s.split('|')[0].trim()), ...(card.extra || [])]) : null;
  if (board) area.append(board.pool);
  return () => {
    const given = board ? board.values() : slots.map(s => s.value);
    const ok = solutions.map((s, i) => gapMatches(given[i], s));
    if (board) board.lock();
    slots.forEach((slot, i) => {
      slot.classList.add(ok[i] ? 'right' : 'wrong');
      if (!bank) slot.readOnly = true;
      if (!ok[i]) slot.after(el('span', { className: 'fix', textContent: solutions[i].split('|')[0] }));
    });
    return ok.every(Boolean);
  };
}

function matchQuestion(card, area) {
  const slots = [];
  const rows = shuffle(card.pairs).map(([left, right]) => {
    const slot = el('div', { className: 'slot' });
    slots.push(slot);
    return { right, slot, node: el('div', { className: 'pair' }, el('div', { className: 'left', textContent: left }), slot) };
  });
  const board = dragBoard(slots, card.pairs.map(p => p[1]));
  area.append(...rows.map(r => r.node), board.pool);
  return () => {
    const given = board.values();
    board.lock();
    const ok = rows.map((r, i) => given[i] === r.right);
    rows.forEach((r, i) => {
      r.slot.classList.add(ok[i] ? 'right' : 'wrong');
      if (!ok[i]) r.slot.after(el('div', { className: 'fix', textContent: '→ ' + r.right }));
    });
    return ok.every(Boolean);
  };
}

/* ---------- Bilder (IndexedDB, getrennt von den Karten) ---------- */
const IMG_ID = /^[a-z0-9]+$/;
const isImage = d => typeof d === 'string' && d.startsWith('data:image/jpeg;base64,');
let imgDbPromise = null;
function imgDb() {
  return imgDbPromise || (imgDbPromise = new Promise((ok, no) => {
    const r = indexedDB.open('karteikarten', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('img');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { imgDbPromise = null; no(r.error); };
  }));
}
async function imgStore(mode, run) {
  const idb = await imgDb();
  return new Promise((ok, no) => {
    const tx = idb.transaction('img', mode), req = run(tx.objectStore('img'));
    tx.oncomplete = () => ok(req.result);
    tx.onerror = tx.onabort = () => no(tx.error);
  });
}
const imgGet = id => imgStore('readonly', s => s.get(id));
const imgPut = (id, data) => imgStore('readwrite', s => s.put(data, id));
const usedImages = () => [...new Set(db.cards.filter(c => !c.deleted && IMG_ID.test(c.img || '')).map(c => c.img))];

function imageView(id) {
  const box = el('div', { className: 'picture' });
  imgGet(id).then(data => {
    if (!isImage(data)) return box.append(el('div', { className: 'small', textContent: 'Bild noch nicht geladen, bitte synchronisieren.' }));
    const img = el('img', { src: data, alt: 'Bild zur Frage' });
    img.onclick = () => img.classList.toggle('big');
    box.append(img);
  }).catch(() => box.append(el('div', { className: 'small', textContent: 'Bild kann nicht gelesen werden.' })));
  return box;
}

// Foto verkleinern: lange Kante höchstens 1280 px, unter ca. 900 kB
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  for (let edge = 1280, q = 0.78; ; edge = Math.round(edge * 0.8), q = 0.7) {
    const f = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    const canvas = el('canvas', { width: Math.round(bmp.width * f), height: Math.round(bmp.height * f) });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', q);
    if (data.length < 900000 || edge < 500) return data;
  }
}

// Bildfeld im Kartenformular
function imageField(current) {
  let id = current || '', data = null, waiting = Promise.resolve();
  const preview = el('div');
  const draw = () => preview.replaceChildren(...(data ? [el('div', { className: 'picture' }, el('img', { src: data, alt: '' }))] : id ? [imageView(id)] : []),
    ...(id || data ? [btn('Bild entfernen', () => { id = ''; data = null; changed(); draw(); }, 'bad')] : []));
  const changed = () => preview.dispatchEvent(new Event('change', { bubbles: true }));
  const pick = (label, capture) => {
    const input = el('input', { type: 'file', accept: 'image/*', hidden: true });
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      waiting = shrink(file).then(d => { data = d; id = uid(); changed(); draw(); }).catch(() => alert('Bild konnte nicht gelesen werden.'));
    };
    return [input, btn(label, () => input.click())];
  };
  draw();
  return {
    node: el('div', {}, 'Bild (freiwillig)', el('div', {}, ...pick('📷 Kamera', true), ...pick('🖼️ Galerie')), preview),
    async value() {
      await waiting;
      if (data) await imgPut(id, data);
      return id;
    }
  };
}

// Fehlende Bilder hoch- und herunterladen
async function syncImages() {
  const used = usedImages();
  if (!used.length) return;
  const res = await api('/contents/images');
  if (!res.ok && res.status !== 404) fail(res);
  const remote = new Map(res.ok ? (await res.json()).map(f => [f.name.replace('.jpg', ''), f.sha]) : []);
  for (const id of used) {
    const local = await imgGet(id);
    if (local && !remote.has(id)) {
      const put = await api(`/contents/images/${id}.jpg`, { method: 'PUT', body: JSON.stringify({ message: 'Bild', content: local.split(',')[1] }) });
      if (!put.ok && put.status !== 409 && put.status !== 422) fail(put);
    } else if (!local && remote.has(id)) {
      const blob = await api('/git/blobs/' + remote.get(id));
      if (!blob.ok) fail(blob);
      await imgPut(id, 'data:image/jpeg;base64,' + (await blob.json()).content.replace(/\s/g, ''));
    }
  }
}
