/* ==========================================================================
   LinkVault — Extractor de URLs
   Lógica de la aplicación (JS Vanilla, sin dependencias)
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'linkvault_urls_v1';
  const STATS_KEY = 'linkvault_stats_v1';

  // ---------- Estado ----------
  /** @type {string[]} */
  let urls = [];
  let filterText = '';
  let filesProcessedCount = 0;
  let duplicatesAvoidedCount = 0;
  let lastUpdatedAt = null;
  let storageAvailable = true;

  // ---------- Referencias DOM ----------
  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const fileNamesEl = document.getElementById('fileNames');
  const searchInput = document.getElementById('searchInput');
  const urlListEl = document.getElementById('urlList');
  const emptyStateEl = document.getElementById('emptyState');
  const noResultsStateEl = document.getElementById('noResultsState');
  const openAllBtn = document.getElementById('openAllBtn');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const popupWarning = document.getElementById('popupWarning');
  const toastContainer = document.getElementById('toastContainer');
  const storageBadge = document.getElementById('storageBadge');

  const statTotalEl = document.getElementById('statTotal');
  const statFilesEl = document.getElementById('statFiles');
  const statDuplicatesEl = document.getElementById('statDuplicates');
  const statUpdatedEl = document.getElementById('statUpdated');

  // Regex robusta para detectar URLs http/https en cualquier parte de un texto.
  const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/gi;
  const TRAILING_CHARS_REGEX = /[.,;:!?)\]}>'"`]+$/;

  /**
   * Limpia caracteres de puntuación finales que normalmente no forman parte
   * de la URL, respetando paréntesis balanceados (por ejemplo enlaces de Wikipedia).
   */
  function trimTrailingPunctuation(url) {
    let cleaned = url;
    let previous;
    do {
      previous = cleaned;
      cleaned = cleaned.replace(TRAILING_CHARS_REGEX, (match) => {
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

  /**
   * Valida que una cadena sea una URL http/https bien formada usando el
   * constructor nativo URL.
   */
  function isValidUrl(candidate) {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_e) {
      return false;
    }
  }

  /**
   * Extrae todas las URLs válidas de un bloque de texto.
   */
  function extractUrls(text) {
    const matches = text.match(URL_REGEX) || [];
    const found = [];
    for (const raw of matches) {
      const trimmed = trimTrailingPunctuation(raw);
      if (trimmed && isValidUrl(trimmed)) {
        found.push(trimmed);
      }
    }
    return found;
  }

  /**
   * Añade nuevas URLs al estado global, evitando duplicados exactos.
   * Devuelve cuántas URLs nuevas se añadieron.
   */
  function addUrls(newUrls) {
    const existing = new Set(urls);
    let added = 0;
    let duplicates = 0;
    for (const url of newUrls) {
      if (!existing.has(url)) {
        existing.add(url);
        urls.push(url);
        added++;
      } else {
        duplicates++;
      }
    }
    duplicatesAvoidedCount += duplicates;
    return added;
  }

  // ---------- Persistencia (localStorage) ----------
  function loadFromStorage() {
    try {
      const rawUrls = localStorage.getItem(STORAGE_KEY);
      const rawStats = localStorage.getItem(STATS_KEY);
      if (rawUrls) {
        const parsed = JSON.parse(rawUrls);
        if (Array.isArray(parsed)) urls = parsed.filter(u => typeof u === 'string');
      }
      if (rawStats) {
        const stats = JSON.parse(rawStats);
        filesProcessedCount = Number(stats.filesProcessedCount) || 0;
        duplicatesAvoidedCount = Number(stats.duplicatesAvoidedCount) || 0;
        lastUpdatedAt = stats.lastUpdatedAt || null;
      }
    } catch (_e) {
      storageAvailable = false;
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
      localStorage.setItem(STATS_KEY, JSON.stringify({
        filesProcessedCount,
        duplicatesAvoidedCount,
        lastUpdatedAt,
      }));
    } catch (_e) {
      storageAvailable = false;
      storageBadge.classList.add('hidden');
    }
  }

  // ---------- Notificaciones (toast) ----------
  function showToast(message, variant = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.25s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 260);
    }, 2400);
  }

  // ---------- Lectura de archivos ----------
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.txt') || f.type === 'text/plain';
    });

    if (files.length === 0) {
      showToast('Selecciona al menos un archivo .txt válido.', 'error');
      return;
    }

    fileNamesEl.textContent = files.length === 1
      ? `Archivo cargado: ${files[0].name}`
      : `${files.length} archivos cargados: ${files.map(f => f.name).join(', ')}`;

    let totalNew = 0;
    let filesWithErrors = 0;

    for (const file of files) {
      try {
        const text = await readFileAsText(file);
        const found = extractUrls(text);
        totalNew += addUrls(found);
        filesProcessedCount++;
      } catch (err) {
        filesWithErrors++;
        console.error(`Error al leer ${file.name}:`, err);
      }
    }

    lastUpdatedAt = new Date().toISOString();
    saveToStorage();
    render();

    if (filesWithErrors > 0) {
      showToast(`${filesWithErrors} archivo(s) no se pudieron leer.`, 'error');
    }
    showToast(
      totalNew > 0 ? `Se añadieron ${totalNew} URL(s) nuevas.` : 'No se encontraron URLs nuevas.',
      totalNew > 0 ? 'success' : 'info'
    );
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      fileInput.value = ''; // permite volver a cargar el mismo archivo si se desea
    }
  });

  // ---------- Drag & drop ----------
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drop-active');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drop-active');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // ---------- Filtro ----------
  searchInput.addEventListener('input', (e) => {
    filterText = e.target.value.trim().toLowerCase();
    render();
  });

  // ---------- Acciones individuales ----------
  function openUrl(url) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      showToast('El navegador bloqueó la ventana emergente.', 'error');
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_e) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (err2) {
        return false;
      }
    }
  }

  function removeUrl(url) {
    urls = urls.filter(u => u !== url);
    lastUpdatedAt = new Date().toISOString();
    saveToStorage();
    render();
    showToast('URL eliminada.', 'info');
  }

  // ---------- Acciones globales ----------
  openAllBtn.addEventListener('click', () => {
    if (urls.length === 0) return;
    if (urls.length > 3) {
      popupWarning.classList.remove('hidden');
    }
    urls.forEach((url, i) => {
      setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), i * 60);
    });
    showToast(`Abriendo ${urls.length} URL(s)...`, 'info');
  });

  copyAllBtn.addEventListener('click', async () => {
    if (urls.length === 0) return;
    const ok = await copyText(urls.join('\n'));
    showToast(
      ok ? `${urls.length} URL(s) copiadas al portapapeles.` : 'No se pudo copiar al portapapeles.',
      ok ? 'success' : 'error'
    );
  });

  clearAllBtn.addEventListener('click', () => {
    if (urls.length === 0) return;
    const confirmClear = confirm(`¿Seguro que quieres eliminar las ${urls.length} URLs de la lista?`);
    if (!confirmClear) return;
    urls = [];
    filesProcessedCount = 0;
    duplicatesAvoidedCount = 0;
    lastUpdatedAt = new Date().toISOString();
    filterText = '';
    searchInput.value = '';
    fileNamesEl.textContent = '';
    popupWarning.classList.add('hidden');
    saveToStorage();
    render();
    showToast('Lista vaciada.', 'info');
  });

  // ---------- Utilidades ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatLastUpdated() {
    if (!lastUpdatedAt) return '—';
    try {
      const date = new Date(lastUpdatedAt);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_e) {
      return '—';
    }
  }

  // ---------- Render ----------
  function render() {
    const total = urls.length;

    statTotalEl.textContent = String(total);
    statFilesEl.textContent = String(filesProcessedCount);
    statDuplicatesEl.textContent = String(duplicatesAvoidedCount);
    statUpdatedEl.textContent = formatLastUpdated();

    const hasAny = total > 0;
    openAllBtn.disabled = !hasAny;
    copyAllBtn.disabled = !hasAny;
    clearAllBtn.disabled = !hasAny;
    if (!hasAny) popupWarning.classList.add('hidden');

    if (storageAvailable) {
      storageBadge.classList.remove('hidden');
    }

    const filtered = filterText
      ? urls.filter(u => u.toLowerCase().includes(filterText))
      : urls;

    urlListEl.innerHTML = '';

    if (!hasAny) {
      emptyStateEl.classList.remove('hidden');
      noResultsStateEl.classList.add('hidden');
      return;
    }
    emptyStateEl.classList.add('hidden');

    if (filtered.length === 0) {
      noResultsStateEl.classList.remove('hidden');
      return;
    }
    noResultsStateEl.classList.add('hidden');

    const fragment = document.createDocumentFragment();
    filtered.forEach((url) => {
      const li = document.createElement('li');
      li.className = 'url-row';

      li.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <span class="url-text" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
        <div class="url-actions">
          <button data-action="open" class="btn btn-teal">Abrir</button>
          <button data-action="copy" class="btn btn-neutral">Copiar</button>
          <button data-action="delete" class="btn btn-danger">Eliminar</button>
        </div>
      `;

      li.querySelector('[data-action="open"]').addEventListener('click', () => openUrl(url));
      li.querySelector('[data-action="copy"]').addEventListener('click', async () => {
        const ok = await copyText(url);
        showToast(ok ? 'URL copiada.' : 'No se pudo copiar.', ok ? 'success' : 'error');
      });
      li.querySelector('[data-action="delete"]').addEventListener('click', () => removeUrl(url));

      fragment.appendChild(li);
    });
    urlListEl.appendChild(fragment);
  }

  // ---------- Inicialización ----------
  // Carga cualquier dato guardado previamente en este navegador y dibuja la interfaz.
  loadFromStorage();
  render();
})();
