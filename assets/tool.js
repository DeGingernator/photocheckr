// Tool logic
import { lazyLoad } from './shared.js';

let fabricLoaded = false;
let jsPDFLoaded = false;

const state = {
  canvas: null,
  undoStack: [],
  redoStack: [],
  currentMode: 'select',
  viewMode: 'sideBySide',
  singleSource: 'before',
  canvasSide: null,
  undoSide: [], redoSide: [],
  photoScale: 100,

  tabs: [],
  activeTabId: null,
};
window.state = state;


const els = {};
window.els = els;


// === styleSideOverlay (EXACT console snippet) ===
function styleSideOverlay(){
  const box=document.getElementById('sideBySideContainer');
  if(!box){console.log('No side box');return;}
  const wrap=box.querySelector('.canvas-container');
  const upper=wrap?.querySelector('.upper-canvas');
  const base=document.getElementById('drawCanvasSide');
  if(wrap){
    Object.assign(wrap.style,{position:'absolute',top:'0',left:'0',right:'0',bottom:'0',zIndex:'10',width:box.clientWidth+'px',height:box.clientHeight+'px'});
  }
  if(upper){
    upper.style.pointerEvents='auto';
    upper.style.width='100%';
    upper.style.height='100%';
  }
  if(base){
    base.style.width='100%';
    base.style.height='100%';
  }
  box.querySelectorAll('img').forEach(i=>i.style.pointerEvents='none');
  const r=box.getBoundingClientRect();
  const mid=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  console.log('PCHECK FIXED overlay →',{wrapPos:wrap&&getComputedStyle(wrap).position,wrapZ:wrap&&getComputedStyle(wrap).zIndex,elementAtCenter:mid?mid.tagName+'#'+(mid.id||'')+'.'+[...mid.classList].join('.'):null});
}

// Run styleSideOverlay once the Fabric wrapper exists (post-switch)
function styleSideOverlayWhenReady(maxTries=60){
  let tries = 0;
  const tick = ()=>{
    if (!(window.state && state.viewMode === 'sideBySide')) return;
    const box = document.getElementById('sideBySideContainer');
    const wrap = box && box.querySelector('.canvas-container');
    if (wrap){
      styleSideOverlay();
    } else if (tries < maxTries){
      tries++; requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

function observeSideOverlayOnce(){
  const box = document.getElementById('sideBySideContainer');
  if (!box) return;
  const mo = new MutationObserver((muts, obs)=>{
    const wrap = box.querySelector('.canvas-container');
    if (wrap){
      styleSideOverlay();
      obs.disconnect();
    }
  });
  mo.observe(box, {childList:true, subtree:true});
}



function qs(id){ return document.getElementById(id); }

// voorkomt dat we tijdens undo/redo per ongeluk een nieuwe undo-state pushen
let isRestoring = false;

document.addEventListener('DOMContentLoaded', async () => {
  cacheEls();
  bindUI();
  // Lazy load heavy libs only on tool page
  await Promise.all([
    lazyLoad('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js').then(()=>fabricLoaded=true),
    lazyLoad('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js').then(()=>jsPDFLoaded=true)
  ]);
  initCanvasWhenReady();
  try{ initPhotoScale(); }catch(_){ }
  try{ setupControlsDockLeft(); }catch(_){ }
  installSingleFloatingControls();
    try{ setupControlsDockRight(); }catch(_){ }
  try{ ensureTabRail(); }catch(_){ }
try{ setupDockColorObserver(); }catch(_){ }
 try{ ensureTabRail(); }catch(_){ }


  // Initialize tabs (one by default)
  try{
    ensureTabRail();
    if (!state.tabs || state.tabs.length===0){
      const t = createTab();
      state.tabs = [t];
      state.activeTabId = t.id;
      updateTabRail();
    applyTab(t);
    } else {
      if (!state.activeTabId) state.activeTabId = state.tabs[0].id;
      updateTabRail();
      applyTab(state.tabs.find(x=>x.id===state.activeTabId));
    }
  }catch(e){ console.warn(e); }
});

function cacheEls(){
  els.beforeImg = qs('beforeImg');
  els.afterImg = qs('afterImg');
  els.slider = qs('slider');
  els.drawCanvas = qs('drawCanvas');
  els.wrapper = qs('imageWrapper');
  els.colorPicker = qs('colorPicker');
  els.lineWidth = qs('lineWidth');
  els.title = qs('projectTitle');
  els.beforeBadge = qs('beforeBadge');
  els.afterBadge = qs('afterBadge');
  els.saveBtn = qs('saveBtn');
  els.loadBtn = qs('loadBtn');
  els.clearBtn = qs('clearBtn');
  els.undoBtn = qs('undoBtn');
  els.redoBtn = qs('redoBtn');
  els.quality = qs('qualitySelect');

  // View mode elements
  els.sliderContainer = document.querySelector('#sliderContainer');
  els.modeSliderBtn   = document.querySelector('#modeSliderBtn');
  els.modeSideBtn     = document.querySelector('#modeSideBtn');
  els.modeSingleBtn   = document.querySelector('#modeSingleBtn');

  // Wire up Single mode toggle
  els.singleControls  = document.querySelector('#singleControls');
  els.photoScale = document.getElementById('photoScale');
  els.photoScaleOut = document.getElementById('photoScaleOut');
  els.singleBefore    = document.querySelector('#singleBefore');
  els.singleAfter     = document.querySelector('#singleAfter');
  els.sideBySide      = document.getElementById('sideBySideContainer');
  els.beforeImgSide   = document.getElementById('beforeImgSide');
  els.afterImgSide    = document.getElementById('afterImgSide');
  els.drawCanvasSide  = document.getElementById('drawCanvasSide');
  els.descPanel = document.getElementById('descPanel');
  els.tabRail = document.getElementById('tabRail');

  // PATCH: description elements
  els.descriptionInput = document.getElementById('descriptionInput');
  els.descCount = document.getElementById('descCount');
}


function updateHasImagesFlag(){
  const has = !!((els.beforeImg && els.beforeImg.src) || (els.afterImg && els.afterImg.src));
  if (els.wrapper) els.wrapper.classList.toggle('has-images', has);
  if (els.sideBySide) els.sideBySide.classList.toggle('has-images', has);
}





// Retina-safe sizing for Fabric canvas (prevents cropping at high DPR)
function setFabricCanvasSize(fCanvas, cssW, cssH){
  if (!fCanvas) return;
  const ratio = Math.max(1, window.devicePixelRatio || 1);

  // Reset any previous transforms
  fCanvas.setViewportTransform([1,0,0,1,0,0]);
  fCanvas.setZoom(1);

  // Set internal/backstore pixel size
  fCanvas.setDimensions({ width: Math.max(1, Math.round(cssW * ratio)), height: Math.max(1, Math.round(cssH * ratio)) }, { backstoreOnly: true });

  // Pin CSS size (so wrapper does not stretch inconsistently)
  const el = fCanvas.getElement();
  if (el) {
    el.style.width = cssW + 'px';
    el.style.height = cssH + 'px';
  }
  if (fCanvas.upperCanvasEl) {
    fCanvas.upperCanvasEl.style.width = cssW + 'px';
    fCanvas.upperCanvasEl.style.height = cssH + 'px';
  }

  // Apply viewport scaling so interactions map 1:1 to CSS pixels
  fCanvas.setViewportTransform([ratio,0,0,ratio,0,0]);
  fCanvas.requestRenderAll();
}





// === Stable dock: description panel to the RIGHT of side-by-side photos (no layout shift) ===
let __descDocked = false;
let __descOrigParent = null, __descOrigNext = null, __descOrigStyle = null;
let __descRO = null;  // ResizeObserver

function ensureDescDockLayer(){
  let layer = document.getElementById('descDockLayer');
  if (!layer){
    layer = document.createElement('div');
    layer.id = 'descDockLayer';
    Object.assign(layer.style, { position:'fixed', inset:'0', zIndex:'70', pointerEvents:'none' });
    document.body.appendChild(layer);
  }
  let anchor = document.getElementById('descDockAnchor');
  if (!anchor){
    anchor = document.createElement('div');
    anchor.id = 'descDockAnchor';
    Object.assign(anchor.style, { position:'fixed', pointerEvents:'none' });
    layer.appendChild(anchor);
  }
  return { layer, anchor };
}

// Auto-size the description textarea so there's no inner scroll
function autosizeTextarea(){
  const ta = document.getElementById('descriptionInput');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}

// Compute and apply the anchor position to sit just RIGHT of the side-by-side photos


function positionDescNextToPhotos(){
  const panel = els.descPanel || document.getElementById('descPanel');
  if (panel && panel.closest('#controlsDockRightInner')) return;
  // (kept) otherwise no-op
}




function dockDescNextToPhotos(){
  // No-op: Notes live inside the right dock
  try{ const s = (els.descPanel||document.getElementById('descPanel'))?.style; if (s){ s.position='static'; s.width='100%'; s.pointerEvents='auto'; } }catch(_){}
}




function undockDescNextToPhotos(){
  // No-op: keep Notes in the right dock
}



function _dockMoveSingleControls(){
  try{
    const dock = document.getElementById('controlsDockLeft');
    const stack = dock && dock.querySelector('#controlsStack');
    const sizeControls = document.getElementById('sizeControls');
    const sc = document.getElementById('singleControls');
    if (stack && sc && sc.parentElement !== stack){
      stack.insertBefore(sc, sizeControls || null);
    }
  }catch(e){/*no-op*/}
}

function _toggleSingleControlsVisibility(){
  try{
    const sc = document.getElementById('singleControls');
    if (!sc) return;
    const show = (state && state.viewMode === 'single');
    sc.classList.toggle('hidden', !show);
  }catch(e){/*no-op*/}
}







function ensureTabRail(){
  try{
    let rail = document.getElementById('tabRail');
    const host = document.getElementById('controlsDockRightInner');
    if (!host){ try{ setupControlsDockRight(); }catch(_){ } }
    const hostNow = document.getElementById('controlsDockRightInner');
    if (!hostNow) return;
    if (!rail){
      rail = document.createElement('div');
      rail.id = 'tabRail';
      rail.setAttribute('aria-label', 'Pages & Notes');

rail.innerHTML = `\
<div class="dock-section">
  <div class="dock-header">
    <h3 class="dock-title">Pages</h3>
    <button id="tabAddBtn" class="tab-add" title="Add page" type="button">＋ Add page</button>
  </div>
  <p class="dock-help" id="pagesHelp">Each page is exported as a separate page in the PDF.</p>
  <div id="tabList" class="tab-list" role="listbox" aria-labelledby="pagesHelp"></div>
</div>
<div class="dock-section">
  <h3 class="dock-title">Notes</h3>
  <aside id="descPanel" class="desc-panel px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur"
         aria-label="Notes (max 140)">
    <label for="descriptionInput" class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (max 140)</label>
    <textarea id="descriptionInput" maxlength="400" class="flex-1 w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
      placeholder="Write a short note..." maxlength="400"></textarea>
    <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-1"><span id="descCount">0</span>/400</div>
  </aside>
</div>
`;

    } else if (rail.parentElement && rail.parentElement !== hostNow){
      rail.parentElement.removeChild(rail);
    }
    if (rail.parentElement !== hostNow) hostNow.appendChild(rail);

    // Wire listeners on the dock (bubbled)
    const dock = document.getElementById('controlsDockRight');
    if (dock){
      dock.addEventListener('click', onTabRailClick);
      dock.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.tab-item');
        if (!item) return;
        const id = item.dataset.id;
        const current = (state.tabs.find(t=>t.id===id)||{}).name || '';
        const nn = prompt('Naam van vergelijking:', current);
        if (nn != null) renameTab(id, nn);
      });
      dock.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.tab-item');
        if (!item) return;
        e.preventDefault();
        const id = item.dataset.id;
        if (confirm('Vergelijking verwijderen?')) removeTab(id);
      });
    }
  }catch(e){ console.warn('ensureTabRail failed', e); }
}


