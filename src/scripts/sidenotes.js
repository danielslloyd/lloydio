// Sidenotes: on wide screens, mirror each footnote into the right margin,
// vertically aligned with its reference (Tufte/gwern style). The original
// footnote block is hidden via CSS while sidenotes are shown.

function buildSidenotes() {
  const article = document.querySelector('main.article');
  if (!article) return;

  const refs = article.querySelectorAll('a[data-footnote-ref]');
  if (refs.length === 0) return;

  article.style.position = 'relative';
  document.body.classList.add('has-sidenotes');

  refs.forEach((ref, i) => {
    const href = ref.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    const li = document.getElementById(decodeURIComponent(href.slice(1)));
    if (!li) return;

    const note = document.createElement('aside');
    note.className = 'sidenote';
    const num = document.createElement('span');
    num.className = 'sidenote-number';
    num.textContent = String(i + 1);
    note.appendChild(num);
    const body = li.cloneNode(true);
    body.querySelectorAll('a[data-footnote-backref]').forEach((a) => a.remove());
    while (body.firstChild) note.appendChild(body.firstChild);
    article.appendChild(note);
    ref.dataset.sidenoteIndex = String(i);
  });

  positionSidenotes();
}

function positionSidenotes() {
  const article = document.querySelector('main.article');
  if (!article) return;
  const notes = article.querySelectorAll('.sidenote');
  if (notes.length === 0) return;

  const articleTop = article.getBoundingClientRect().top + window.scrollY;
  let lastBottom = 0;
  document.querySelectorAll('a[data-footnote-ref]').forEach((ref) => {
    const idx = ref.dataset.sidenoteIndex;
    if (idx === undefined) return;
    const note = notes[Number(idx)];
    if (!note) return;
    const refTop = ref.getBoundingClientRect().top + window.scrollY - articleTop;
    const top = Math.max(refTop, lastBottom);
    note.style.top = `${top}px`;
    lastBottom = top + note.offsetHeight + 12;
  });
}

buildSidenotes();
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(positionSidenotes, 150);
});
// Reposition once fonts/images settle.
window.addEventListener('load', positionSidenotes);
