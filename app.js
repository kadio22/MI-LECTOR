// ---------- Comprobación de entorno ----------
// Si la app se abre como archivo local (doble clic en index.html, url file://...)
// o en una pestaña de navegación privada muy restrictiva, IndexedDB puede no
// existir o fallar al abrirse. En ese caso guardar documentos es imposible
// y hay que avisarlo claramente en vez de fallar en silencio.
window.addEventListener("DOMContentLoaded", () => {
  if (location.protocol === "file:") {
    showStatus("Abre la app desde https:// o localhost, no como archivo local (file://): así no se puede guardar nada.", 6000);
  } else if (!("indexedDB" in window)) {
    showStatus("Este navegador no soporta almacenamiento local (IndexedDB). Prueba con Chrome o Safari actualizados.", 6000);
  }
});

// ---------- Configuración ----------
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const DB_NAME = "archivo-db";
const DB_VERSION = 2;
const STORE_DOCS = "documentos";
const STORE_FOLDERS = "carpetas";

let currentFilter = "all"; // "all" | "unfiled" | id de carpeta

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAllDocs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_DOCS, "readonly").objectStore(STORE_DOCS).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.addedAt - a.addedAt));
    req.onerror = () => reject(req.error);
  });
}

async function dbPutDoc(doc) {
  const db = await openDB();
  const tx = db.transaction(STORE_DOCS, "readwrite");
  tx.objectStore(STORE_DOCS).put(doc);
  return txDone(tx);
}

async function dbDeleteDoc(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_DOCS, "readwrite");
  tx.objectStore(STORE_DOCS).delete(id);
  return txDone(tx);
}

async function dbAllFolders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FOLDERS, "readonly").objectStore(STORE_FOLDERS).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function dbPutFolder(folder) {
  const db = await openDB();
  const tx = db.transaction(STORE_FOLDERS, "readwrite");
  tx.objectStore(STORE_FOLDERS).put(folder);
  return txDone(tx);
}

async function dbDeleteFolder(id) {
  const db = await openDB();
  const tx = db.transaction([STORE_FOLDERS, STORE_DOCS], "readwrite");
  tx.objectStore(STORE_FOLDERS).delete(id);
  const docsStore = tx.objectStore(STORE_DOCS);
  const req = docsStore.getAll();
  req.onsuccess = () => {
    req.result.forEach((d) => {
      if (d.folderId === id) {
        d.folderId = null;
        docsStore.put(d);
      }
    });
  };
  return txDone(tx);
}

// ---------- Utilidades ----------
function showStatus(msg, ms = 2200) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => el.classList.remove("show"), ms);
}

function extOf(name) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function kindOf(ext) {
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "epub") return "epub";
  return "txt";
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Modal genérico ----------
const modalOverlay = document.getElementById("modalOverlay");
const modalBox = document.getElementById("modalBox");

function openModal(html) {
  modalBox.innerHTML = html;
  modalOverlay.classList.add("open");
}
function closeModal() {
  modalOverlay.classList.remove("open");
  modalBox.innerHTML = "";
}
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function promptNewFolder() {
  openModal(`
    <h3>Nueva carpeta</h3>
    <input type="text" id="folderNameInput" placeholder="Ej. Bioquímica, Trading, Protocolos…" autofocus>
    <div class="modal-actions">
      <button id="cancelFolder">Cancelar</button>
      <button class="primary" id="saveFolder">Crear</button>
    </div>
  `);
  const input = document.getElementById("folderNameInput");
  document.getElementById("cancelFolder").addEventListener("click", closeModal);
  document.getElementById("saveFolder").addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const folder = { id: `f-${Date.now()}`, name, createdAt: Date.now() };
    await dbPutFolder(folder);
    currentFilter = folder.id;
    closeModal();
    await renderFolderBar();
    await renderShelf();
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("saveFolder").click(); });
  setTimeout(() => input.focus(), 50);
}

