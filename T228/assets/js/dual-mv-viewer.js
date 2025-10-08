// assets/js/dual-mv-viewer.js — Dual pane model-viewer with GLTF-embed + camera link

// Helpers
function setError(el, msg){ if (el) el.textContent = msg || ''; }
function b64FromArrayBuffer(buf){
  let binary=''; const bytes=new Uint8Array(buf); const chunk=0x8000;
  for (let i=0;i<bytes.length;i+=chunk){ binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk)); }
  return btoa(binary);
}
function mimeFor(name){
  const n = (name||'').toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.bin')) return 'application/octet-stream';
  if (n.endsWith('.gltf')) return 'model/gltf+json';
  if (n.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}
function baseName(p){ const parts=(p||'').split('/'); return parts[parts.length-1]; }

async function embedGLTFAsDataURI(gltfFile, files, errEl){
  const text = await gltfFile.text();
  let json;
  try { json = JSON.parse(text); } catch(e){ throw new Error('GLTF JSON is ongeldig'); }
  const map = new Map();
  for (const f of files||[]){
    map.set(f.name, f);
    map.set(decodeURIComponent(f.name), f);
    map.set(f.name.toLowerCase(), f);
    map.set(decodeURIComponent(f.name.toLowerCase()), f);
  }
  function findFileFor(uri){
    if (!uri) return null;
    const bn = baseName(uri);
    return map.get(uri) || map.get(decodeURIComponent(uri)) || map.get(uri.toLowerCase()) || map.get(decodeURIComponent(uri.toLowerCase())) ||
           map.get(bn)  || map.get(decodeURIComponent(bn))  || map.get(bn.toLowerCase()) || map.get(decodeURIComponent(bn.toLowerCase())) || null;
  }
  if (Array.isArray(json.buffers)){
    for (const buf of json.buffers){
      if (buf.uri && !buf.uri.startsWith('data:')){
        const f = findFileFor(buf.uri);
        if (!f) throw new Error('Ontbrekende buffer: ' + buf.uri + ' — selecteer ook de .bin');
        const ab = await f.arrayBuffer();
        buf.uri = `data:${mimeFor(f.name)};base64,${b64FromArrayBuffer(ab)}`;
      }
    }
  }
  if (Array.isArray(json.images)){
    for (const im of json.images){
      if (im.uri && !im.uri.startsWith('data:')){
        const f = findFileFor(im.uri);
        if (!f) throw new Error('Ontbrekende texture: ' + im.uri + ' — selecteer de afbeelding(en) mee');
        const ab = await f.arrayBuffer();
        im.uri = `data:${mimeFor(f.name)};base64,${b64FromArrayBuffer(ab)}`;
      }
    }
  }
  const blob = new Blob([JSON.stringify(json)], { type: 'model/gltf+json' });
  return URL.createObjectURL(blob);
}

function setupPane(prefix){
  const mv = document.getElementById(prefix+'-mv');
  const errEl = document.getElementById(prefix+'-error');
  const metaEl = document.getElementById(prefix+'-meta');
  const input = document.getElementById(prefix+'-file');
  const drop = document.getElementById(prefix+'-drop');
  const btnSample = document.getElementById(prefix+'-sample');
  function updateMeta(){
    const name = mv.src?.split('/').pop();
    const tmp = [];
    if (name) tmp.push('Bron: '+decodeURIComponent(name));
    tmp.push('Auto-rotate: ' + (mv.autoRotate ? 'aan' : 'uit'));
    if (metaEl) metaEl.textContent = tmp.join(' — ');
  }
  async function setSrcFromFiles(files){
    setError(errEl, '');
    const list = Array.from(files||[]);
    if (!list.length) return;
    const glb = list.find(f => /\.glb$/i.test(f.name));
    const gltf = list.find(f => /\.gltf$/i.test(f.name));
    if (glb){
      const url = URL.createObjectURL(glb);
      mv.src = url;
      mv.addEventListener('load', ()=>{ setTimeout(()=>URL.revokeObjectURL(url), 3000); updateMeta(); }, { once:true });
      return;
    }
    if (gltf){
      try{
        const url = await embedGLTFAsDataURI(gltf, list, errEl);
        mv.src = url;
        mv.addEventListener('load', updateMeta, { once:true });
      }catch(e){
        console.error(e);
        setError(errEl, e.message || 'Kon GLTF niet samenstellen. Kies .gltf + .bin + textures tegelijk.');
      }
      return;
    }
    setError(errEl, 'Kies een .glb of .gltf (selecteer .gltf + .bin + textures samen).');
  }
  input?.addEventListener('change', e => setSrcFromFiles(e.target.files));
  if (drop){
    ['dragenter','dragover'].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('ring'); }));
    ['dragleave','drop'].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('ring'); }));
    drop.addEventListener('drop', e => setSrcFromFiles(e.dataTransfer.files));
  }
  window.addEventListener('dragover', e=> e.preventDefault());
  window.addEventListener('drop', e=> { if (!drop || !drop.contains(e.target)) e.preventDefault(); });

  btnSample?.addEventListener('click', ()=>{
    setError(errEl, '');
    mv.src = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
    mv.addEventListener('load', updateMeta, { once:true });
  });

  return { mv, updateMeta, errEl };
}

