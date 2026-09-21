/* Browser shell. The renderer does the real work; this wires it to a textarea. */

const uiEl = (id) => document.getElementById(id);
const uiEditor = uiEl('editor');
const uiStage = uiEl('stage');

let uiCurrentSvg = '';

/* ------------------------------------------------------------- persistence */

// UTF-8 safe base64 for the URL hash, so a roadmap travels as a link and never
// touches a server.
function uiEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function uiDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function uiLoadInitial() {
  const hash = location.hash.match(/[#&]d=([^&]+)/);
  if (hash) {
    try {
      return uiDecode(hash[1]);
    } catch (err) {
      /* fall through to the saved copy */
    }
  }
  try {
    const saved = localStorage.getItem('plotline:doc');
    if (saved) return saved;
  } catch (err) {
    /* private mode: just use the example */
  }
  return PLOTLINE_EXAMPLES[PLOTLINE_EXAMPLE_ORDER[0]];
}

function uiSave(text) {
  try {
    localStorage.setItem('plotline:doc', text);
  } catch (err) {
    /* storage blocked; the document still lives in the textarea */
  }
}

/* ------------------------------------------------------------------ render */

function uiRender() {
  const text = uiEditor.value;
  uiSave(text);

  let doc;
  try {
    doc = parse(text);
  } catch (err) {
    uiStatus('error', err.message, []);
    return;
  }

  const themePick = uiEl('theme').value;
  if (themePick && themePick !== 'auto') doc.theme = themePick;

  try {
    uiCurrentSvg = render(doc);
    uiStage.innerHTML = uiCurrentSvg;
  } catch (err) {
    uiStatus('error', 'Could not draw this roadmap: ' + err.message, []);
    return;
  }

  const count = doc.lanes.reduce((n, lane) => n + lane.items.length, 0);
  const summary = `${count} item${count === 1 ? '' : 's'} · ${doc.lanes.length} ${
    doc.mode === 'timeline' ? 'lane' : 'column'
  }${doc.lanes.length === 1 ? '' : 's'}`;
  uiStatus(doc.warnings.length ? 'warn' : 'ok', summary, doc.warnings);
}

function uiStatus(kind, message, warnings) {
  const status = uiEl('status');
  status.className = kind === 'ok' ? 'ok' : 'warn';
  status.textContent = message;
  uiEl('issues').innerHTML = warnings
    .slice(0, 4)
    .map((w) => `<span class="warn"><code>line ${w.line}</code> ${uiEscape(w.message)}</span>`)
    .join('');
}

const uiEscape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ export */

function uiDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const uiFilename = () => {
  const title = (parse(uiEditor.value).title || 'roadmap').toLowerCase();
  return title.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roadmap';
};

// The SVG has no external references, so the canvas never taints and toBlob works.
function uiToPng(scale = 2) {
  return new Promise((resolve, reject) => {
    const size = uiCurrentSvg.match(/width="(\d+)" height="(\d+)"/);
    if (!size) return reject(new Error('nothing to export'));
    const [w, h] = [Number(size[1]), Number(size[2])];
    const blob = new Blob([uiCurrentSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('export failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('export failed'));
    };
    img.src = url;
  });
}

let uiToastTimer;
function uiToast(message) {
  const el = uiEl('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(uiToastTimer);
  uiToastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* -------------------------------------------------------------------- wire */

function uiBoot() {
  const themeSelect = uiEl('theme');
  themeSelect.innerHTML =
    '<option value="auto">Theme: from file</option>' +
    THEME_NAMES.map((name) => `<option value="${name}">${THEMES[name].label}</option>`).join('');

  const exampleSelect = uiEl('example');
  exampleSelect.innerHTML =
    '<option value="">Examples…</option>' +
    PLOTLINE_EXAMPLE_ORDER.map((name) => `<option value="${name}">${name}</option>`).join('');

  uiEditor.value = uiLoadInitial();
  uiRender();

  let timer;
  uiEditor.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(uiRender, 120);
  });

  // Tab indents instead of escaping the editor.
  uiEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t, value } = uiEditor;
      uiEditor.value = value.slice(0, s) + '  ' + value.slice(t);
      uiEditor.selectionStart = uiEditor.selectionEnd = s + 2;
      uiRender();
    }
  });

  themeSelect.addEventListener('change', uiRender);
  exampleSelect.addEventListener('change', (e) => {
    const pick = e.target.value;
    if (!pick) return;
    uiEditor.value = PLOTLINE_EXAMPLES[pick];
    e.target.value = '';
    themeSelect.value = 'auto';
    uiRender();
  });

  uiEl('svg').addEventListener('click', () => {
    uiDownload(new Blob([uiCurrentSvg], { type: 'image/svg+xml' }), uiFilename() + '.svg');
  });

  uiEl('png').addEventListener('click', async () => {
    try {
      uiDownload(await uiToPng(2), uiFilename() + '.png');
    } catch (err) {
      uiToast(err.message);
    }
  });

  uiEl('copy').addEventListener('click', async () => {
    try {
      const blob = await uiToPng(2);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      uiToast('PNG copied — paste it anywhere');
    } catch (err) {
      uiToast('Clipboard blocked here — use the PNG button');
    }
  });

  uiEl('share').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#d=' + uiEncode(uiEditor.value);
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      uiToast('Link copied — the roadmap travels inside it');
    } catch (err) {
      uiToast('Link is in the address bar');
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      uiEl('svg').click();
    }
  });

  // Drop a .md file straight onto the editor.
  uiEditor.addEventListener('dragover', (e) => e.preventDefault());
  uiEditor.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    uiEditor.value = await file.text();
    uiRender();
  });

  uiSplitter();
}

function uiSplitter() {
  const grip = uiEl('grip');
  const main = document.querySelector('main');
  let dragging = false;

  const move = (event) => {
    if (!dragging) return;
    const vertical = window.innerWidth <= 860;
    const rect = main.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    const ratio = vertical
      ? (point.clientY - rect.top) / rect.height
      : (point.clientX - rect.left) / rect.width;
    const clamped = Math.min(0.8, Math.max(0.15, ratio));
    const percent = `${(clamped * 100).toFixed(2)}%`;
    if (vertical) main.style.gridTemplateRows = `${percent} 6px minmax(0, 1fr)`;
    else main.style.setProperty('--split', percent);
  };

  const stop = () => {
    dragging = false;
    grip.classList.remove('active');
    document.body.style.userSelect = '';
  };

  grip.addEventListener('mousedown', () => {
    dragging = true;
    grip.classList.add('active');
    document.body.style.userSelect = 'none';
  });
  grip.addEventListener('touchstart', () => {
    dragging = true;
  }, { passive: true });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: true });
  window.addEventListener('mouseup', stop);
  window.addEventListener('touchend', stop);
}

uiBoot();
