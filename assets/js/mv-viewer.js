// assets/js/mv-viewer.js — Clean Start v2 with GLTF embed (data URIs) for <model-viewer>
const mv = document.getElementById('mv');
const fileInput = document.getElementById('file-input');
const btnAuto = document.getElementById('btn-autorotate');
const btnSample = document.getElementById('btn-sample');
const dropZone = document.getElementById('drop-zone');
const metaEl = document.getElementById('model-meta');
const errEl = document.getElementById('error-box');

function setError(msg){ if(!errEl) return; errEl.textContent = msg || ''; }

function b64FromArrayBuffer(buf){
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i=0;i<bytes.length;i+=chunk){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
  }
  return btoa(binary);
}
function mimeFor(name){
  const n = name.toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.bin')) return 'application/octet-stream';
  if (n.endsWith('.gltf')) return 'model/gltf+json';
  if (n.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}
function baseName(p){
  const parts = p.split('/'); return parts[parts.length-1];
}

// Pack .gltf + external files into a single .gltf with data URIs
async function embedGLTFAsDataURI(gltfFile, files){
  const text = await gltfFile.text();
  let json;
  try { json = JSON.parse(text); }
  catch(e){ throw new Error('GLTF JSON is ongeldig'); }

  const map = new Map();
  for (const f of files){
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

async function setSrcFromFiles(files){
  setError('');
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
      const url = await embedGLTFAsDataURI(gltf, list);
      mv.src = url;
      mv.addEventListener('load', ()=>{ updateMeta(); }, { once:true });
    }catch(e){
      console.error(e);
      setError(e.message || 'Kon GLTF niet samenstellen. Kies .gltf + .bin + textures tegelijk.');
    }
    return;
  }
  setError('Kies een .glb of .gltf (meerdere bestanden tegelijk als het .gltf is).');
}

function updateMeta(){
  const name = mv.src?.split('/').pop();
  const tmp = [];
  if (name) tmp.push('Bron: ' + decodeURIComponent(name));
  tmp.push('Auto-rotate: ' + (mv.autoRotate ? 'aan' : 'uit'));
  metaEl.textContent = tmp.join(' — ');
}

fileInput?.addEventListener('change', e => setSrcFromFiles(e.target.files));

['dragenter','dragover'].forEach(ev=> dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.add('ring'); }));
['dragleave','drop'].forEach(ev=> dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.remove('ring'); }));
dropZone.addEventListener('drop', e => setSrcFromFiles(e.dataTransfer.files));
window.addEventListener('dragover', e=> e.preventDefault());
window.addEventListener('drop', e=> { if (!dropZone.contains(e.target)) e.preventDefault(); });

btnAuto?.addEventListener('click', ()=> { mv.autoRotate = !mv.autoRotate; updateMeta(); });

btnSample?.addEventListener('click', ()=>{
  setError('');
  mv.src = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
  mv.addEventListener('load', updateMeta, { once:true });
});

updateMeta();
