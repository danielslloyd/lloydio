const $ = (id) => document.getElementById(id);
let tabUrl = '';

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  tabUrl = tab?.url || '';
  $('title').value = tab?.title || '';
});

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$('save').addEventListener('click', async () => {
  const { endpoint, token } = await chrome.storage.sync.get(['endpoint', 'token']);
  if (!endpoint || !token) {
    $('status').textContent = 'Set endpoint & token in settings first.';
    return;
  }
  $('status').textContent = 'saving…';
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: tabUrl || undefined,
        title: $('title').value.trim() || undefined,
        note: $('note').value.trim() || undefined,
        tags: $('tags').value.split(',').map((t) => t.trim()).filter(Boolean),
        podcast: $('podcast').checked,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    $('status').textContent = 'saved ✓';
    setTimeout(() => window.close(), 800);
  } catch (err) {
    $('status').textContent = `failed: ${err.message}`;
  }
});