function newTabName(){
  const n = (state.tabs?.length || 0) + 1;
  return `Page ${n}`;
}
function createTab(initial){
  const id = 't' + Date.now() + Math.random().toString(36).slice(2,7);
  return Object.assign({
    id, name: newTabName(),
    before: null, after: null,   // data URLs
    desc: '', slider: '50',
    viewMode: state.viewMode || 'sideBySide',
    photoScale: state.photoScale || 100,
    canvasJSON: null, canvasSideJSON: null
  }, initial||{});
}
function serializeActiveTab(){
  if (!state.activeTabId) return;
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;
  // images: keep as-is (we set them on upload)
  tab.desc = els.descriptionInput ? (els.descriptionInput.value||'') : '';
  tab.slider = els.slider ? (''+els.slider.value) : '50';
  tab.viewMode = state.viewMode;
  tab.photoScale = state.photoScale;
  // canvases
  try{ if (state.canvas) tab.canvasJSON = state.canvas.toJSON(); }catch(_){}
  try{ if (state.canvasSide) tab.canvasSideJSON = state.canvasSide.toJSON(); }catch(_){}
}



// Update Notes label/header to reflect the active tab
function updateNotesHeader(tab){
  try{
    const lbl = document.querySelector('#descPanel label[for="descriptionInput"]');
    if (lbl && tab && tab.name){
      lbl.textContent = `Notes for ${tab.name} (max 400)`;
    }
  }catch(_){}
}
function applyTab(tab, opts={}){
  return new Promise(async (resolve) => {
    if (!tab) return resolve();
    // Apply state
    state.photoScale = tab.photoScale || 100;

    // Switch view first (may rebuild DOM)
    setViewMode(state.viewMode);
    try{ cacheEls(); }catch(_){}

    
    try{ setViewMode(state.viewMode); }catch(_){ }
    // Set simple fields
    if (els.slider && typeof tab.slider !== 'undefined') els.slider.value = ''+tab.slider;
    if (els.descriptionInput) els.descriptionInput.value = tab.desc||'';
    if (els.descCount) els.descCount.textContent = String((tab.desc||'').length);

    
    try{ updateNotesHeader(tab); }catch(_){}
// Assign images (blank if missing)
    if (els.beforeImg)     els.beforeImg.src     = tab.before || '';
    if (els.afterImg)      els.afterImg.src      = tab.after  || '';
    if (els.beforeImgSide) els.beforeImgSide.src = tab.before || '';
    if (els.afterImgSide)  els.afterImgSide.src  = tab.after  || '';

    // Wait for images to settle
    const waitImg = (img) => (!img || img.complete) ? Promise.resolve() : new Promise(r => img.onload = r);
    await Promise.all([waitImg(els.beforeImg), waitImg(els.afterImg), waitImg(els.beforeImgSide), waitImg(els.afterImgSide)]);

    // Restore / clear canvases
    if (state.canvas) {
      if (tab.canvasJSON) await new Promise(res => state.canvas.loadFromJSON(tab.canvasJSON, () => { try{ state.canvas.renderAll(); }catch(_){ } res(); }));
      else { try{ state.canvas.clear(); state.canvas.renderAll(); }catch(_){ } }
    }
    if (state.canvasSide) {
      if (tab.canvasSideJSON) await new Promise(res => state.canvasSide.loadFromJSON(tab.canvasSideJSON, () => { try{ state.canvasSide.renderAll(); }catch(_){ } res(); }));
      else { try{ state.canvasSide.clear(); state.canvasSide.renderAll(); }catch(_){ } }
    }

    // Layout & flags
    try{ updateHasImagesFlag(); }catch(_){}
    try{ updateCanvasSize(); }catch(_){}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ try{ updateCanvasSize(); }catch(_){ } resolve(); }));
  });
}

function selectTab(id){
  if (state.activeTabId === id) return;
  serializeActiveTab();
  state.activeTabId = id;
  const tab = state.tabs.find(t => t.id === id);
  highlightActiveTab();
  applyTab(tab);
}
function addTab(){
  serializeActiveTab();
  const t = createTab();
  state.tabs.push(t);
  state.activeTabId = t.id;
  updateTabRail();
  applyTab(t);
}
function renameTab(id, newName){
  const t = state.tabs.find(x => x.id===id);
  if (!t) return;
  t.name = (newName||'').trim() || t.name;
  updateTabRail();
}
function removeTab(id){
  if (state.tabs.length<=1) return alert('Minimaal één vergelijking nodig.');
  const idx = state.tabs.findIndex(t => t.id===id);
  if (idx===-1) return;
  // If removing active, move selection
  const wasActive = (state.activeTabId===id);
  state.tabs.splice(idx,1);
  if (wasActive){
    const next = state.tabs[Math.max(0, idx-1)] || state.tabs[0];
    state.activeTabId = next.id;
    applyTab(next);
  }
  updateTabRail();
}
function updateTabRail(){
  ensureTabRail();
  const list = document.getElementById('tabList');
  if (!list) return;
  list.innerHTML = state.tabs.map((t, idx) => `
  <button class="tab-item ${t.id===state.activeTabId?'active':''}" data-id="${t.id}" title="${t.name}" role="option">
    <span class="tab-badge">${idx+1}</span>
    <span class="tab-label">${t.name}</span>
    <span class="tab-close" data-close="${t.id}" aria-label="Remove" title="Remove">×</span>
  </button>
`).join('');
  highlightActiveTab();
  const add = document.getElementById('tabAddBtn');
  if (add) add.onclick = addTab;
}
function highlightActiveTab(){
  const list = document.getElementById('tabList');
  if (!list) return;
  list.querySelectorAll('.tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id===state.activeTabId);
  });
}
function onTabRailClick(e){
  const closeId = e.target?.dataset?.close;
  if (closeId){ removeTab(closeId); return; }
  const item = e.target.closest('.tab-item');
  if (item){ selectTab(item.dataset.id); return; }
}


