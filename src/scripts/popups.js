// Link previews ("popups, lite"): hovering a footnote reference or an
// internal link shows a floating preview. Internal pages are fetched
// same-origin and their <main> content excerpted. Desktop-only (hover).

const HOVER_DELAY = 350;
const pageCache = new Map();
let activePopup = null;
let showTimer = null;
let hideTimer = null;

function isInternal(a) {
  return (
    a.origin === location.origin &&
    a.pathname !== location.pathname &&
    !a.hasAttribute('data-footnote-ref') &&
    !a.hasAttribute('data-footnote-backref') &&
    !a.pathname.match(/\.(xml|pdf|mp3|ogg|zip|json)$/)
  );
}

function removePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}

function showPopup(anchor, contentEl, title) {
  removePopup();
  const pop = document.createElement('div');
  pop.className = 'popup';
  if (title) {
    const t = document.createElement('span');
    t.className = 'popup-title';
    t.textContent = title;
    pop.appendChild(t);
  }
  pop.appendChild(contentEl);
  document.body.appendChild(pop);

  const rect = anchor.getBoundingClientRect();
  const popWidth = Math.min(pop.offsetWidth, 420);
  let left = rect.left + window.scrollX;
  if (left + popWidth > window.scrollX + document.documentElement.clientWidth - 16) {
    left = window.scrollX + document.documentElement.clientWidth - popWidth - 16;
  }
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  activePopup = pop;

  pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  pop.addEventListener('mouseleave', scheduleHide);
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(removePopup, 300);
}

async function fetchExcerpt(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const main = doc.querySelector('main') || doc.body;
  const title = (doc.querySelector('h1') || doc.querySelector('title'))?.textContent?.trim() || '';
  const frag = document.createElement('div');
  let count = 0;
  for (const el of main.querySelectorAll('p, li, blockquote')) {
    if (el.closest('.footnotes, .sidenote, nav, header, footer')) continue;
    const text = el.textContent.trim();
    if (!text) continue;
    const p = document.createElement('p');
    p.textContent = text.length > 400 ? text.slice(0, 400) + '…' : text;
    frag.appendChild(p);
    count += 1;
    if (count >= 3) break;
  }
  const result = { title, frag };
  pageCache.set(url, result);
  return result;
}

function footnoteContent(a) {
  const href = a.getAttribute('href');
  if (!href || !href.startsWith('#')) return null;
  const li = document.getElementById(decodeURIComponent(href.slice(1)));
  if (!li) return null;
  const clone = li.cloneNode(true);
  clone.querySelectorAll('a[data-footnote-backref]').forEach((el) => el.remove());
  const div = document.createElement('div');
  while (clone.firstChild) div.appendChild(clone.firstChild);
  return div;
}

function attach() {
  if (matchMedia('(hover: none)').matches) return; // touch devices: skip

  document.querySelectorAll('main a[href]').forEach((a) => {
    const isFootnote = a.hasAttribute('data-footnote-ref');
    if (!isFootnote && !isInternal(a)) return;

    a.addEventListener('mouseenter', () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      showTimer = setTimeout(async () => {
        try {
          if (isFootnote) {
            const content = footnoteContent(a);
            if (content) showPopup(a, content);
          } else {
            const { title, frag } = await fetchExcerpt(a.pathname);
            if (frag.childNodes.length) showPopup(a, frag, title);
          }
        } catch {
          /* preview is best-effort */
        }
      }, HOVER_DELAY);
    });
    a.addEventListener('mouseleave', () => {
      clearTimeout(showTimer);
      scheduleHide();
    });
  });
}

attach();
