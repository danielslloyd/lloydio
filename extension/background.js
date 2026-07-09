// Background service worker: the right-click "Send to lloyd.studio" menu.
//
// One flat menu item (like "Save to Keep") that appears when you right-click
// a page, selected text, a link, or an image. It captures the most specific
// thing under the cursor and POSTs it straight to /api/capture — no popup.
// For notes/tags/podcast-flagging, use the toolbar button's popup instead.

const MENU_ID = 'send-to-lloydio';

chrome.runtime.onInstalled.addListener(() => {
  // removeAll first so updates don't create duplicates.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Send to lloyd.studio',
      contexts: ['page', 'selection', 'link', 'image'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const { endpoint, token } = await chrome.storage.sync.get(['endpoint', 'token']);
  if (!endpoint || !token) {
    flash(false, 'Set the site origin and token in the extension settings first.');
    chrome.runtime.openOptionsPage();
    return;
  }

  const payload = pickCapture(info, tab);
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    flash(true, payload.title || payload.url || 'note');
  } catch (err) {
    flash(false, err.message);
  }
});

// Choose the most specific target under the cursor.
function pickCapture(info, tab) {
  if (info.linkUrl) {
    return { url: info.linkUrl, title: info.linkText || tab?.title || undefined };
  }
  if (info.mediaType === 'image' && info.srcUrl) {
    return {
      url: info.srcUrl,
      title: tab?.title || undefined,
      note: info.pageUrl ? `Image from ${info.pageUrl}` : undefined,
    };
  }
  // page or text selection
  return {
    url: info.pageUrl || tab?.url,
    title: tab?.title || undefined,
    note: info.selectionText || undefined,
  };
}

// Feedback: a badge on the toolbar icon (always) + a toast (best effort).
function flash(ok, msg) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#111111' : '#b00020' });
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: ok ? 'Saved to lloyd.studio' : 'lloyd.studio — failed',
      message: (msg || '').slice(0, 200),
    });
  } catch {
    /* notifications are optional */
  }
}