function bindUI(){
  qs('beforeUpload').addEventListener('change', e => loadImage(e, 'before'));
  qs('afterUpload').addEventListener('change', e => loadImage(e, 'after'));

  els.slider.addEventListener('input', () => {
    els.afterImg.style.clipPath = `inset(0 ${100 - els.slider.value}% 0 0)`;
    updateBadges();
  });

  window.addEventListener('resize', updateCanvasSize);
  els.colorPicker.addEventListener('input', applyColor);
  els.lineWidth.addEventListener('input', () => {
  const w = parseInt(els.lineWidth.value,10);
  if (state.canvas) state.canvas.freeDrawingBrush.width = w;
  if (state.canvasSide) state.canvasSide.freeDrawingBrush.width = w;
});

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
      if (e.key.toLowerCase() === 'y') { redo(); e.preventDefault(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
    }
    if (e.key === 'Delete' && activeCanvas()) { const active = activeCanvas().getActiveObject(); if (active) activeCanvas().remove(active); }
  });

  els.saveBtn.addEventListener('click', saveProject);
  els.loadBtn.addEventListener('click', loadProject);
  els.clearBtn.addEventListener('click', clearCanvas);
  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);

  // View mode buttons
  if (els.modeSliderBtn) els.modeSliderBtn.addEventListener('click', () => setViewMode('slider'));
  if (els.modeSideBtn)   els.modeSideBtn.addEventListener('click', () => setViewMode('sideBySide'));
  if (els.modeSingleBtn) els.modeSingleBtn.addEventListener('click', () => setViewMode('single'));
  // Wire up Single mode Before/After radios (canonical)
  if (els.singleBefore) els.singleBefore.addEventListener('change', () => { state.singleSource = 'before'; applyViewModeToDOM && applyViewModeToDOM(); if (typeof updateBadges==='function') updateBadges(); });
  if (els.singleAfter)  els.singleAfter.addEventListener('change', () => { state.singleSource = 'after';  applyViewModeToDOM && applyViewModeToDOM(); if (typeof updateBadges==='function') updateBadges(); });
  // Wire up Single mode Before/After radios
// Restore title if present
  const saved = JSON.parse(localStorage.getItem('photocheckr_meta') || '{}');
  if (saved.title) els.title.value = saved.title;
  els.title.addEventListener('input', () => {
    localStorage.setItem('photocheckr_meta', JSON.stringify({ title: els.title.value.trim() }));
  });

// PATCH: description char counter
if (els.descriptionInput && els.descCount) {
  const updateDescCount = () => { els.descCount.textContent = String(els.descriptionInput.value.length); };
  els.descriptionInput.addEventListener('input', updateDescCount);
  updateDescCount();
}
}


// Save notes live per active tab
try{
  els.descriptionInput.addEventListener('input', function(){
    const t = state.tabs ? state.tabs.find(x => x.id===state.activeTabId) : null;
    if (t){ t.desc = els.descriptionInput.value || ''; }
  }, { passive: true });
}catch(_){}
function initCanvasWhenReady(){
  if (!fabricLoaded) { setTimeout(initCanvasWhenReady, 50); return; }
  els.beforeImg.onload = handleImageLoad;
  els.afterImg.onload = handleImageLoad;
}

function handleImageLoad(){
  // Update as soon as either image is ready
  // Ensure side canvas exists when switching to sideBySide
  if (state.viewMode === 'sideBySide' && !state.canvasSide && window.fabric && els.drawCanvasSide) {
    state.canvasSide = new fabric.Canvas('drawCanvasSide', { backgroundColor: 'transparent', selection: true, preserveObjectStacking: true });
    state.canvasSide.freeDrawingBrush = new fabric.PencilBrush(state.canvasSide);
    state.canvasSide.freeDrawingBrush.width = parseInt(els.lineWidth.value,10);
    state.canvasSide.freeDrawingBrush.color = els.colorPicker.value;
    state.canvasSide.on('object:added', pushUndo);
    state.canvasSide.on('object:modified', pushUndo);
    state.canvasSide.on('object:removed', pushUndo);
    pushUndo();
  }
  updateCanvasSize();
    try{ if (state.viewMode==='sideBySide') positionDescNextToPhotos(); }catch(_){}
}


function activeCanvas(){ return state.viewMode === 'sideBySide' ? state.canvasSide : state.canvas; }
function activeUndoStack(){ return state.viewMode === 'sideBySide' ? state.undoSide : state.undoStack; }
function activeRedoStack(){ return state.viewMode === 'sideBySide' ? state.redoSide : state.redoStack; }

