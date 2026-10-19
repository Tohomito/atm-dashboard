/* Chart carousels (LinkedIn, Instagram & YouTube, and site sections): arrows step one card,
   the counter shows which cards are in view, and the track also scrolls by swipe or arrow keys. */
(function () {
document.querySelectorAll('.carousel').forEach(box => {
  const track = box.querySelector('.carousel-track'), prev = box.querySelector('.cprev'), next = box.querySelector('.cnext'), count = box.querySelector('.ccount');
  const cards = () => [...track.children];
  const step = () => { const c = cards()[0]; return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 18) : track.clientWidth; };
  const update = () => {
    const n = cards().length, s = step(), per = Math.max(1, Math.round(track.clientWidth / s));
    const first = Math.min(n - 1, Math.round(track.scrollLeft / s));
    const last = Math.min(n, first + per);
    count.textContent = per > 1 && last > first + 1 ? `${first + 1}–${last} of ${n}` : `${first + 1} of ${n}`;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
  });
  let t; track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 60); }, { passive: true });
  window.addEventListener('resize', update);
  update();
});
})();
