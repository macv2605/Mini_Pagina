(() => {
  'use strict';

  const STORAGE_KEY = 'linkvault_urls_v1';
  const STATS_KEY = 'linkvault_stats_v1';
  let urls = [];
  let filterText = '';
  let filesProcessedCount = 0;
  let duplicatesAvoidedCount = 0;
  let lastUpdatedAt = null;
  let storageAvailable = true;

  const $ = id => document.getElementById(id);
  const fileInput = $('fileInput');
  const dropZone = $('dropZone');
  const fileNamesEl = $('fileNames');
  const searchInput = $('searchInput');
  const urlListEl = $('urlList');
  const emptyStateEl = $('emptyState');
  const noResultsStateEl = $('noResultsState');
  const openAllBtn = $('openAllBtn');
  const copyAllBtn = $('copyAllBtn');
  const clearAllBtn = $('clearAllBtn');
  const popupWarning = $('popupWarning');
  const toastContainer = $('toastContainer');
  const storageBadge = $('storageBadge');
  const driveDot = $('driveDot');
  const driveMessage = $('driveMessage');
  const syncState = $('syncState');
  const statTotalEl = $('statTotal');
  const statFilesEl = $('statFiles');
  const statDuplicatesEl = $('statDuplicates');
  const statUpdatedEl = $('statUpdated');

  const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/gi;
  const TRAILING_CHARS_REGEX = /[.,;:!?)\]}>'"`]+$/;

  function trimTrailingPunctuation(url) {
    let cleaned = url, previous;
    do {
      previous = cleaned;
      cleaned = cleaned.replace(TRAILING_CHARS_REGEX, match => {
        if (match.endsWith(')')) {
          const opens = (cleaned.match(/\(/g) || []).length;
          const closes = (cleaned.match(/\)/g) || []).length;
          if (closes <= opens) return match;
        }
        return match.slice(0, -1);
      });
    } while (cleaned !== previous && cleaned.length > 0);
    return cleaned;
  }

  function isValidUrl(candidate) {
    try {
      const u = new URL(candidate);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  function extractUrls(text) {
    return (text.match(URL_REGEX) || [])
      .map(trimTrailingPunctuation)
      .filter(u => u && isValidUrl(u));
  }

  function addUrls(newUrls) {
    const existing = new Set(urls);
    let added = 0;
    let duplicates = 0;
    for (const url of newUrls) {
      if (existing.has(url)) duplicates++;
      else { existing.add(url); urls.push(url); added++; }
    }
    duplicatesAvoidedCount += duplicates;
    return added;
  }

  function loadFromStorage() {
    try {
      const rawUrls = localStorage.getItem(STORAGE_KEY);
      const rawStats = localStorage.getItem(STATS_KEY);
      if (rawUrls) {
        const parsed = JSON.parse(rawUrls);
        if (Array.isArray(parsed)) urls = parsed.filter(u => typeof u === 'string');
      }
      if (rawStats) {
        const s = JSON.parse(rawStats);
        filesProcessedCount = Number(s.filesProcessedCount) || 0;
        duplicatesAvoidedCount = Number(s.duplicatesAvoidedCount) || 0;
        lastUpdatedAt = s.lastUpdatedAt || null;
      }
    } catch (_) { storageAvailable = false; }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
      localStorage.setItem(STATS_KEY, JSON.stringify({ filesProcessedCount, duplicatesAvoidedCount, lastUpdatedAt }));
    } catch (_) {
      storageAvailable = false;
      storageBadge?.classList.add('hidden');
    }
  }

  function showToast(message, variant='info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.transition='opacity .25s ease'; toast.style.opacity='0'; setTimeout(()=>toast.remove(),260); }, 2600);
  }

  function setDriveState(state, message) {
    const online = state === 'ok';
    driveDot?.classList.toggle('offline', !online);
    syncState?.classList.toggle('offline', !online);
    if (syncState) syncState.textContent = online ? 'Listo' : 'Sin configurar';
    if (driveMessage) driveMessage.textContent = message;
  }

  function isDriveConfigured() {
    return typeof APPS_SCRIPT_URL === 'string' && APPS_SCRIPT_URL.startsWith('https://script.google.com/macros/s/') && APPS_SCRIPT_URL.endsWith('/exec');
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunk = 0x8000;
    for (let i=0; i<bytes.length; i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
    return btoa(binary);
  }

  async function sendToAppsScript(file, allUrls) {
    if (!isDriveConfigured()) {
      setDriveState('offline', 'Falta configurar APPS_SCRIPT_URL en config.js.');
      return false;
    }

    try {
      const fileBase64 = await fileToBase64(file);
      const generatedText = allUrls.join('\n') + (allUrls.length ? '\n' : '');
      const generatedBase64 = textToBase64(generatedText);
      const params = new URLSearchParams();
      params.set('action', 'linkvault_upload');
      params.set('fileName', file.name);
      params.set('fileMime', 'text/plain');
      params.set('fileBase64', fileBase64);
      params.set('generatedBase64', generatedBase64);
      params.set('generatedFileName', `URLs_${new Date().toISOString().slice(0,10)}.txt`);
      params.set('generatedMime', 'text/plain');

      // Igual que el proyecto QR: envío directo a Apps Script sin OAuth en el navegador.
      await fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body:params });
      setDriveState('ok', 'Guardado en Google Drive mediante Google Apps Script.');
      return true;
    } catch (error) {
      console.error(error);
      setDriveState('offline', 'No se pudo enviar a Google Drive. Revisa la URL de Apps Script.');
      return false;
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.txt') || f.type === 'text/plain');
    if (!files.length) { showToast('Selecciona al menos un archivo .txt válido.','error'); return; }
    fileNamesEl.textContent = files.length === 1 ? `Archivo cargado: ${files[0].name}` : `${files.length} archivos cargados: ${files.map(f=>f.name).join(', ')}`;

    let totalNew = 0, errors = 0, driveSent = 0;
    for (const file of files) {
      try {
        const text = await readFileAsText(file);
        totalNew += addUrls(extractUrls(text));
        filesProcessedCount++;
        lastUpdatedAt = new Date().toISOString();
        saveToStorage();
        render();
        if (await sendToAppsScript(file, urls)) driveSent++;
      } catch (err) { errors++; console.error(`Error al leer ${file.name}:`, err); }
    }

    lastUpdatedAt = new Date().toISOString();
    saveToStorage();
    render();
    if (errors) showToast(`${errors} archivo(s) no se pudieron leer.`,'error');
    showToast(totalNew ? `Se añadieron ${totalNew} URL(s) nuevas.` : 'No se encontraron URLs nuevas.', totalNew ? 'success':'info');
    if (driveSent) showToast(`${driveSent} archivo(s) enviado(s) a Google Drive.`,'success');
  }

  fileInput?.addEventListener('change', e => { if (e.target.files?.length) { handleFiles(e.target.files); fileInput.value=''; } });
  ['dragenter','dragover'].forEach(evt => dropZone?.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation();dropZone.classList.add('drop-active');}));
  ['dragleave','drop'].forEach(evt => dropZone?.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation();dropZone.classList.remove('drop-active');}));
  dropZone?.addEventListener('drop',e=>{if(e.dataTransfer?.files?.length)handleFiles(e.dataTransfer.files);});
  searchInput?.addEventListener('input',e=>{filterText=e.target.value.trim().toLowerCase();render();});

  function openUrl(url) {
    const win = window.open(url,'_blank','noopener,noreferrer');
    if (!win) showToast('El navegador bloqueó la ventana emergente.','error');
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) { try { const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;} catch(e){return false;} }
  }
  function removeUrl(url) { urls=urls.filter(u=>u!==url);lastUpdatedAt=new Date().toISOString();saveToStorage();render();showToast('URL eliminada.','info'); }

  openAllBtn?.addEventListener('click',()=>{if(!urls.length)return;if(urls.length>3)popupWarning?.classList.remove('hidden');urls.forEach((u,i)=>setTimeout(()=>window.open(u,'_blank','noopener,noreferrer'),i*60));showToast(`Abriendo ${urls.length} URL(s)...`,'info');});
  copyAllBtn?.addEventListener('click',async()=>{if(!urls.length)return;const ok=await copyText(urls.join('\n'));showToast(ok?`${urls.length} URL(s) copiadas al portapapeles.`:'No se pudo copiar al portapapeles.',ok?'success':'error');});
  clearAllBtn?.addEventListener('click',()=>{if(!urls.length)return;if(!confirm(`¿Seguro que quieres eliminar las ${urls.length} URLs de la lista?`))return;urls=[];filesProcessedCount=0;duplicatesAvoidedCount=0;lastUpdatedAt=new Date().toISOString();filterText='';if(searchInput)searchInput.value='';if(fileNamesEl)fileNamesEl.textContent='';popupWarning?.classList.add('hidden');saveToStorage();render();showToast('Lista vaciada.','info');});

  function escapeHtml(str){const div=document.createElement('div');div.textContent=str;return div.innerHTML;}
  function formatLastUpdated(){if(!lastUpdatedAt)return '—';try{return new Date(lastUpdatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(_){return '—';}}

  function render(){
    statTotalEl.textContent=String(urls.length);statFilesEl.textContent=String(filesProcessedCount);statDuplicatesEl.textContent=String(duplicatesAvoidedCount);statUpdatedEl.textContent=formatLastUpdated();
    const hasAny=urls.length>0;openAllBtn.disabled=!hasAny;copyAllBtn.disabled=!hasAny;clearAllBtn.disabled=!hasAny;if(!hasAny)popupWarning?.classList.add('hidden');
    if(storageAvailable)storageBadge?.classList.remove('hidden');
    const filtered=filterText?urls.filter(u=>u.toLowerCase().includes(filterText)):urls;
    urlListEl.innerHTML='';
    if(!hasAny){emptyStateEl?.classList.remove('hidden');noResultsStateEl?.classList.add('hidden');return;}
    emptyStateEl?.classList.add('hidden');
    if(!filtered.length){noResultsStateEl?.classList.remove('hidden');return;}
    noResultsStateEl?.classList.add('hidden');
    const fragment=document.createDocumentFragment();
    filtered.forEach(url=>{const li=document.createElement('li');li.className='url-row';li.innerHTML=`<span class="url-text" title="${escapeHtml(url)}">${escapeHtml(url)}</span><div class="url-actions"><button data-action="open" class="btn btn-teal">Abrir</button><button data-action="copy" class="btn btn-neutral">Copiar</button><button data-action="delete" class="btn btn-danger">Eliminar</button></div>`;li.querySelector('[data-action="open"]').addEventListener('click',()=>openUrl(url));li.querySelector('[data-action="copy"]').addEventListener('click',async()=>{const ok=await copyText(url);showToast(ok?'URL copiada.':'No se pudo copiar.',ok?'success':'error');});li.querySelector('[data-action="delete"]').addEventListener('click',()=>removeUrl(url));fragment.appendChild(li);});
    urlListEl.appendChild(fragment);
  }

  loadFromStorage();
  if (isDriveConfigured()) setDriveState('ok','Listo para guardar TXT y URLs generadas en Google Drive.');
  else setDriveState('offline','Falta configurar APPS_SCRIPT_URL en config.js.');
  render();
})();