function setViewMode(mode){
  state.viewMode = mode;
  if (els.singleControls) els.singleControls.classList.toggle('hidden', mode !== 'single');

  // Reset annotations on mode switch
  if (state.canvas) { state.canvas.clear();   try{ window.__singleFloating && window.__singleFloating.showHide(); }catch(e){}
}

  if (state.canvasSide) { state.canvasSide.clear(); }
  state.undoStack = []; state.redoStack = [];
  state.undoSide = []; state.redoSide = [];

  const map = { slider: els.modeSliderBtn, sideBySide: els.modeSideBtn, single: els.modeSingleBtn };
  [els.modeSliderBtn, els.modeSideBtn, els.modeSingleBtn].forEach(btn => {
    if (!btn) return;
    const active = (btn === map[mode]);
    btn.classList.toggle('mode-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  if (els.singleControls) els.singleControls.classList.toggle('hidden', mode !== 'single');

  applyViewModeToDOM();
  updateBadges();  try{ if (typeof setRootModeClass==='function') setRootModeClass(); }catch(e){}

}

function applyViewModeToDOM(){
  const wrap = els.wrapper;
  if (!wrap) return;

  // Slider UI show/hide
  if (els.sliderContainer) {
    els.sliderContainer.classList.toggle('hidden', state.viewMode !== 'slider');
  
  try { if (state && state.viewMode === 'sideBySide') { styleSideOverlayWhenReady(60); observeSideOverlayOnce(); } } catch(e){ console.warn(e); }
}

  const wrapHeightNow = parseInt(wrap.style.height,10) || wrap.getBoundingClientRect().height || 320;

  if (els.sideBySide) {
    const sideActive = state.viewMode === 'sideBySide';
    els.sideBySide.style.height = sideActive ? (wrapHeightNow + 'px') : '';
    els.sideBySide.classList.toggle('hidden', !sideActive);
    wrap.classList.toggle('hidden', sideActive);
  }

  
  
  
  try{ _toggleSingleControlsVisibility(); }catch(_){}
// Ensure singleControls is in the dock when switching to single view
  try{ if (state.viewMode === 'single') { _dockMoveSingleControls(); } }catch(_){}
// Dock/undock description panel next to photos
  try{
    if (state.viewMode === 'sideBySide') {
      dockDescNextToPhotos();
    } else {
      undockDescNextToPhotos();
    }
  }catch(e){ console.warn(e); }
  // One more deferred position to avoid initial jump
  try{ if(state.viewMode==='sideBySide'){ requestAnimationFrame(()=>requestAnimationFrame(positionDescNextToPhotos)); } }catch(e){}
if (state.viewMode === 'slider' && els.slider && els.afterImg) {
    els.afterImg.classList.remove('no-clip');
    els.afterImg.style.clipPath = `inset(0 ${100 - els.slider.value}% 0 0)`;
  } else if (els.afterImg) {
    els.afterImg.style.clipPath = '';
    els.afterImg.classList.add('no-clip');
  }

  if (state.viewMode === 'single') {
    if (state.singleSource === 'before') {
      els.beforeImg.classList.remove('hidden');
      els.afterImg.classList.add('hidden');
    } else {
      els.afterImg.classList.remove('hidden');
      els.beforeImg.classList.add('hidden');
    }
  } else if (state.viewMode === 'slider') {
    els.beforeImg.classList.remove('hidden');
    els.afterImg.classList.remove('hidden');
  }

  // Make sure side canvas exists
  if (state.viewMode === 'sideBySide' && !state.canvasSide && window.fabric && els.drawCanvasSide) {
    state.canvasSide = new fabric.Canvas('drawCanvasSide', { selection: true });
    state.canvasSide.freeDrawingBrush = new fabric.PencilBrush(state.canvasSide);
    state.canvasSide.freeDrawingBrush.width = parseInt(els.lineWidth.value,10);
    state.canvasSide.freeDrawingBrush.color = els.colorPicker.value;
    state.canvasSide.on('object:added', pushUndo);
    state.canvasSide.on('object:modified', pushUndo);
    state.canvasSide.on('object:removed', pushUndo);
  }

  updateCanvasSize();
  try{ ensureSingleControlsInDockAndVisible(); }catch(_){ }

  try{ setRootModeClass(); }catch(_){ }

  try{ ensureSingleControlsVisible(); }catch(_){ }

  try{ updateCanvasSize(); }catch(_){ }
}

function updateCanvasSize(){
  const w = els.wrapper.clientWidth;

  // Bepaal de grootste beschikbare foto op basis van oppervlakte
  const dims = [];
  if (els.beforeImg && els.beforeImg.naturalWidth && els.beforeImg.naturalHeight) {
    dims.push({ w: els.beforeImg.naturalWidth, h: els.beforeImg.naturalHeight });
  
  // Side-by-side overlay sizing (Fabric-native, avoid CSS scaling)
  if (els.sideBySide && state.canvasSide && els.drawCanvasSide) {
    const rect = els.sideBySide.getBoundingClientRect();
    const sW = Math.max(1, Math.round(rect.width));
    const sH = Math.max(1, Math.round(rect.height));
    setFabricCanvasSize(state.canvasSide, sW, sH);
  }
}
  if (els.afterImg && els.afterImg.naturalWidth && els.afterImg.naturalHeight) {
    dims.push({ w: els.afterImg.naturalWidth, h: els.afterImg.naturalHeight });
  }

  // Hoogte bepalen: fallback = oude 0.6 ratio, anders aspect van de grootste foto
  let h;
  // Compute height from image aspect and current mode
  const scale = Math.max(75, Math.min(125, parseInt(state.photoScale||100,10))) / 100;
  if (dims.length === 0) {
    // Fallback ratio ~0.6 scaled
    h = Math.max(240, Math.round(w * 0.6 * scale));
  } else {
    // Use aspect ratio from available images
    const ratioBefore = (els.beforeImg && els.beforeImg.naturalWidth) ? (els.beforeImg.naturalHeight / els.beforeImg.naturalWidth) : null;
    const ratioAfter  = (els.afterImg  && els.afterImg.naturalWidth)  ? (els.afterImg.naturalHeight  / els.afterImg.naturalWidth)  : null;
    if (state.viewMode === 'sideBySide') {
      // Each photo effectively gets ~half the width; pick the taller needed height to avoid letterbox
      const eachW = Math.max(1, Math.floor(w / 2));
      const hB = ratioBefore ? Math.round(eachW * ratioBefore) : 0;
      const hA = ratioAfter  ? Math.round(eachW * ratioAfter)  : 0;
      const baseH = Math.max(hB, hA, 240);
      h = Math.round(baseH * scale);
    } else {
      // Slider/Single: use the larger ratio to accommodate both images without top/bottom bars
      const ratio = Math.max(ratioBefore||0, ratioAfter||0) || 0.6;
      const baseH = Math.max(240, Math.round(w * ratio));
      h = Math.round(baseH * scale);
    }
  }

  
  // Apply user photo scale (50%..200%)
  try { 
    const scale = Math.max(75, Math.min(125, parseInt(state.photoScale||100,10)));
    h = Math.max(200, Math.round(h * scale / 100));
  } catch(e){} 
// Pas wrapper/canvas-element aan
  els.wrapper.style.height = h + 'px';
  els.drawCanvas.width = w;
  els.drawCanvas.height = h;

  // Wacht tot Fabric geladen is
  if (!window.fabric) return;

  if (!state.canvas) {
    state.canvas = new fabric.Canvas('drawCanvas', {
      isDrawingMode: false,
      selection: true,
      preserveObjectStacking: true
    });
    // brush settings
    state.canvas.freeDrawingBrush.color = els.colorPicker.value;
    state.canvas.freeDrawingBrush.width = parseInt(els.lineWidth.value, 10);

    state.canvas.on('object:added', pushUndo);
    state.canvas.on('object:modified', pushUndo);
    state.canvas.on('object:removed', pushUndo);
    pushUndo(); // initial
  }

  // (her)grootte canvas + render
  if (state.canvas) {
    state.canvas.setWidth(w);
    state.canvas.setHeight(h);
    state.canvas.renderAll();
  }

  // Slider/Badges opnieuw toepassen
  if (els.slider) {
    els.afterImg.style.clipPath = `inset(0 ${100 - els.slider.value}% 0 0)`;
  }
  updateBadges();
}
// Side-by-side overlay sizing
if (els.sideBySide && state.canvasSide) {
  const rect = els.sideBySide.getBoundingClientRect();
  const sW = Math.max(0, Math.round(rect.width));
  const sH = Math.max(0, Math.round(rect.height));
  els.drawCanvasSide.width = sW;
  els.drawCanvasSide.height = sH;
  state.canvasSide.setWidth(sW);
  state.canvasSide.setHeight(sH);
  state.canvasSide.renderAll();
}



function pushUndo(){
  if (!activeCanvas() || isRestoring) return;
  const undo = activeUndoStack();
  const redo = activeRedoStack();
  const snapshot = activeCanvas().toJSON();
  undo.push(JSON.stringify(snapshot));
  if (undo.length > 100) undo.shift();
  redo.length = 0;
}


function undo(){
  const undo = activeUndoStack();
  const redo = activeRedoStack();
  if (undo.length > 1) {
    const current = undo.pop();
    redo.push(current);
    const prev = undo[undo.length - 1];
    isRestoring = true;
    activeCanvas().loadFromJSON(prev, () => { activeCanvas().renderAll(); isRestoring = false; });
  }
}

function redo(){
  const undo = activeUndoStack();
  const redo = activeRedoStack();
  if (redo.length > 0) {
    const next = redo.pop();
    undo.push(next);
    isRestoring = true;
    activeCanvas().loadFromJSON(next, () => { activeCanvas().renderAll(); isRestoring = false; });
  }
}



function setMode(mode){
  const canvas = activeCanvas();
  if (!canvas) return;
  state.currentMode = mode;
  if (mode === 'draw') {
    canvas.selection = false;
    canvas.isDrawingMode = true;
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    }
    if (els.colorPicker && els.colorPicker.value) {
      canvas.freeDrawingBrush.color = els.colorPicker.value;
    }
    const widthCtrl = (els.brushWidth && parseFloat(els.brushWidth.value)) || 2;
    canvas.freeDrawingBrush.width = Math.max(1, Math.min(64, widthCtrl));
    canvas.forEachObject(obj => obj.selectable = false);
  } else {
    canvas.selection = true;
    canvas.isDrawingMode = false;
    canvas.forEachObject(obj => obj.selectable = true);
  }
}
window.setMode = setMode;

function addText(){
  const text = new fabric.IText('Double-click to edit', {
    left: 50, top: 50,
    fill: els.colorPicker.value,
    fontSize: 20,
    fontWeight: 'bold'
  });
  activeCanvas().add(text);
  activeCanvas().setActiveObject(text);
  text.enterEditing();
  setMode('select');
}
window.addText = addText;

function addCircle(){
  const circle = new fabric.Circle({
    left: 60, top: 60, radius: 30,
    fill: 'transparent',
    stroke: els.colorPicker.value,
    strokeWidth: 2
  });
  activeCanvas().add(circle);
  setMode('select');
}
window.addCircle = addCircle;

function addRect(){
  const rect = new fabric.Rect({
    left: 60, top: 60, width: 100, height: 60,
    fill: 'transparent',
    stroke: els.colorPicker.value,
    strokeWidth: 2
  });
  activeCanvas().add(rect);
  setMode('select');
}
window.addRect = addRect;

function addArrow(){
  const line = new fabric.Line([50, 100, 150, 100], {
    stroke: els.colorPicker.value, strokeWidth: 2
  });
  const triangle = new fabric.Triangle({
    left: 150, top: 100,
    originX: 'center', originY: 'center',
    width: 10, height: 15, angle: 90,
    fill: els.colorPicker.value
  });
  const group = new fabric.Group([line, triangle], { left: 50, top: 100 });
  activeCanvas().add(group);
  setMode('select');
}
window.addArrow = addArrow;

function clearCanvas(){
  if (confirm('Clear all annotations?')) {
    activeCanvas().clear();
    const undo = activeUndoStack();
    const redo = activeRedoStack();
    undo.length = 0; redo.length = 0; pushUndo();
  }
}
window.clearCanvas = clearCanvas;

function applyColor(){
  if (!activeCanvas()) return;
  if (state.canvas) state.canvas.freeDrawingBrush.color = els.colorPicker.value;
  if (state.canvasSide) state.canvasSide.freeDrawingBrush.color = els.colorPicker.value;
  activeCanvas().freeDrawingBrush.color = els.colorPicker.value;
  const active = activeCanvas().getActiveObject();
  if (active) {
    if (active.type === 'i-text') {
      active.set({ fill: els.colorPicker.value });
    } else if (['circle','rect','line','triangle','group'].includes(active.type)) {
      if (active.set) active.set({ stroke: els.colorPicker.value, fill: active.fill === 'transparent' ? 'transparent' : active.fill });
    }
    activeCanvas().renderAll();
  }
}






async function exportPDF(){
  if (!jsPDFLoaded) return alert('PDF library not loaded yet. Please try again.');
  const { jsPDF } = window.jspdf;
  const filename = (els.title?.value?.trim() || 'PhotoCheckr_Export') + `.pdf`;
  const scale = parseInt(els.quality?.value || '2', 10);
  // Boost scale for side-by-side to maintain per-panel sharpness
  const effectiveScale = (state.viewMode === 'sideBySide') ? (parseInt(els.quality?.value || '2', 10) * 2) : parseInt(els.quality?.value || '2', 10);
  const pxToPt = 72 / 96;

  function waitFrame(){ return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }

  // Lock the stage size and hide description panel to avoid reflow during render
  async function withStableStage(fn){
    // --- Export-safety patch: detach description dock layer and pause its ResizeObserver ---
    let _descLayer = document.getElementById('descDockLayer');
    let _descLayerParent = _descLayer ? _descLayer.parentNode : null;
    let _descNext = _descLayer && _descLayer.nextSibling ? _descLayer.nextSibling : null;
    let _descRO = (typeof __descRO !== 'undefined') ? __descRO : null;
    try { if (_descRO && _descRO.disconnect) _descRO.disconnect(); }catch(_){}
    try { if (_descLayer && _descLayerParent) _descLayerParent.removeChild(_descLayer); }catch(_){}


    const wrap = els.wrapper || document.getElementById('imageWrapper');
    const sbs  = els.sideBySide || document.getElementById('sideBySideContainer');
    const panel= els.descPanel || document.getElementById('descPanel');

    const keep = [];
    function lock(el){
      if (!el) return;
      const rect = el.getBoundingClientRect();
      keep.push([el, el.style.width, el.style.height, el.style.maxWidth, el.style.maxHeight, el.style.minHeight, el.style.minWidth, el.style.display]);
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      el.style.maxWidth = rect.width + 'px';
      el.style.maxHeight= rect.height + 'px';
      el.style.minWidth = rect.width + 'px';
      el.style.minHeight= rect.height + 'px';
    }

    lock(wrap); lock(sbs);
    const prevDisp = panel ? panel.style.display : null;
    if (panel) panel.style.display = 'none';
    try { updateCanvasSize?.(); } catch(_){}
    await waitFrame();

    try { return await fn(); }
    finally {
      // --- Restore description dock layer and its ResizeObserver ---
      try {
        if (_descLayer && _descLayerParent) {
          if (_descNext) { _descLayerParent.insertBefore(_descLayer, _descNext); }
          else { _descLayerParent.appendChild(_descLayer); }
        }
      }catch(_){}
      try {
        if (typeof ensureDescDockLayer === 'function') ensureDescDockLayer();
        if (typeof positionDescNextToPhotos === 'function') positionDescNextToPhotos();
      }catch(_){}
      try { if (_descRO && typeof ResizeObserver !== 'undefined') {
        // recreate a new observer and observe again
        try{ _descRO.disconnect(); }catch(_){}
        __descRO = new ResizeObserver(()=>positionDescNextToPhotos());
        const box = els.sideBySide || document.getElementById('sideBySideContainer');
        if (box) __descRO.observe(box);
      }}catch(_){}

      // restore
      if (panel) panel.style.display = prevDisp || '';
      for (const [el, w, h, mw, mh, mih, miw, disp] of keep){
        el.style.width = w||''; el.style.height = h||''; el.style.maxWidth=mw||''; el.style.maxHeight=mh||''; el.style.minHeight=mih||''; el.style.minWidth=miw||''; el.style.display = disp||'';
      }
      try { updateCanvasSize?.(); } catch(_){}
      await waitFrame();
    }
  }

  // Helper to render current DOM to a page; uses viewMode and canvases
  async function renderCurrentPage(){
    // Base size
    let baseW = state.canvas?.width || els.beforeImg?.naturalWidth || 1200;
  
  let baseH = state.canvas?.height || els.beforeImg?.naturalHeight || 800;

    // Clamp aspect for side-by-side to prevent super-wide pages (v2)
    if ((state.viewMode||'slider') === 'sideBySide') {
      // Keep a reasonable landscape ratio based on height (avoid ultra-wide)
      const minRatio = 1.3, maxRatio = 1.8;
      const target = Math.round(Math.max(baseH * minRatio, Math.min(baseH * maxRatio, baseW)));
      baseW = target;
    }
    const make = () => {
      const temp = document.createElement('canvas');
      const dpr = (window.devicePixelRatio || 1);
      temp.width  = Math.max(1, Math.round(baseW * effectiveScale * dpr));
      temp.height = Math.max(1, Math.round((baseH + 40) * effectiveScale * dpr));
      const ctx = temp.getContext('2d');
      ctx.scale(effectiveScale * dpr, effectiveScale * dpr);
      return { temp, ctx };
    };
    async function drawScaled(ctx, img, size){
      if (!img || !img.src) return;
      await new Promise(res => { if (img.complete) return res(); img.onload = res; });
      const w = size?.width  || baseW;
      const h = size?.height || baseH;
      const hRatio = w / (img.naturalWidth  || 1);
      const vRatio = h / (img.naturalHeight || 1);
      const ratio  = Math.min(hRatio, vRatio);
      const cx = (w - (img.naturalWidth  || 0) * ratio) / 2;
      const cy = (h - (img.naturalHeight || 0) * ratio) / 2;
      ctx.drawImage(img, 0, 0, img.naturalWidth||0, img.naturalHeight||0, cx, cy, (img.naturalWidth||0)*ratio, (img.naturalHeight||0)*ratio);
    }

    const vm = state.viewMode;
    const { temp, ctx } = make();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, baseW, baseH + 40);

    if (vm === 'slider') {
      await drawScaled(ctx, els.beforeImg, { width: baseW, height: baseH });
      // Clip AFTER according to slider value
      const pct = Math.max(0, Math.min(100, parseInt(els.slider?.value||'50',10)));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, (pct/100)*baseW, baseH); ctx.clip();
      await drawScaled(ctx, els.afterImg,  { width: baseW, height: baseH });
      ctx.restore();
      if (state.canvas){
        const ann = new Image();
        ann.src = state.canvas.toDataURL({ format: 'png', multiplier: (window.devicePixelRatio||1), enableRetinaScaling: true });
        await new Promise(r => ann.onload = r);
        ctx.drawImage(ann, 0, 0, baseW, baseH);
      }
    } else if (vm === 'sideBySide') {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, baseW/2, baseH); ctx.clip();
      await drawScaled(ctx, els.beforeImg, { width: baseW/2, height: baseH }); ctx.restore();
      ctx.save(); ctx.translate(baseW/2, 0); ctx.beginPath(); ctx.rect(0, 0, baseW/2, baseH); ctx.clip();
      await drawScaled(ctx, els.afterImg,  { width: baseW/2, height: baseH }); ctx.restore();
      if (state.canvasSide){
        const ann = new Image();
        ann.src = state.canvasSide.toDataURL({ format: 'png', multiplier: (window.devicePixelRatio||1), enableRetinaScaling: true });
        await new Promise(r => ann.onload = r);
        ctx.drawImage(ann, 0, 0, baseW, baseH);
      }
    } else {
      const srcImg = state.singleSource === 'after' ? els.afterImg : els.beforeImg;
      await drawScaled(ctx, srcImg, { width: baseW, height: baseH });
      if (state.canvas){
        const ann = new Image();
        ann.src = state.canvas.toDataURL({ format: 'png', multiplier: (window.devicePixelRatio||1), enableRetinaScaling: true });
        await new Promise(r => ann.onload = r);
        ctx.drawImage(ann, 0, 0, baseW, baseH);
      }
    }

 // --- Right-side notes column (pixel-accurate, no cropping) ---
const descText = (els.descriptionInput && (els.descriptionInput.value || '').trim()) || '';
const colWcss = descText ? Math.round(200 * (96 / 72)) : 0; // 200pt → CSS px (~267px)

if (colWcss) {
  // Belangrijk: werk in *pixels* van de broncanvas, niet in CSS units
  // temp.width/height zijn al hiDPI (effectiveScale * devicePixelRatio) keer zo groot.
  const dpr = window.devicePixelRatio || 1;
  const pxScale = effectiveScale * dpr; // pixels per CSS px in 'temp'
  const colWpx  = Math.round(colWcss * pxScale);

  // Nieuwe canvas heeft oude breedte + kolom, zelfde hoogte
  const newTemp = document.createElement('canvas');
  newTemp.width  = temp.width + colWpx;
  newTemp.height = temp.height;

  const newCtx = newTemp.getContext('2d', { willReadFrequently: false });

  // Witte achtergrond
  newCtx.fillStyle = '#fff';
  newCtx.fillRect(0, 0, newTemp.width, newTemp.height);

  // Kopieer de *hele* oude canvas 1:1 (geen schaal op context!)
  newCtx.drawImage(temp, 0, 0);

  // Verticale scheidslijn precies aan de rand van het beeldgedeelte
  const dividerX = temp.width;
  newCtx.strokeStyle = 'rgba(0,0,0,0.35)';
  newCtx.lineWidth = 1;                     // 1 fysieke pixel
  newCtx.beginPath();
  newCtx.moveTo(dividerX + 0.5, 0);         // +0.5 = crisp line
  newCtx.lineTo(dividerX + 0.5, temp.height);
  newCtx.stroke();

  // Tekstlayout in *pixels* (hiDPI-safe)
  const marginCss = 12;
  const textCssY  = 16;
  const lineCss   = 18; // line-height

  const marginPx = Math.round(marginCss * pxScale);
  const textXpx  = dividerX + marginPx;
  const textYpx  = Math.round(textCssY * pxScale);
  const textWpx  = Math.max(0, colWpx - marginPx * 2);

  newCtx.fillStyle = '#000';
  newCtx.textBaseline = 'top';
  newCtx.font = `${Math.round(14 * pxScale)}px Helvetica, Arial, sans-serif`;

  // Eenvoudige word-wrap in pixelruimte
  const words = descText.split(/\s+/);
  let line = '';
  let y = textYpx;
  const lineHeightPx = Math.round(lineCss * pxScale);

  for (let i = 0; i < words.length; i++) {
    const test = line ? (line + ' ' + words[i]) : words[i];
    const w = newCtx.measureText(test).width;
    if (w > textWpx && line) {
      newCtx.fillText(line, textXpx, y);
      y += lineHeightPx;
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) newCtx.fillText(line, textXpx, y);

  // Swap: vervang temp door de nieuwe canvas met kolom
  temp.width = newTemp.width;
  temp.height = newTemp.height;
  const ctx2 = temp.getContext('2d');
  ctx2.drawImage(newTemp, 0, 0);
}
   
  
// Output sizes in pt
    const outWpt = temp.width * pxToPt; const outHpt = temp.height * pxToPt;
    return { dataURL: temp.toDataURL('image/png'), outWpt, outHpt, orient: (outWpt>=outHpt ? 'landscape' : 'portrait') };
  }

  // Export flow
  const pages = [];
  const originalId = state.activeTabId || (state.tabs[0]?.id);
  try { serializeActiveTab(); } catch(_){}

  if (Array.isArray(state.tabs) && state.tabs.length > 1){
    for (let i=0;i<state.tabs.length;i++){
      const tab = state.tabs[i];
      await withStableStage(async ()=> {
        await applyTab(tab, { forExport: true });
        const page = await renderCurrentPage();
        if (page?.dataURL) pages.push(page);
      });
    }
    // restore original tab
    const restore = state.tabs.find(t=>t.id===originalId) || state.tabs[0];
    await applyTab(restore);
  } else {
    await withStableStage(async ()=> {
      const page = await renderCurrentPage();
      if (page?.dataURL) pages.push(page);
    });
  }

  if (!pages.length) { alert('Niets om te exporteren: voeg eerst afbeeldingen toe.'); return; }

  // Assemble PDF with explicit size per page
  let pdf = null;
  for (let i=0;i<pages.length;i++){
    const p = pages[i];
    if (!pdf){
      pdf = new jsPDF({ orientation: p.orient, unit: 'pt', format: [p.outWpt, p.outHpt], compress: true });
    } else {
      pdf.addPage([p.outWpt, p.outHpt], p.orient);
    }
    pdf.addImage(p.dataURL, 'PNG', 0, 0, p.outWpt, p.outHpt, undefined, 'FAST');
  }
  try { pdf.save(filename); } catch(e){ console.warn(e); }
}





