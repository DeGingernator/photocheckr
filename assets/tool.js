// Tool logic
import { lazyLoad } from './shared.js';

let fabricLoaded = false;
let jsPDFLoaded = false;

const state = {
  canvas: null,
  undoStack: [],
  redoStack: [],
  currentMode: 'select',
};

const els = {};
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
}

function bindUI(){
  qs('beforeUpload').addEventListener('change', e => loadImage(e, els.beforeImg));
  qs('afterUpload').addEventListener('change', e => loadImage(e, els.afterImg));

  els.slider.addEventListener('input', () => {
    els.afterImg.style.clipPath = `inset(0 ${100 - els.slider.value}% 0 0)`;
    updateBadges();
  });

  window.addEventListener('resize', updateCanvasSize);
  els.colorPicker.addEventListener('input', applyColor);
  els.lineWidth.addEventListener('input', () => {
    if (state.canvas) state.canvas.freeDrawingBrush.width = parseInt(els.lineWidth.value,10);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
      if (e.key.toLowerCase() === 'y') { redo(); e.preventDefault(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
    }
    if (e.key === 'Delete' && state.canvas) {
      const active = state.canvas.getActiveObject();
      if (active) state.canvas.remove(active);
    }
  });

  els.saveBtn.addEventListener('click', saveProject);
  els.loadBtn.addEventListener('click', loadProject);
  els.clearBtn.addEventListener('click', clearCanvas);
  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);

  // Restore title if present
  const saved = JSON.parse(localStorage.getItem('photocheckr_meta') || '{}');
  if (saved.title) els.title.value = saved.title;
  els.title.addEventListener('input', () => {
    localStorage.setItem('photocheckr_meta', JSON.stringify({ title: els.title.value.trim() }));
  });
}

function initCanvasWhenReady(){
  if (!fabricLoaded) { setTimeout(initCanvasWhenReady, 50); return; }
  els.beforeImg.onload = handleImageLoad;
  els.afterImg.onload = handleImageLoad;
}

function handleImageLoad(){
  // Update as soon as either image is ready
  updateCanvasSize();
}