function linkCameras(leftMV, rightMV, checkbox){
  let lock=false;
  function sync(src, dst){
    if (lock) return;
    lock=true;
    try{
      if (typeof src.getCameraOrbit === 'function' && typeof dst.getCameraOrbit === 'function'){
        const o = src.getCameraOrbit();
        const t = src.getCameraTarget?.();
        const fov = src.getFieldOfView?.();
        if (o){ dst.cameraOrbit = `${o.theta}rad ${o.phi}rad ${o.radius}m`; }
        if (typeof fov === 'number'){ dst.fieldOfView = `${fov}deg`; }
        if (t){ dst.cameraTarget = `${t.x}m ${t.y}m ${t.z}m`; }
      } else {
        // Fallback: copy attributes
        const orbit = src.getAttribute('camera-orbit');
        const target = src.getAttribute('camera-target');
        const fov = src.getAttribute('field-of-view');
        if (orbit) dst.setAttribute('camera-orbit', orbit);
        if (target) dst.setAttribute('camera-target', target);
        if (fov) dst.setAttribute('field-of-view', fov);
      }
    } finally { lock=false; }
  }
  function onLeft(){ if (checkbox.checked) sync(leftMV, rightMV); }
  function onRight(){ if (checkbox.checked) sync(rightMV, leftMV); }
  leftMV.addEventListener('camera-change', onLeft);
  rightMV.addEventListener('camera-change', onRight);
}

document.addEventListener('DOMContentLoaded', () => {
  const left = setupPane('left');
  const right = setupPane('right');

  // Link cameras
  const linkChk = document.getElementById('link-views');
  linkCameras(left.mv, right.mv, linkChk);

  // Swap
  const btnSwap = document.getElementById('btn-swap');
  btnSwap?.addEventListener('click', ()=>{
    const a = left.mv.src, b = right.mv.src;
    left.mv.src = b || '';
    right.mv.src = a || '';
    left.updateMeta(); right.updateMeta();
  });

  // Autorotate toggle (both)
  const btnAuto = document.getElementById('btn-autorotate');
  btnAuto?.addEventListener('click', ()=>{
    const state = !(left.mv.autoRotate || right.mv.autoRotate);
    left.mv.autoRotate = state; right.mv.autoRotate = state;
    left.updateMeta(); right.updateMeta();
  });

  // Load sample both
  const btnSampleBoth = document.getElementById('btn-sample-both');
  btnSampleBoth?.addEventListener('click', ()=>{
    left.mv.src = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
    right.mv.src = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
    const once = ()=>{ left.updateMeta(); right.updateMeta(); };
    left.mv.addEventListener('load', once, { once:true });
    right.mv.addEventListener('load', once, { once:true });
  });

  // Init meta
  left.updateMeta(); right.updateMeta();
});