window.exportPDF = exportPDF;


function drawImageScaled(ctx, img, sizeOrCanvas) {
  return new Promise((resolve) => {
    if (!img || !img.src) return resolve();
    const cw = sizeOrCanvas.width || sizeOrCanvas.width === 0 ? sizeOrCanvas.width : sizeOrCanvas.width;
    const ch = sizeOrCanvas.height || sizeOrCanvas.height === 0 ? sizeOrCanvas.height : sizeOrCanvas.height;
    const width = cw || sizeOrCanvas.width || sizeOrCanvas.width; // fallback
    const height = ch || sizeOrCanvas.height || sizeOrCanvas.height;
    const targetW = width || ctx.canvas.width;
    const targetH = height || ctx.canvas.height;
    const hRatio = targetW / img.naturalWidth;
    const vRatio = targetH / img.naturalHeight;
    const ratio = Math.min(hRatio, vRatio);
    const centerX = (targetW - img.naturalWidth * ratio) / 2;
    const centerY = (targetH - img.naturalHeight * ratio) / 2;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, centerX, centerY, img.naturalWidth * ratio, img.naturalHeight * ratio);
    resolve();
  });
}


function loadImage(evt, kind){
  const file = evt.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file); // fast preview
  const target = (kind==='after') ? els.afterImg : els.beforeImg;
  const targetSide = (kind==='after') ? els.afterImgSide : els.beforeImgSide;
  if (target){ target.onload = () => { updateCanvasSize(); target.onload = null; }; target.src = url; }
  if (targetSide) targetSide.src = url;

  // Persist to active tab as dataURL for reliability (export & save)
  const reader = new FileReader();
  reader.onload = () => {
    const dataURL = reader.result;
    if (state.activeTabId){
      const tab = state.tabs.find(t => t.id===state.activeTabId);
      if (tab){
        if (kind==='before') tab.before = dataURL; if (kind==='after') tab.after = dataURL;
      }
    }
    try{ updateHasImagesFlag(); }catch(_){}
  };
  reader.readAsDataURL(file);

  updateCanvasSize();
  try{ evt.target.value = ''; }catch(_){}
}


