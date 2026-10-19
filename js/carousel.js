/* Chart carousels (newsletter, LinkedIn, Instagram & YouTube, and site sections).
   They page only with the arrow buttons (or the arrow keys when the carousel has focus):
   no sideways scrolling by trackpad, wheel or swipe. Each click moves one full page. */
(function () {
document.querySelectorAll('.carousel').forEach(box => {
  const track = box.querySelector('.carousel-track'), prev = box.querySelector('.cprev'), next = box.querySelector('.cnext'), count = box.querySelector('.ccount');
  const n = track.children.length;
  let page = 0;
  const per = () => { const c = track.children[0]; if (!c) return 1; const w = c.getBoundingClientRect().width; return Math.max(1, Math.round((track.clientWidth + 18) / (w + 18))); };
  const pages = () => Math.ceil(n / per());
  const show = (smooth) => {
    const p = per(), last = pages() - 1;
    page = Math.max(0, Math.min(page, last));
    const first = Math.max(0, Math.min(page * p, n - p)), card = track.children[first];
    track.scrollTo({ left: card ? card.offsetLeft - track.children[0].offsetLeft : 0, behavior: smooth ? 'smooth' : 'auto' });
    const end = Math.min(n, first + p);
    count.textContent = end > first + 1 ? `${first + 1}–${end} of ${n}` : `${first + 1} of ${n}`;
    prev.disabled = page === 0; next.disabled = page === last;
  };
  prev.addEventListener('click', () => { page--; show(true); });
  next.addEventListener('click', () => { page++; show(true); });
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); if (!next.disabled) next.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (!prev.disabled) prev.click(); }
  });
  // block sideways trackpad/wheel scrolling inside the carousel; vertical page scrolling still works
  track.addEventListener('wheel', e => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault(); }, { passive: false });
  // keep the current page aligned if anything nudges the scroll position, and on resize
  track.addEventListener('scroll', () => { clearTimeout(track._t); track._t = setTimeout(() => show(false), 120); }, { passive: true });
  window.addEventListener('resize', () => show(false));
  show(false);
});
})();
