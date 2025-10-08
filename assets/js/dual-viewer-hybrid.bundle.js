
// assets/js/dual-viewer-hybrid.bundle.js
(function(){
  console.log('%c[3D Hybrid] init', 'color:#6cf');

  function isGLTFName(name){ name=(name||'').toLowerCase(); return name.endsWith('.glb')||name.endsWith('.gltf'); }
  function filesArray(filesLike){ if (!filesLike) return []; if (filesLike instanceof FileList) return Array.from(filesLike); if (Array.isArray(filesLike)) return filesLike.slice(); return []; }
  function isAllGltf(files){
    const arr = filesArray(files);
    if (arr.length===0) return false;
    const hasGL = arr.some(f => isGLTFName(f.name));
    const other3d = arr.some(f => /\.(fbx|obj|stl|ply|3ds|dae|wrl|off)$/i.test(f.name));
    return hasGL && !other3d;
  }

  // ---- Helpers for GLTF embedding (based on your original code)
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
  function baseName(p){ const parts=(p||'').split('/'); return parts[parts.length-1]||p; }
  async function embedGLTFAsDataURI(gltfFile, files){
    const text = await gltfFile.text();
    let json = JSON.parse(text);
    const map = new Map();
    for (const f of files||[]){
      map.set(f.name, f); map.set(decodeURIComponent(f.name), f);
      map.set(f.name.toLowerCase(), f); map.set(decodeURIComponent(f.name.toLowerCase()), f);
    }
    function findFileFor(uri){
      if (!uri) return null;
      const bn = baseName(uri);
      return map.get(uri) || map.get(decodeURIComponent(uri)) ||
             map.get(uri.toLowerCase()) || map.get(decodeURIComponent(uri.toLowerCase())) ||
             map.get(bn) || map.get(decodeURIComponent(bn)) ||
             map.get(bn.toLowerCase()) || map.get(decodeURIComponent(bn.toLowerCase())) || null;
    }
    if (json.buffers){
      for (const buf of json.buffers){
        if (buf.uri && !buf.uri.startsWith('data:')){
          const f = findFileFor(buf.uri); if (!f) throw new Error('Ontbrekend .bin bestand: '+buf.uri);
          const ab = await f.arrayBuffer();
          buf.uri = `data:${mimeFor(f.name)};base64,${b64FromArrayBuffer(ab)}`;
        }
      }
    }
    if (Array.isArray(json.images)){
      for (const im of json.images){
        if (im.uri && !im.uri.startsWith('data:')){
          const f = findFileFor(im.uri); if (!f) throw new Error('Ontbrekende texture: '+im.uri+' — selecteer de afbeelding(en) mee');
          const ab = await f.arrayBuffer();
          im.uri = `data:${mimeFor(f.name)};base64,${b64FromArrayBuffer(ab)}`;
        }
      }
    }
    const blob = new Blob([JSON.stringify(json)], { type: 'model/gltf+json' });
    return URL.createObjectURL(blob);
  }

  // ---- Adapters
  class ModelViewerAdapter{
    constructor(container){
      this.container = container;
      this.container.classList.remove('--use-o3dv');
      this.mv = container.querySelector('model-viewer');
      if (!this.mv){
        this.mv = document.createElement('model-viewer');
        this.mv.setAttribute('camera-controls','');
        this.mv.style.width='100%'; this.mv.style.height='100%';
        container.appendChild(this.mv);
      }
      console.log('[3D Hybrid] Using <model-viewer> in', '#'+(container.id||'?'));
    }
    async load(bundle){
      if (bundle && bundle.url){
        this.mv.src = bundle.url;
        try {
  this.mv.setAttribute('camera-target', 'auto');
  this.mv.setAttribute('camera-orbit',  '0deg 75deg auto');
  this.mv.setAttribute('field-of-view', 'auto');
  if (this.mv.jumpCameraToGoal) this.mv.jumpCameraToGoal(); // spring direct naar goal
  if (this.mv.reset)            this.mv.reset();            // reset naar beginsituatie
} catch (e) {
  console.warn('[3D Hybrid] model-viewer fit warning', e);
}
        this.mv.addEventListener('load', ()=>console.log('[3D Hybrid] <model-viewer> loaded url'), { once:true });
        return;
      }
      const arr = bundle && bundle.files ? filesArray(bundle.files) : [];
      const glb = arr.find(f => /\.glb$/i.test(f.name));
      const gltf = arr.find(f => /\.gltf$/i.test(f.name));
      if (glb){
        const url = URL.createObjectURL(glb);
        this.mv.src = url;
        try {
  this.mv.setAttribute('camera-target', 'auto');
  this.mv.setAttribute('camera-orbit',  '0deg 75deg auto');
  this.mv.setAttribute('field-of-view', 'auto');
  if (this.mv.jumpCameraToGoal) this.mv.jumpCameraToGoal(); // spring direct naar goal
  if (this.mv.reset)            this.mv.reset();            // reset naar beginsituatie
} catch (e) {
  console.warn('[3D Hybrid] model-viewer fit warning', e);
}
        this.mv.addEventListener('load', ()=>{ console.log('[3D Hybrid] <model-viewer> loaded GLB'); setTimeout(()=>URL.revokeObjectURL(url), 5000); }, { once:true });
        return;
      }
      if (gltf){
        const url = await embedGLTFAsDataURI(gltf, arr);
        this.mv.src = url;
        try {
  this.mv.setAttribute('camera-target', 'auto');
  this.mv.setAttribute('camera-orbit',  '0deg 75deg auto');
  this.mv.setAttribute('field-of-view', 'auto');
  if (this.mv.jumpCameraToGoal) this.mv.jumpCameraToGoal(); // spring direct naar goal
  if (this.mv.reset)            this.mv.reset();            // reset naar beginsituatie
} catch (e) {
  console.warn('[3D Hybrid] model-viewer fit warning', e);
}
        this.mv.addEventListener('load', ()=>console.log('[3D Hybrid] <model-viewer> loaded GLTF(data-uri)'), { once:true });
        return;
      }
      throw new Error('ModelViewerAdapter: no glTF/GLB source');
    }
    setAutoRotate(on){ this.mv.autoRotate = !!on; }
    getCamera(){ return { cameraTarget: this.mv.getAttribute('camera-target')||'auto', cameraOrbit: this.mv.getAttribute('camera-orbit')||'auto', fieldOfView: this.mv.getAttribute('field-of-view')||'auto' }; }
    setCamera(st){ if (!st) return; if (st.cameraTarget) this.mv.setAttribute('camera-target', st.cameraTarget); if (st.cameraOrbit) this.mv.setAttribute('camera-orbit', st.cameraOrbit); if (st.fieldOfView) this.mv.setAttribute('field-of-view', st.fieldOfView); }
    dispose(){}
  }

  class O3DVAdapter{
  constructor(container, name){
    this.name = name || '?';
    this.container = container;
    this.container.classList.add('--use-o3dv');

    this.host = container.querySelector('.o3dv-host');
    if (!this.host){
      this.host = document.createElement('div');
      this.host.className = 'o3dv-host';
      container.appendChild(this.host);
    }
    // Host zelf ook donker maken (voor het geval)
    this.host.style.background = '#0B0B0B';

    // 🔴 Zwarte achtergrond in O3DV + nette randen
    const params = {
      backgroundColor : new OV.RGBAColor(11, 11, 11, 255),
      defaultColor    : new OV.RGBColor(200, 200, 200),
      edgeSettings    : new OV.EdgeSettings(true, new OV.RGBColor(0,0,0), 30),
      onModelLoaded   : () => {
        // na laden altijd in beeld brengen
        this.viewer.FitToWindow();
      }
    };

    this.embedded = new OV.EmbeddedViewer(this.host, params);
    this.viewer   = this.embedded.GetViewer();
  }

  async load(bundle){
    const arr = bundle && bundle.files
      ? (bundle.files instanceof FileList ? Array.from(bundle.files) : bundle.files)
      : [];
    if (!arr.length) throw new Error('Geen bestanden ontvangen (FBX/OBJ/STL)');

    // Probeer officiële weg
    try {
      await Promise.resolve(this.embedded.LoadModelFromFileList(arr));
      return;
    } catch (e) {
      // Fallback
      const inputs = arr.map(f => new OV.InputFile(f.name, f));
      await new Promise((resolve, reject) => {
        OV.LoadModelFromInputFiles(inputs, (files) => {
          this.viewer.Clear();
          this.viewer.AddModel(files);
          this.viewer.FitToWindow();   // ⬅️ centreren
          resolve();
        }, reject);
      });
    }
  }
    setAutoRotate(on){ if (this.viewer) this.viewer.SetAutoRotate(on===true); }
    getCamera(){ if (!this.viewer) return null; const cam=this.viewer.navigator.camera; return { position: cam.eye.Clone(), target: cam.center.Clone(), up: cam.up.Clone() }; }
    setCamera(st){ if (!this.viewer||!st) return; const {position,target,up}=st; if (position&&target&&up){ this.viewer.navigator.SetCamera(position, target, up); this.viewer.Render(); } }
    dispose(){ if (this.embedded){ this.embedded.Destroy(); this.embedded=null; } this.viewer=null; this.container.classList.remove('--use-o3dv'); }
  }

  class Pane{
    constructor(root, name){
      this.root = root; this.name = name;
      this.adapter = null;
    }
    async load(bundle){
      try{
        if (this.adapter) this.adapter.dispose();
        const files = bundle && bundle.files;
        if (bundle && bundle.url){
          this.adapter = new ModelViewerAdapter(this.root);
          await this.adapter.load({ url: bundle.url });
          return;
        }
        if (files && isAllGltf(files)){
          this.adapter = new ModelViewerAdapter(this.root);
          await this.adapter.load({ files });
        }else{
          this.adapter = new O3DVAdapter(this.root, this.name);
          await this.adapter.load({ files });
        }
      }catch(e){
        const id = this.name==='left' ? 'left-error' : 'right-error';
        const el = document.getElementById(id);
        if (el) el.textContent = (e && e.message) ? e.message : String(e);
        throw e;
      }
    }
    setAutoRotate(on){ this.adapter && this.adapter.setAutoRotate(on); }
    getCamera(){ return this.adapter && this.adapter.getCamera(); }
    setCamera(st){ this.adapter && this.adapter.setCamera(st); }
  }

  const leftCont  = document.getElementById('left-drop');
  const rightCont = document.getElementById('right-drop');
  if (!leftCont || !rightCont){ console.warn('[3D Hybrid] left/right containers not found'); return; }
  const LEFT  = new Pane(leftCont, 'left');
  const RIGHT = new Pane(rightCont,'right');
  console.log('[3D Hybrid] panes ready');

  function hookFileInput(id, pane){
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('change', async e=>{
      const files = e.target.files;
      if (files && files.length){
        console.log('[3D Hybrid] load from input', id, files[0].name);
        await pane.load({ files });
        maybeSync();
      }
    });
  }
  hookFileInput('left-file', LEFT);
  hookFileInput('right-file', RIGHT);

  function hookDropZone(id, pane){
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('dragover', e=>{ e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', ()=> el.classList.remove('dragover'));
    el.addEventListener('drop', async e=>{
      e.preventDefault(); el.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files && files.length){
        console.log('[3D Hybrid] load from drop', id, files[0].name);
        await pane.load({ files });
        maybeSync();
      }
    });
  }
  hookDropZone('left-drop', LEFT);
  hookDropZone('right-drop', RIGHT);

  // Autorotate
  const autorotateBtn = document.getElementById('btn-autorotate');
  if (autorotateBtn){
    autorotateBtn.addEventListener('click', ()=>{
      const on = autorotateBtn.getAttribute('data-on') !== 'true';
      autorotateBtn.setAttribute('data-on', on ? 'true' : 'false');
      LEFT.setAutoRotate(on); RIGHT.setAutoRotate(on);
      console.log('[3D Hybrid] autorotate', on);
    });
  }

  // Link views
  let linkEnabled = false;
  const linkCheckbox = document.getElementById('link-views');
  if (linkCheckbox){
    const update = ()=>{ linkEnabled = !!linkCheckbox.checked; if (linkEnabled) maybeSync(); };
    linkCheckbox.addEventListener('change', update); update();
  }
  function maybeSync(){ if (!linkEnabled) return; const cam = LEFT.getCamera(); if (cam) RIGHT.setCamera(cam); }

  // Swap
  const swapBtn = document.getElementById('btn-swap');
  if (swapBtn){
    swapBtn.addEventListener('click', ()=>{
      const camA = LEFT.getCamera(); const camB = RIGHT.getCamera();
      if (camA && camB){ LEFT.setCamera(camB); RIGHT.setCamera(camA); }
      console.log('[3D Hybrid] swap cameras');
    });
  }

  // Sample both
  const sampleBtn = document.getElementById('btn-sample-both');
  if (sampleBtn){
    sampleBtn.addEventListener('click', async ()=>{
      const url = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
      console.log('[3D Hybrid] sample both', url);
      await LEFT.load({ url }); await RIGHT.load({ url }); maybeSync();
    });
  }

  console.log('%c[3D Hybrid] ready', 'color:#6cf');
})();