function updateBadges(){
  const pct = parseInt(els.slider.value,10);
  els.beforeBadge.style.left = '12px';
  els.beforeBadge.style.opacity = pct > 10 ? '1' : '0.3';
  els.afterBadge.style.right = '12px';
  els.afterBadge.style.opacity = pct < 90 ? '1' : '0.3';
}


function saveProject(){
  try{ serializeActiveTab(); }catch(_){}
  const data = {
    title: els.title?.value?.trim() || '',
    viewMode: state.viewMode,
    singleSource: state.singleSource,
    slider: els.slider?.value || '50',
    description: els.descriptionInput?.value || '',
    canvas: (state.canvas ? state.canvas.toJSON() : null),
    canvasSide: (state.canvasSide ? state.canvasSide.toJSON() : null),
    photoScale: state.photoScale,
    tabs: state.tabs || [],
    activeTabId: state.activeTabId || null
  };
  localStorage.setItem('photocheckr_project', JSON.stringify(data));
  alert('Project saved in this browser.');
}



function loadProject(){
  const raw = localStorage.getItem('photocheckr_project');
  if (!raw) return alert('No saved project found.');
  const data = JSON.parse(raw);

  // Tabs-aware load
  if (Array.isArray(data.tabs) && data.tabs.length){
    state.tabs = data.tabs;
    state.activeTabId = data.activeTabId || data.tabs[0].id;
    updateTabRail();
    const active = state.tabs.find(t=>t.id===state.activeTabId) || state.tabs[0];
    applyTab(active);
    return;
  }

  // Legacy single project fallback
  state.viewMode = data.viewMode || 'slider';
  state.singleSource = data.singleSource || 'before';
  setViewMode(state.viewMode);

  els.title.value = data.title || '';
  els.slider.value = data.slider || '50';
  if (els.descriptionInput) { els.descriptionInput.value = data.description || ''; if (els.descCount) els.descCount.textContent = String((data.description||'').length); }
  if (data.canvas) {
    state.canvas.loadFromJSON(data.canvas, () => state.canvas.renderAll());
  }
  if (data.canvasSide && state.canvasSide) {
    state.canvasSide.loadFromJSON(data.canvasSide, () => state.canvasSide.renderAll());
  }
  updateBadges();

  // Create a single tab from legacy data
  const t = createTab({
    name: 'Vergelijking 1',
    desc: data.description || '',
    slider: data.slider || '50',
    viewMode: data.viewMode || 'slider',
    photoScale: data.photoScale || 100,
    canvasJSON: data.canvas || null,
    canvasSideJSON: data.canvasSide || null
  });
  state.tabs = [t];
  state.activeTabId = t.id;
  updateTabRail();
}


window.saveProject = saveProject;
window.loadProject = loadProject;


function initPhotoScale(){
  if (!els || !els.photoScale || !els.photoScaleOut) return;
  const apply = ()=>{
    // snap to 75/100/125/150/200
    let v = parseInt(els.photoScale.value,10)||100;
    const snaps = [75,100,125];
    v = snaps.reduce((a,b)=> Math.abs(b - v) < Math.abs(a - v) ? b : a, snaps[0]);
    els.photoScale.value = String(v);
    state.photoScale = v;
    els.photoScaleOut.textContent = v + '%';
    // toggle centered wide-view for >=125 in all modes
    try { const vf = document.getElementById('viewerFloat'); if (vf) vf.classList.toggle('wide-view', v >= 125); } catch(_) {}
    updateCanvasSize();
    try{ if (state.viewMode === 'sideBySide' && typeof positionDescNextToPhotos === 'function') { positionDescNextToPhotos(); } }catch(_){}
    try {
      const vf = document.getElementById('viewerFloat');
      if (vf) vf.classList.toggle('wide-view', state.photoScale >= 125);
    } catch(_){}
  };
  els.photoScale.addEventListener('input', apply);
  // initialize
  apply();
}


// === Left Vertical Controls Dock (fixed) ===
function setupControlsDockLeft(){
  try{
    const toolbar = document.getElementById('viewModeToolbar');
    if (!toolbar) return;
    const leftGroup = toolbar.querySelector('.flex.items-center.gap-3');
    const sizeControls = document.getElementById('sizeControls');
    if (!leftGroup || !sizeControls) return;

    // Build dock structure once
    let dock = document.getElementById('controlsDockLeft');
    if (!dock){
      dock = document.createElement('aside');
      dock.id = 'controlsDockLeft';
      dock.innerHTML = '<div id="controlsDockLeftInner"><div id="controlsStack"></div></div>';
      document.body.appendChild(dock);
    }
    const stack = dock.querySelector('#controlsStack');

    // Move nodes into stack
    stack.appendChild(leftGroup);
    stack.appendChild(sizeControls);

    // Ensure correct initial visibility for singleControls
    try{ _toggleSingleControlsVisibility(); }catch(_){}

    // Mark size controls for vertical layout and wrap the range into a rail
    sizeControls.classList.add('vertical-dock');
    const range = sizeControls.querySelector('#photoScale');
    if (range && !range.classList.contains('vertical-range')){
      // Wrap range in a rail for easier vertical sizing
      const rail = document.createElement('div');
      rail.className = 'scale-rail';
      range.parentElement.insertBefore(rail, range);
      rail.appendChild(range);
      range.classList.add('vertical-range');
    }

    // Hide the original toolbar container to prevent spacing
    toolbar.style.display = 'none';

    // Position under nav and set left padding so content doesn't get covered
    function placeDockLeft(){
      
      const nav = document.querySelector('nav');
      const navH = nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
      // measure dock height
      const rect = dock.getBoundingClientRect();
      const h = rect.height || 0;
      // compute centered top but never overlap nav
      const centerTop = Math.max(navH + 8, Math.round((window.innerHeight - h) / 2));
      dock.style.top = centerTop + 'px';
      // keep left margin padding for content
      const w = rect.width || dock.getBoundingClientRect().width;
      document.documentElement.classList.add('has-controls-dock-left');
      document.documentElement.style.setProperty('--dock-left-w', w + 'px');
    
    }
    placeDockLeft();
    window.addEventListener('resize', placeDockLeft, { passive:true });
    window.addEventListener('orientationchange', placeDockLeft, { passive:true });
  }catch(e){ console.warn('setupControlsDockLeft failed', e); }
}