async function promptMoveDoc(docId) {
  const [folders, docs] = await Promise.all([dbAllFolders(), dbAllDocs()]);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return;

  const items = [
    { id: null, name: "Sin carpeta" },
    ...folders
  ];

  openModal(`
    <h3>Mover “${escapeHtml(doc.name)}”</h3>
    <div class="move-list">
      ${items.map((it) => `
        <div class="move-item ${doc.folderId === it.id ? "current" : ""}" data-folder="${it.id === null ? "" : it.id}">
          ${escapeHtml(it.name)}
        </div>`).join("")}
    </div>
    <div class="modal-actions">
      <button id="cancelMove">Cancelar</button>
    </div>
  `);
  document.getElementById("cancelMove").addEventListener("click", closeModal);
  modalBox.querySelectorAll(".move-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const folderId = el.dataset.folder || null;
      doc.folderId = folderId;
      await dbPutDoc(doc);
      closeModal();
      await renderShelf();
    });
  });
}

// ---------- Añadir documentos ----------
const fileInput = document.getElementById("fileInput");

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const targetFolder = (currentFilter === "all" || currentFilter === "unfiled") ? null : currentFilter;

  let okCount = 0;
  for (const file of files) {
    const ext = extOf(file.name);
    const kind = kindOf(ext);
    try {
      const buffer = await fileToArrayBuffer(file);
      const doc = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        kind,
        size: file.size,
        addedAt: Date.now(),
        folderId: targetFolder,
        data: buffer
      };
      await dbPutDoc(doc);
      okCount++;
    } catch (err) {
      console.error(err);
      showStatus(`No se pudo guardar "${file.name}"`);
    }
  }
  fileInput.value = "";
  if (okCount > 0) showStatus(okCount === 1 ? "Documento añadido" : `${okCount} documentos añadidos`);
  await renderShelf();
});

// ---------- Barra de carpetas ----------
async function renderFolderBar() {
  const bar = document.getElementById("folderBar");
  const folders = await dbAllFolders();

  const chips = [
    `<div class="chip ${currentFilter === "all" ? "active" : ""}" data-filter="all">Todas</div>`,
    ...folders.map(
      (f) => `<div class="chip ${currentFilter === f.id ? "active" : ""}" data-filter="${f.id}">
                ${escapeHtml(f.name)}
                <span class="chip-x" data-delete-folder="${f.id}">✕</span>
              </div>`
    ),
    `<div class="chip ${currentFilter === "unfiled" ? "active" : ""}" data-filter="unfiled">Sin carpeta</div>`,
    `<div class="chip new" data-action="newFolder">+ Carpeta</div>`
  ];

  bar.innerHTML = chips.join("");

  bar.querySelectorAll(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", async (ev) => {
      if (ev.target.closest("[data-delete-folder]")) return;
      currentFilter = chip.dataset.filter;
      await renderFolderBar();
      await renderShelf();
    });
  });

  bar.querySelectorAll("[data-delete-folder]").forEach((x) => {
    x.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = x.dataset.deleteFolder;
      if (confirm("¿Eliminar esta carpeta? Los documentos pasarán a “Sin carpeta”.")) {
        if (currentFilter === id) currentFilter = "all";
        await dbDeleteFolder(id);
        await renderFolderBar();
        await renderShelf();
      }
    });
  });

  const newBtn = bar.querySelector('[data-action="newFolder"]');
  if (newBtn) newBtn.addEventListener("click", promptNewFolder);
}

// ---------- Renderizado del estante ----------
async function renderShelf() {
  const shelf = document.getElementById("shelf");
  const empty = document.getElementById("empty");
  let docs = await dbAllDocs();

  if (currentFilter === "unfiled") docs = docs.filter((d) => !d.folderId);
  else if (currentFilter !== "all") docs = docs.filter((d) => d.folderId === currentFilter);

  if (docs.length === 0) {
    empty.style.display = "block";
    shelf.innerHTML = "";
    return;
  }
  empty.style.display = "none";

  shelf.innerHTML = docs
    .map(
      (d) => `
      <div class="book" data-id="${d.id}">
        <div class="spine ${d.kind}"><span>${d.kind}</span></div>
        <div class="book-info">
          <div class="book-title">${escapeHtml(d.name)}</div>
          <div class="book-meta">${fmtSize(d.size)} · ${new Date(d.addedAt).toLocaleDateString()}</div>
        </div>
        <div class="book-actions">
          <button data-action="move" title="Mover a carpeta">📁</button>
          <button class="del" data-action="delete" title="Eliminar">✕</button>
        </div>
      </div>`
    )
    .join("");

  shelf.querySelectorAll(".book").forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-action]")) return;
      openDocument(id);
    });
    el.querySelector("[data-action='delete']").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (confirm("¿Eliminar este documento del estante?")) {
        await dbDeleteDoc(id);
        renderShelf();
      }
    });
    el.querySelector("[data-action='move']").addEventListener("click", (ev) => {
      ev.stopPropagation();
      promptMoveDoc(id);
    });
  });
}