function updateCanvasSize(){
  const w = els.wrapper.clientWidth;

  // Bepaal de grootste beschikbare foto op basis van oppervlakte
  const dims = [];
  if (els.beforeImg && els.beforeImg.naturalWidth && els.beforeImg.naturalHeight) {
    dims.push({ w: els.beforeImg.naturalWidth, h: els.beforeImg.naturalHeight });
  }
  if (els.afterImg && els.afterImg.naturalWidth && els.afterImg.naturalHeight) {
    dims.push({ w: els.afterImg.naturalWidth, h: els.afterImg.naturalHeight });
  }

  // Hoogte bepalen: fallback = oude 0.6 ratio, anders aspect van de grootste foto
  let h;
  if (dims.length === 0) {
    h = Math.max(320, Math.round(w * 0.6));
  } else {
    const largest = dims.sort((a,b) => (b.w*b.h) - (a.w*a.h))[0];
    const aspect = largest.h / largest.w; // hoogte / breedte
    h = Math.max(320, Math.round(w * aspect));
  }

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


function pushUndo(){
  if (!state.canvas || isRestoring) return;
  // Maak een JSON-snapshot van de canvas (niet het object zelf stringifien)
  const snapshot = state.canvas.toJSON();
  state.undoStack.push(JSON.stringify(snapshot));
  if (state.undoStack.length > 100) state.undoStack.shift();
  // Nieuw gebruikers-event: redoStack leegmaken
  state.redoStack.length = 0;
}


function undo(){
  if (state.undoStack.length > 1) {
    const current = state.undoStack.pop();
    state.redoStack.push(current);
    const prev = state.undoStack[state.undoStack.length - 1];

    isRestoring = true;
    state.canvas.loadFromJSON(prev, () => {
      state.canvas.renderAll();
      isRestoring = false;
    });
  }
}

function redo(){
  if (state.redoStack.length > 0) {
    const next = state.redoStack.pop();
    state.undoStack.push(next);

    isRestoring = true;
    state.canvas.loadFromJSON(next, () => {
      state.canvas.renderAll();
      isRestoring = false;
    });
  }
}


function setMode(mode){
  if (!state.canvas) return;
  state.currentMode = mode;
  state.canvas.isDrawingMode = (mode === 'draw');
  if (mode === 'draw') {
    state.canvas.selection = false;
    state.canvas.discardActiveObject();
    state.canvas.renderAll();
  } else {
    state.canvas.selection = true;
    state.canvas.isDrawingMode = false;
    state.canvas.forEachObject(obj => obj.selectable = true);
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
  state.canvas.add(text);
  state.canvas.setActiveObject(text);
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
  state.canvas.add(circle);
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
  state.canvas.add(rect);
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
  state.canvas.add(group);
  setMode('select');
}
window.addArrow = addArrow;

function clearCanvas(){
  if (confirm('Clear all annotations?')) {
    state.canvas.clear();
    state.undoStack = [];
    state.redoStack = [];
    pushUndo();
  }
}
window.clearCanvas = clearCanvas;

function applyColor(){
  if (!state.canvas) return;
  state.canvas.freeDrawingBrush.color = els.colorPicker.value;
  const active = state.canvas.getActiveObject();
  if (active) {
    if (active.type === 'i-text') {
      active.set({ fill: els.colorPicker.value });
    } else if (['circle','rect','line','triangle','group'].includes(active.type)) {
      if (active.set) active.set({ stroke: els.colorPicker.value, fill: active.fill === 'transparent' ? 'transparent' : active.fill });
    }
    state.canvas.renderAll();
  }
}


async function exportPDF(){
  if (!jsPDFLoaded) return alert('PDF library not loaded yet. Please try again.');
  const { jsPDF } = window.jspdf;

  const scale = parseInt(els.quality?.value || '2', 10); // 1x, 2x, 3x
  const pxToPt = 72 / 96; // assume CSS pixel at 96 DPI
  const baseW = state.canvas.width;
  const baseH = state.canvas.height;
  const outWpt = Math.round(baseW * scale * pxToPt);
  const outHpt = Math.round(baseH * scale * pxToPt);

  const filename = (els.title?.value?.trim() || 'PhotoCheckr_Export') + `.pdf`;
  const pdf = new jsPDF({ orientation: outWpt >= outHpt ? 'landscape' : 'portrait', unit: 'pt', format: [outWpt, outHpt + 40] });

  // Create high-DPI offscreen canvas
  const temp = document.createElement('canvas');
  temp.width = baseW * scale * (window.devicePixelRatio || 1);
  temp.height = baseH * scale * (window.devicePixelRatio || 1);
  const ctx = temp.getContext('2d');
  ctx.scale(scale * (window.devicePixelRatio || 1), scale * (window.devicePixelRatio || 1));

  await drawImageScaled(ctx, els.beforeImg, { width: baseW, height: baseH });
  ctx.save();
  const clipWidth = baseW * (els.slider.value / 100);
  ctx.beginPath();
  ctx.rect(0, 0, clipWidth, baseH);
  ctx.clip();
  await drawImageScaled(ctx, els.afterImg, { width: baseW, height: baseH });
  ctx.restore();

  // Render annotations at higher multiplier
  const annotation = new Image();
  annotation.src = state.canvas.toDataURL({ format: 'png', multiplier: scale * (window.devicePixelRatio || 1), enableRetinaScaling: true });
  await new Promise(r => annotation.onload = r);
  ctx.drawImage(annotation, 0, 0, baseW, baseH);

  const combined = temp.toDataURL('image/png'); // PNG is lossless
  // Place image with exact page size in points
  pdf.addImage(combined, 'PNG', 0, 20, outWpt, outHpt, undefined, 'FAST');
  pdf.setFontSize(16);
  pdf.text(els.title?.value?.trim() || 'PhotoCheckr Export', 10, 15);
  pdf.save(filename);
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

function loadImage(evt, target){
  const file = evt.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  target.onload = () => { updateCanvasSize(); target.onload = null; };
  target.src = url;
  updateCanvasSize();
}

function updateBadges(){
  const pct = parseInt(els.slider.value,10);
  els.beforeBadge.style.left = '12px';
  els.beforeBadge.style.opacity = pct > 10 ? '1' : '0.3';
  els.afterBadge.style.right = '12px';
  els.afterBadge.style.opacity = pct < 90 ? '1' : '0.3';
}

function saveProject(){
  if (!state.canvas) return;
  const data = {
    title: els.title.value.trim(),
    slider: els.slider.value,
    canvas: state.canvas.toJSON()
  };
  localStorage.setItem('photocheckr_project', JSON.stringify(data));
  alert('Project saved in this browser.');
}

function loadProject(){
  const raw = localStorage.getItem('photocheckr_project');
  if (!raw) return alert('No saved project found.');
  const data = JSON.parse(raw);
  els.title.value = data.title || '';
  els.slider.value = data.slider || '50';
  if (data.canvas) {
    state.canvas.loadFromJSON(data.canvas, () => state.canvas.renderAll());
  }
  updateBadges();
}

window.saveProject = saveProject;
window.loadProject = loadProject;