function setupControlsDockRight(){
  try{
    let dock = document.getElementById('controlsDockRight');
    if (!dock){
      dock = document.createElement('aside');
      dock.id = 'controlsDockRight';
      dock.innerHTML = '<div id="controlsDockRightInner"></div>';
      document.body.appendChild(dock);
    }

    function placeDockRight(){
      const nav = document.querySelector('nav');
      const inner = document.getElementById('controlsDockRightInner');
      if (!inner) return;
      // Measure inner for height
      const rectInner = inner.getBoundingClientRect();
      const navH = nav ? (nav.getBoundingClientRect().bottom - nav.getBoundingClientRect().top) : 0;
      const h = rectInner.height || 0;
      const centerTop = Math.max(navH + 8, Math.round((window.innerHeight - h) / 2));
      dock.style.top = centerTop + 'px';
      // Width var for potential layout consumers
      const rectDock = dock.getBoundingClientRect();
      const w = rectDock.width || rectInner.width || 120;
      document.documentElement.classList.add('has-controls-dock-right');
      document.documentElement.style.setProperty('--dock-right-w', w + 'px');
      // Keep a shared top var so both docks align
      try{ document.documentElement.style.setProperty('--dock-top', centerTop + 'px'); }catch(_){}
    }

    placeDockRight();
    window.addEventListener('resize', placeDockRight, { passive: true });
    window.addEventListener('orientationchange', placeDockRight, { passive: true });

    // If a tab rail exists already, move it into the right dock; else create one
    let rail = document.getElementById('tabRail');
    const host = document.getElementById('controlsDockRightInner');
    if (!rail){
      
// Delegate creation to ensureTabRail (builds Pages & Notes UI)
try{ ensureTabRail(); }catch(_){}
rail = document.getElementById('tabRail');

    } else {
      // Detach from previous parent
      if (rail.parentElement && rail.parentElement !== host){
        rail.parentElement.removeChild(rail);
      }
    }
    if (host && rail && rail.parentElement !== host){
      host.appendChild(rail);
    }
  }catch(e){ console.warn('setupControlsDockRight failed', e); }
}






// === Sync left dock color with <nav> background ===
function syncDockColorWithNav(){
  try{
    const dockInner = document.getElementById('controlsDockLeftInner');
    const nav = document.querySelector('nav');
    if (!dockInner || !nav) return;
    const cs = getComputedStyle(nav);
    const bg = cs.backgroundColor || cs.background;
    const fg = cs.color;
    if (bg) dockInner.style.setProperty('background', bg, 'important');
    if (fg) {
      dockInner.style.setProperty('color', fg, 'important');
      // cascade to children
      dockInner.querySelectorAll('label, .mode-caption-outside, #photoScaleOut').forEach(el=>{
        el.style.setProperty('color', fg, 'important');
      });
    }
    // choose border based on luminance (simple heuristic)
    let border = 'rgba(255,255,255,0.12)';
    const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m){
      const r = +m[1], g = +m[2], b = +m[3];
      const L = (0.2126*r + 0.7152*g + 0.0722*b)/255;
      border = L < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    }
    dockInner.style.setProperty('border-color', border, 'important');
  }catch(e){ console.warn('syncDockColorWithNav failed', e); }
}

