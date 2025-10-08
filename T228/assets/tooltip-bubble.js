
(function(){
  // SCOPED VERSION: only show tooltips for elements that explicitly have data-tip
  const TIP_CLASS = 'ui-tip-bubble';
  let tipEl = null;
  let hideTimer = null;
  let currentTarget = null;

  function getTipEl(){
    if (!tipEl){
      tipEl = document.createElement('div');
      tipEl.className = TIP_CLASS;
      tipEl.setAttribute('role','tooltip');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function positionTip(el, target){
    const r = target.getBoundingClientRect();
    const margin = 10;
    const gap = 12;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    el.style.left = '-9999px';
    el.style.top  = '-9999px';
    el.style.display = 'block';
    el.style.opacity = '0';

    const w = el.offsetWidth;
    const h = el.offsetHeight;

    // Prefer top-right of target
    let left = scrollX + r.right + gap;
    let top  = scrollY + r.top;

    // If off right, try left
    if (left + w - scrollX > vw - margin){
      left = scrollX + r.left - w - gap;
    }

    // If still off horizontally, fallback above-center
    if (left < scrollX + margin || left + w > scrollX + vw - margin){
      left = scrollX + r.left + r.width/2 - w/2;
      top  = scrollY + r.top - h - gap;
    }

    // Clamp inside viewport
    left = clamp(left, scrollX + margin, scrollX + vw - w - margin);
    top  = clamp(top,  scrollY + margin, scrollY + vh - h - margin);

    el.style.left = left + 'px';
    el.style.top  = top  + 'px';
    requestAnimationFrame(()=>{ el.style.opacity = '1'; });
  }

  function showTip(target){
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const el = getTipEl();
    el.textContent = text;
    positionTip(el, target);
  }

  function hideTip(){
    if (!tipEl) return;
    tipEl.style.opacity = '0';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(()=>{
      if (tipEl) tipEl.style.display = 'none';
    }, 120);
  }

  // Delegation strictly for [data-tip] only
  function closestWithDataTip(node){
    return node && (node.matches && node.matches('[data-tip]') ? node : (node.closest && node.closest('[data-tip]')));
  }

  document.addEventListener('mouseover', (e)=>{
    const t = closestWithDataTip(e.target);
    if (!t) return;
    currentTarget = t;
    showTip(t);
  }, true);

  document.addEventListener('mouseout', (e)=>{
    if (!currentTarget) return;
    const to = e.relatedTarget;
    if (to && (to===currentTarget || (currentTarget.contains && currentTarget.contains(to)))) return;
    currentTarget = null;
    hideTip();
  }, true);

  document.addEventListener('focusin', (e)=>{
    const t = closestWithDataTip(e.target);
    if (!t) return;
    currentTarget = t;
    showTip(t);
  });
  document.addEventListener('focusout', ()=>{
    currentTarget = null;
    hideTip();
  });

  window.addEventListener('scroll', ()=>{ if (tipEl && tipEl.style.display==='block'){ hideTip(); } }, {passive:true});
  window.addEventListener('resize', ()=>{ if (tipEl && tipEl.style.display==='block'){ hideTip(); } });

  // Bootstrap: ensure ONLY the three left-dock buttons get data-tip by default
  const defaults = {
    modeSliderBtn: "Overlay slider: compare two photos with a draggable divider.",
    modeSideBtn:   "Side-by-side: view two photos next to each other.",
    modeSingleBtn: "Single view: focus on one photo."
  };
  function applyDefaults(){
    Object.keys(defaults).forEach(id=>{
      const b = document.getElementById(id);
      if (!b) return;
      if (!b.getAttribute('data-tip')) b.setAttribute('data-tip', defaults[id]);
      // keep aria-label if you want, but no aria/title fallback for tooltip display
      if (b.hasAttribute('title')) b.removeAttribute('title');
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDefaults);
  } else {
    applyDefaults();
  }
})();