// ---------- Visor ----------
const viewer = document.getElementById("viewer");
const viewerBody = document.getElementById("viewerBody");
const viewerTitle = document.getElementById("viewerTitle");

document.getElementById("closeViewer").addEventListener("click", closeViewer);

function closeViewer() {
  viewer.classList.remove("open");
  viewerBody.innerHTML = "";
}

async function openDocument(id) {
  const docs = await dbAllDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;

  viewerTitle.textContent = doc.name;
  viewerBody.innerHTML = '<p style="padding:20px;color:#9DAE9F;">Cargando…</p>';
  viewer.classList.add("open");

  try {
    if (doc.kind === "pdf") await renderPdf(doc);
    else if (doc.kind === "docx") await renderDocx(doc);
    else if (doc.kind === "epub") await renderEpub(doc);
    else await renderTxt(doc);
  } catch (err) {
    console.error(err);
    viewerBody.innerHTML = `<p style="padding:20px;color:#B5533C;">No se pudo abrir el documento: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

// ----- PDF -----
async function renderPdf(doc) {
  viewerBody.innerHTML = '<div id="pdfPages"></div>';
  const container = document.getElementById("pdfPages");
  const loadingTask = pdfjsLib.getDocument({ data: doc.data.slice(0) });
  const pdf = await loadingTask.promise;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: Math.min(1.6, (window.innerWidth - 20) / page.getViewport({ scale: 1 }).width) });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
}

// ----- DOCX -----
async function renderDocx(doc) {
  const result = await mammoth.convertToHtml({ arrayBuffer: doc.data.slice(0) });
  viewerBody.innerHTML = `<div id="htmlDoc">${result.value}</div>`;
}

// ----- TXT -----
async function renderTxt(doc) {
  const text = new TextDecoder("utf-8").decode(doc.data);
  viewerBody.innerHTML = `<div id="htmlDoc"><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(text)}</pre></div>`;
}

// ----- EPUB -----
async function renderEpub(doc) {
  const zip = await JSZip.loadAsync(doc.data.slice(0));

  const containerXml = await zip.file("META-INF/container.xml").async("string");
  const containerDom = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = containerDom.querySelector("rootfile").getAttribute("full-path");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfXml = await zip.file(opfPath).async("string");
  const opfDom = new DOMParser().parseFromString(opfXml, "application/xml");

  const manifest = {};
  opfDom.querySelectorAll("manifest > item").forEach((item) => {
    manifest[item.getAttribute("id")] = item.getAttribute("href");
  });

  const spineIds = Array.from(opfDom.querySelectorAll("spine > itemref")).map((i) => i.getAttribute("idref"));
  const chapters = spineIds.map((id) => opfDir + manifest[id]).filter(Boolean);

  if (chapters.length === 0) throw new Error("No se encontró contenido legible en el ePub");

  let current = 0;

  async function loadChapter(i) {
    const path = chapters[i];
    let html = await zip.file(path).async("string");
    const dom = new DOMParser().parseFromString(html, "text/html");
    dom.querySelectorAll("script").forEach((s) => s.remove());
    const bodyHtml = dom.body ? dom.body.innerHTML : html;

    viewerBody.innerHTML = `
      <div id="htmlDoc">${bodyHtml}</div>
      <div class="epub-nav">
        <button id="prevCh" ${i === 0 ? "disabled" : ""}>← Anterior</button>
        <span style="color:#9DAE9F;font-size:12px;align-self:center;">Capítulo ${i + 1} / ${chapters.length}</span>
        <button id="nextCh" ${i === chapters.length - 1 ? "disabled" : ""}>Siguiente →</button>
      </div>`;
    viewerBody.scrollTop = 0;

    const prevBtn = document.getElementById("prevCh");
    const nextBtn = document.getElementById("nextCh");
    if (prevBtn) prevBtn.addEventListener("click", () => { current--; loadChapter(current); });
    if (nextBtn) nextBtn.addEventListener("click", () => { current++; loadChapter(current); });
  }

  await loadChapter(current);
}

// ---------- Registro del service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW no registrado:", err));
  });
}

// ---------- Inicio ----------
(async function init() {
  await renderFolderBar();
  await renderShelf();
})();
