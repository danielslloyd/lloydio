// Owner-mode inline editor for category docs (commonplace/quotes/…).
//
// Rendered only in DRAFTS builds by CategoryDoc.astro. The editing textarea is
// pre-filled with the doc's raw markdown *body*; this module wires up a live
// marked preview plus save / discard / undo / redo. Saving POSTs the body to
// /api/docs, which preserves the file's frontmatter and commits to GitHub.
import { marked } from 'marked';

export function initDocEditor() {
  const editor = document.querySelector('.doc-editor');
  if (!editor) return;

  const slug = editor.dataset.slug;
  const input = editor.querySelector('.doc-editor-input');
  const preview = editor.querySelector('.doc-editor-preview');
  const status = editor.querySelector('.doc-editor-status');
  const toggle = document.getElementById('doc-edit-toggle');
  const rendered = document.querySelector('.doc-rendered');
  const btn = (name) => editor.querySelector(`[data-ed="${name}"]`);

  const API = '/api/docs';
  const TOKEN_KEY = 'lloydio_owner_token';

  marked.setOptions({ gfm: true, breaks: false });

  let saved = input.value; // last-saved baseline
  let history = [input.value]; // undo/redo stack of snapshots
  let hi = 0; // cursor into history
  let historyTimer = null;

  const dirty = () => input.value !== saved;

  function renderPreview() {
    preview.innerHTML = marked.parse(input.value);
  }

  function setStatus(msg, kind) {
    status.textContent = msg != null ? msg : dirty() ? 'unsaved changes' : 'saved';
    status.dataset.kind = kind || (dirty() ? 'dirty' : 'clean');
  }

  function updateButtons() {
    // Undo is available if there's an earlier snapshot, or the current text has
    // un-snapshotted edits (typed within the debounce window) to roll back.
    btn('undo').disabled = hi <= 0 && input.value === history[hi];
    btn('redo').disabled = input.value === history[hi] && hi >= history.length - 1;
    btn('save').disabled = !dirty();
    btn('discard').disabled = !dirty();
  }

  // Snapshot the current value as a new history step (typing is debounced so a
  // burst of keystrokes collapses into one undoable step).
  function pushHistory() {
    if (input.value === history[hi]) return;
    history = history.slice(0, hi + 1);
    history.push(input.value);
    hi = history.length - 1;
    if (history.length > 200) {
      history.shift();
      hi--;
    }
  }

  function applyHistory() {
    input.value = history[hi];
    renderPreview();
    setStatus();
    updateButtons();
  }

  input.addEventListener('input', () => {
    renderPreview();
    setStatus();
    updateButtons();
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      pushHistory();
      updateButtons();
    }, 350);
  });

  btn('undo').addEventListener('click', () => {
    clearTimeout(historyTimer);
    pushHistory(); // capture in-progress typing before stepping back
    if (hi > 0) {
      hi--;
      applyHistory();
    }
  });

  btn('redo').addEventListener('click', () => {
    if (hi < history.length - 1) {
      hi++;
      applyHistory();
    }
  });

  btn('discard').addEventListener('click', () => {
    if (dirty() && !confirm('Discard unsaved changes and revert to the last saved version?')) return;
    input.value = saved;
    pushHistory();
    renderPreview();
    setStatus('reverted', 'clean');
    updateButtons();
  });

  // --- save --------------------------------------------------------------
  function post(payload, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    // Same-origin request carries the Cloudflare Access cookie on the owner
    // site, so it authenticates itself; the token is only a fallback.
    return fetch(API, { method: 'POST', headers, body: payload, credentials: 'include' });
  }

  async function save() {
    const payload = JSON.stringify({ slug, body: input.value });
    let res = await post(payload, localStorage.getItem(TOKEN_KEY) || '');
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      const t = (prompt('Not authenticated. Owner token (CAPTURE_TOKEN):') || '').trim();
      if (!t) throw new Error('unauthorized');
      localStorage.setItem(TOKEN_KEY, t);
      res = await post(payload, t);
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        throw new Error('unauthorized — token rejected');
      }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'save failed (' + res.status + ')');
    return data;
  }

  btn('save').addEventListener('click', async () => {
    if (!dirty()) return;
    btn('save').disabled = true;
    setStatus('saving…', 'busy');
    try {
      await save();
      saved = input.value;
      setStatus('saved · site is rebuilding', 'clean');
    } catch (e) {
      setStatus('save failed: ' + e.message, 'error');
    }
    updateButtons();
  });

  // --- show / hide -------------------------------------------------------
  if (toggle) {
    toggle.addEventListener('click', () => {
      const opening = editor.hasAttribute('hidden');
      if (opening) {
        editor.removeAttribute('hidden');
        if (rendered) rendered.setAttribute('hidden', '');
        toggle.textContent = 'close editor';
        renderPreview();
        setStatus();
        updateButtons();
        input.focus();
      } else {
        if (dirty() && !confirm('You have unsaved changes. Close the editor anyway?')) return;
        editor.setAttribute('hidden', '');
        if (rendered) rendered.removeAttribute('hidden');
        toggle.textContent = 'edit';
      }
    });
  }

  // --- keyboard shortcuts ------------------------------------------------
  input.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') {
      e.preventDefault();
      btn('save').click();
    } else if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      btn('undo').click();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      btn('redo').click();
    }
  });

  renderPreview();
  setStatus();
  updateButtons();
}