// Observe <nav> for theme/class changes and window resizes to keep colors in sync
function setupDockColorObserver(){
  try{
    syncDockColorWithNav();
    const nav = document.querySelector('nav');
    if (!nav) return;
    const mo = new MutationObserver(()=>syncDockColorWithNav());
    mo.observe(nav, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', syncDockColorWithNav, { passive:true });
  }catch(e){ console.warn('setupDockColorObserver failed', e); }
}



// === V28: Resilient hook: ensure single-controls in dock and correct visibility after any mode change ===
function ensureSingleControlsDockedAndVisibility(){
  try{
    const dock = document.getElementById('controlsDockLeft');
    const stack = dock && dock.querySelector('#controlsStack');
    const sc = document.getElementById('singleControls');
    const sizeControls = document.getElementById('sizeControls');
    if (stack && sc && sc.parentElement !== stack){
      // Insert before size controls to keep logical order
      stack.insertBefore(sc, sizeControls || null);
    }
    if (sc){
      const show = (window.state && window.state.viewMode === 'single');
      sc.classList.toggle('hidden', !show);
    }
  }catch(e){ /* no-op */ }
}
// Hook into applyViewModeToDOM if/when it exists
(function hookApplyView(){
  if (typeof window.applyViewModeToDOM === 'function' && !window.__singleDockHooked){
    const orig = window.applyViewModeToDOM;
    window.applyViewModeToDOM = function(){
      const r = orig.apply(this, arguments);
      try{ ensureSingleControlsDockedAndVisibility(); }catch(_){}
      return r;
    };
    window.__singleDockHooked = true;
  } else {
    setTimeout(hookApplyView, 60);
  }
})();
// Also run on DOM ready just in case

// === Floating Single-mode Before/After toggle (bottom) ===
function installSingleFloatingControls(){
  try{
    let box = document.getElementById('singleControlsFloating');
    if (!box){
      box = document.createElement('div');
      box.id = 'singleControlsFloating';
      box.innerHTML = [
        '<label><input type="radio" name="singleSourceFloating" value="before"> <span>Before</span></label>',
        '<label><input type="radio" name="singleSourceFloating" value="after"> <span>After</span></label>'
      ].join('');
      var dock = document.getElementById('controlsDockLeftInner');
      if (dock && box.parentElement !== dock) dock.appendChild(box);
      else document.body.appendChild(box);
    }
    const before = box.querySelector('input[value="before"]');
    const after  = box.querySelector('input[value="after"]');

    function syncRadios(){
      const which = (window.state && state.singleSource) || 'before';
      if (before) before.checked = (which === 'before');
      if (after)  after.checked  = (which === 'after');
    }
    function showHide(){
      // keep pill under left dock if available
      var dock = document.getElementById('controlsDockLeftInner');
      if (dock && box.parentElement !== dock) { try{ dock.appendChild(box); }catch(_){} }

      const isSingle = !!(window.state && state.viewMode === 'single');
      box.style.display = isSingle ? 'flex' : 'none';
      if (isSingle) syncRadios();
    }
    // (Re)bind listeners (clone trick to avoid double-binding)
    if (before){
      const b2 = before.cloneNode(true);
      before.parentNode.replaceChild(b2, before);
      b2.addEventListener('change', () => {
        if (window.state) state.singleSource = 'before';
        if (typeof applyViewModeToDOM === 'function') applyViewModeToDOM();
        if (typeof updateBadges === 'function') updateBadges();
        syncRadios();
      });
    }
    if (after){
      const a2 = after.cloneNode(true);
      after.parentNode.replaceChild(a2, after);
      a2.addEventListener('change', () => {
        if (window.state) state.singleSource = 'after';
        if (typeof applyViewModeToDOM === 'function') applyViewModeToDOM();
        if (typeof updateBadges === 'function') updateBadges();
        syncRadios();
      });
    }

    // initial state
    syncRadios();
    showHide();

    // expose helpers so we can call on mode changes
    window.__singleFloating = { showHide, syncRadios };
  }catch(e){ console.warn('installSingleFloatingControls failed', e); }
}

document.addEventListener('DOMContentLoaded', function(){
  try{ ensureSingleControlsDockedAndVisibility(); }catch(_){}
});



// === V47: Root mode-class for CSS visibility rules ===
function setRootModeClass(){
  try{
    var m = (state && state.viewMode ? String(state.viewMode).toLowerCase() : '');
    var root = document.documentElement;
    root.classList.remove('mode-slider','mode-sidebyside','mode-single');
    if (m === 'slider')      root.classList.add('mode-slider');
    else if (m === 'sidebyside') root.classList.add('mode-sidebyside');
    else if (m === 'single') root.classList.add('mode-single');
  }catch(e){}
}



// === V48: Force-show singleControls in 'single' mode (remove 'hidden' on ancestors) ===
function ensureSingleControlsVisible(){
  try{
    if (!window.state || state.viewMode !== 'single') return;
    var sc = document.getElementById('singleControls');
    if (!sc) return;
    // Remove 'hidden' on this element and its ancestors up to body
    var el = sc;
    for (var i=0; i<5 && el; i++){
      if (el.classList && el.classList.contains('hidden')){
        el.classList.remove('hidden');
      }
      el = el.parentElement;
      if (el && el.tagName === 'BODY') break;
    }
  }catch(e){}
}



// === V51: Guarantee Single controls visible & docked ===
function ensureSingleControlsInDockAndVisible(){
  try{
    var sc = document.getElementById('singleControls');
    if (!sc) return;
    // Move into left controls dock (under mode buttons, before sizeControls)
    try{
      var dock = document.getElementById('controlsDockLeft');
      var stack = dock && dock.querySelector('#controlsStack');
      var sizeC = document.getElementById('sizeControls');
      if (stack && sc.parentElement !== stack){
        stack.insertBefore(sc, sizeC || null);
      }
    }catch(_){}

    // If not in single mode, hide and return
    if (!(window.state && state.viewMode === 'single')){
      sc.classList.add('hidden');
      sc.style.display = '';
      return;
    }

    // Remove 'hidden' from self and a few ancestors; clear display:none
    (function unhideChain(el){
      var p = el, hops = 0;
      while (p && hops < 6){
        try{
          if (p.removeAttribute && p.hasAttribute('hidden')) p.removeAttribute('hidden');
          if (p.classList && p.classList.contains('hidden')) p.classList.remove('hidden');
          if (p.style && p.style.display === 'none') p.style.display = '';
        }catch(_){}
        p = p.parentElement; hops++;
      }
    })(sc);

    // Force visible layout (row, centered handled by CSS below)
    sc.style.display = 'flex';
    sc.style.visibility = 'visible';
    sc.style.opacity = '1';
    sc.style.pointerEvents = 'auto';
  }catch(e){ /* no-op */ }
}



// __forcedDockInit__ : guarantee the docks render even if earlier init fails
window.addEventListener('DOMContentLoaded', () => {
  try { setupControlsDockLeft(); } catch(e){ console.warn('Left dock init failed', e); }
  try { setupControlsDockRight(); } catch(e){ console.warn('Right dock init failed', e); }
  try { ensureTabRail(); } catch(e){ console.warn('ensureTabRail failed', e); }
  try { updateTabRail(); } catch(e){ console.warn('updateTabRail failed', e); }
});
/* __forcedDockInit__ */


// === PATCH: Right dock drag+resize (free move, final) ===
(function enableRightDockFreeMoveFinal(){
  try{
    // Ensure dock exists (created by setupControlsDockRight in your code)
    let dock = document.getElementById('controlsDockRight');
    if (!dock){ try{ setupControlsDockRight(); dock = document.getElementById('controlsDockRight'); }catch(_){ } }
    const inner = document.getElementById('controlsDockRightInner');
    if (!dock || !inner) return;

    let currentTop = null; // track user's intended top

    // Constants/util
    const PAD = 8, MIN_W = 280, MAX_W = 720, KEY = 'rightDock@pos';
    const clamp = (v,min,max) => Math.min(Math.max(v,min),max);
    const readSaved = () => { try{ return JSON.parse(localStorage.getItem(KEY) || '{}'); }catch(_){ return {}; } };
    const persist = (pos) => { try{ localStorage.setItem(KEY, JSON.stringify(pos)); }catch(_){ } };

    // Anchor by LEFT (not RIGHT)
    dock.style.right = 'auto';

    // Initial placement from saved values (if any)
    const rect0 = inner.getBoundingClientRect();
    const defaultLeft = Math.max(PAD, window.innerWidth - (rect0.width || 320) - PAD);
    const saved0 = readSaved();
    const initLeft = (typeof saved0.l === 'number') ? clamp(saved0.l, PAD, Math.max(PAD, window.innerWidth - (rect0.width||320) - PAD)) : defaultLeft;
    dock.style.left = initLeft + 'px';
    if (typeof saved0.w === 'number'){
      inner.style.width = clamp(saved0.w, MIN_W, Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - 2*PAD))) + 'px';
    }

    // Ensure top follows saved value whenever layout reflows
    function applySavedTop(){
      const s = readSaved();
      if (typeof s.t === 'number'){
        const t = clamp(s.t, PAD, Math.max(PAD, window.innerHeight - 120));
        dock.style.setProperty('top', t + 'px', 'important');
      }
    }
    applySavedTop();

    // Guard: if anything else resets top, re-apply our currentTop
    const mo = new MutationObserver(()=>{
      if (currentTop != null) {
        const now = parseFloat(dock.style.top || '0')||0;
        if (Math.abs(now - currentTop) > 0.5) {
          dock.style.setProperty('top', currentTop + 'px', 'important');
        }
      }
    });
    mo.observe(dock, { attributes: true, attributeFilter: ['style'] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', applySavedTop, { passive:true });
    window.addEventListener('orientationchange', applySavedTop, { passive:true });

    // Inject handles
    if (!inner.querySelector('.dock__drag-handle')){
      const drag = document.createElement('div');
      drag.className = 'dock__drag-handle';
      drag.setAttribute('aria-label', 'Sleep om te verplaatsen');
      drag.innerHTML = '<span class="dock__drag-grip" aria-hidden="true">⋮⋮</span>';
      inner.prepend(drag);
    }
    if (!inner.querySelector('.dock__resize-handle')){
      const res = document.createElement('div');
      res.className = 'dock__resize-handle';
      res.setAttribute('aria-label', 'Sleep om te vergroten/verkleinen');
      inner.prepend(res);
    }

    // Dragging (X+Y)
    const dragHandle = inner.querySelector('.dock__drag-handle');
    let dragging = false, dragStart = null;
    dragHandle.addEventListener('pointerdown', (e)=>{
      if (e.button !== 0) return;
      dragging = true;
      dragHandle.setPointerCapture(e.pointerId);
      dragHandle.classList.add('is-active');
      const rect = dock.getBoundingClientRect();
      const t = parseFloat(dock.style.top || rect.top || 0) || 0;
      const l = parseFloat(dock.style.left || rect.left || 0) || 0;
      dragStart = { x: e.clientX, y: e.clientY, t, l };
      currentTop = t;
      e.preventDefault();
    });
    dragHandle.addEventListener('pointermove', (e)=>{
      if (!dragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const rect = inner.getBoundingClientRect();
      const maxL = Math.max(PAD, window.innerWidth - rect.width - PAD);
      const maxT = Math.max(PAD, window.innerHeight - 120);
      const newLeft = clamp(dragStart.l + dx, PAD, maxL);
      const newTop  = clamp(dragStart.t + dy, PAD, maxT);
      dock.style.left = newLeft + 'px';
      dock.style.setProperty('top', newTop + 'px', 'important'); // override any CSS var
      currentTop = newTop;
      dock.style.right = 'auto';
    });
    const endDrag = (e)=>{
      if (!dragging) return;
      dragging = false;
      dragHandle.classList.remove('is-active');
      const t = parseFloat(dock.style.top || '0') || 0;
      const l = parseFloat(dock.style.left || '0') || 0;
      const curr = readSaved();
      persist({ ...curr, t, l });
      currentTop = t;
      // Trigger applySavedTop after layout listeners fire
      window.dispatchEvent(new Event('resize'));
    };
    dragHandle.addEventListener('pointerup', endDrag);
    dragHandle.addEventListener('pointercancel', endDrag);

    // Resizing (from left edge)
    const resHandle = inner.querySelector('.dock__resize-handle');
    let resizing = false, resStart = null;
    resHandle.addEventListener('pointerdown', (e)=>{
      if (e.button !== 0) return;
      resizing = true;
      resHandle.setPointerCapture(e.pointerId);
      resHandle.classList.add('is-active');
      const rect = inner.getBoundingClientRect();
      resStart = { x: e.clientX, w: rect.width };
      e.preventDefault();
    });
    resHandle.addEventListener('pointermove', (e)=>{
      if (!resizing) return;
      const dx = e.clientX - resStart.x;
      const maxW = Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - 2*PAD));
      const newW = clamp(resStart.w - dx, MIN_W, maxW);
      inner.style.width = newW + 'px';
      const rectDock = dock.getBoundingClientRect();
      const rectInner = inner.getBoundingClientRect();
      const w = rectDock.width || rectInner.width || newW;
      try{ document.documentElement.style.setProperty('--dock-right-w', w + 'px'); }catch(_){}
    });
    const endResize = (e)=>{
      if (!resizing) return;
      resizing = false;
      resHandle.classList.remove('is-active');
      const rect = inner.getBoundingClientRect();
      const curr = readSaved();
      persist({ ...curr, w: Math.round(rect.width) });
      window.dispatchEvent(new Event('resize'));
    };
    resHandle.addEventListener('pointerup', endResize);
    resHandle.addEventListener('pointercancel', endResize);

    // Keep within viewport on resize
    window.addEventListener('resize', ()=>{
      const curr = readSaved();
      const rect = inner.getBoundingClientRect();
      const maxTop = Math.max(PAD, window.innerHeight - 120);
      const maxLeft = Math.max(PAD, window.innerWidth - rect.width - PAD);
      const maxW = Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - 2*PAD));
      let changed = false;
      if (typeof curr.t === 'number'){
        const t = clamp(curr.t, PAD, maxTop);
        dock.style.setProperty('top', t + 'px', 'important');
        if (t !== curr.t){ curr.t = t; changed = true; }
      }
      if (typeof curr.l === 'number'){
        const l = clamp(curr.l, PAD, maxLeft);
        dock.style.left = l + 'px';
        dock.style.right = 'auto';
        if (l !== curr.l){ curr.l = l; changed = true; }
      }
      if (typeof curr.w === 'number'){
        const w = clamp(curr.w, MIN_W, maxW);
        inner.style.width = w + 'px';
        try{ document.documentElement.style.setProperty('--dock-right-w', w + 'px'); }catch(_){}
        if (w !== curr.w){ curr.w = w; changed = true; }
      }
      if (changed) persist(curr);
    }, { passive: true });

  }catch(e){ console.warn('[dock drag/resize]', e); }
})();

/* === THEME: harden single mode === */
(function(){
  try {
    const html = document.documentElement;
    html.classList.remove('dark');
    html.classList.remove('light'); // we don't need light/dark classes anymore
  } catch(e){}
})();

/* === Remove any leftover dark-mode toggles at runtime (safety net) === */
(function(){
  try{
    const selectors = [
      '#modeToggle',
      '#mode-toggle',
      '[data-role="theme-toggle"]',
      '[data-action="toggleTheme"]',
      '[aria-label*="Dark"]',
      '[aria-label*="Theme"]'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
  }catch(e){}
})();

