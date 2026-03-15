// ==UserScript==
// @name         RBFCU Genesys Secure Document Upload
// @namespace    https://rbfcu.org/
// @version      1.1.0
// @description  Injects secure document upload modal + FAB into any page running the Genesys Web Messenger widget
// @author       DarthBeavis
// @match        *://*/*
// @exclude      *://apps.mypurecloud.com/*
// @exclude      *://*.mypurecloud.com/*
// @exclude      *://apps.usw2.pure.cloud/*
// @exclude      *://*.pure.cloud/*
// @exclude      *://login.mypurecloud.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

/*
  ═══════════════════════════════════════════════════════════════════
  HOW THIS WORKS
  ═══════════════════════════════════════════════════════════════════
  TamperMonkey injects this script into every page you visit.
  It waits until the Genesys SDK (window.Genesys) is available,
  then injects the secure upload UI (CSS + HTML + JS) into the page.

  The UI only activates when the agent sends a message containing
  the trigger phrase ("please upload"). At that point:
    1. A floating button pulses above the Genesys chat bubble
    2. A toast slides in from the top
    3. After 2.5s the upload modal auto-opens

  ═══════════════════════════════════════════════════════════════════
  CONFIGURATION — edit these values
  ═══════════════════════════════════════════════════════════════════
*/

/*
  ═══════════════════════════════════════════════════════════════════
  GENESYS WIDGET SNIPPET — loads the widget on any page
  ═══════════════════════════════════════════════════════════════════
*/
(function injectGenesysSnippet() {
  if (typeof Genesys === 'function') return; // already on page, skip
  (function (g, e, n, es, ys) {
    g['_genesysJs'] = e;
    g[e] = g[e] || function () { (g[e].q = g[e].q || []).push(arguments); };
    g[e].t = 1 * new Date();
    g[e].c = es;
    ys = document.createElement('script');
    ys.async = 1;
    ys.src = n;
    ys.charset = 'utf-8';
    document.head.appendChild(ys);
  })(window, 'Genesys', 'https://apps.mypurecloud.com/genesys-bootstrap/genesys.min.js', {
    environment: 'prod',
    deploymentId: 'e5622e85-6c23-4837-af46-3964ceec58d1'
  });
})();

const CONFIG = {
  // Trigger phrase — agent sends e.g. "please upload LOANS 4587902"
  // identifierType and identifier are parsed from the same message
  TRIGGER_PHRASE:    'please upload',

  // Delay (ms) before modal auto-opens after trigger detected
  AUTO_OPEN_DELAY:   2500,

  // Customer document upload API
  UPLOAD_ENDPOINT:   'https://api.dev.rbfcu.org/genesys-chat/upload/document',
  UPLOAD_USERNAME:   'genesysapiuser',
  UPLOAD_PASSWORD:   'REPLACE_WITH_PASSWORD', // ← swap in when received

  // Max file size
  MAX_BYTES:         10 * 1024 * 1024, // 10 MB

  // Allowed MIME types
  ALLOWED_MIME: new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg',
    'text/plain', 'text/csv'
  ])
};

/*
  ═══════════════════════════════════════════════════════════════════
  INJECT CSS
  ═══════════════════════════════════════════════════════════════════
*/
function injectCSS() {
  const style = document.createElement('style');
  style.id = 'gcsu-styles';
  style.textContent = `
    /* Disable native Genesys attach button */
    .gcui-attach-button,
    [class*="attachButton"],
    [data-cy="attach-button"],
    button[aria-label*="ttach"] { display: none !important; }

    /* Tokens — scoped to our elements only */
    #gcsu-toast, #gcsu-fab, #gcsu-modal {
      --accent:    #4361ee;
      --accent-h:  #3251d4;
      --success:   #0da472;
      --danger:    #e02424;
      --warning:   #d97706;
      --white:     #ffffff;
      --bg:        #f4f6fb;
      --border:    #e1e6ef;
      --text:      #1a1f36;
      --muted:     #8492a6;
      --shadow-lg: 0 8px 40px rgba(0,0,0,.14);
      --r:         12px;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    }
    #gcsu-toast *, #gcsu-fab *, #gcsu-modal * {
      box-sizing: border-box;
    }

    /* ── TOAST ─────────────────────────────────────────────────── */
    #gcsu-toast {
      position: fixed;
      top: -80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--accent);
      color: #fff;
      padding: 14px 22px;
      border-radius: var(--r);
      font-size: .88rem;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 12px;
      white-space: nowrap;
      transition: top .35s cubic-bezier(.16,1,.3,1);
      cursor: pointer;
    }
    #gcsu-toast.show { top: 20px; }
    #gcsu-toast-close {
      opacity: .7; font-size: 1rem; cursor: pointer; padding: 0 4px;
    }
    #gcsu-toast-close:hover { opacity: 1; }

    /* ── FLOATING ACTION BUTTON ─────────────────────────────────── */
    #gcsu-fab {
      position: fixed;
      bottom: 90px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 13px 20px 13px 16px;
      font-size: .88rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(67,97,238,.45);
      z-index: 2147483647;
      white-space: nowrap;
      opacity: 0;
      transform: translateY(20px) scale(.9);
      pointer-events: none;
      transition: opacity .3s cubic-bezier(.16,1,.3,1),
                  transform .3s cubic-bezier(.16,1,.3,1);
    }
    #gcsu-fab.show {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
      animation: gcsu-pulse 2s ease-in-out 0.4s 3;
    }
    @keyframes gcsu-pulse {
      0%,100% { box-shadow: 0 4px 24px rgba(67,97,238,.45); }
      50%      { box-shadow: 0 4px 40px rgba(67,97,238,.8), 0 0 0 8px rgba(67,97,238,.15); }
    }
    #gcsu-fab .gcsu-fab-ico {
      width: 28px; height: 28px;
      background: rgba(255,255,255,.2);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: .9rem; flex-shrink: 0;
    }
    #gcsu-fab:hover { background: var(--accent-h); }

    /* ── MODAL OVERLAY ──────────────────────────────────────────── */
    #gcsu-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15,20,40,.5);
      backdrop-filter: blur(4px);
      z-index: 2147483645;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    #gcsu-modal.open { display: flex; animation: gcsu-ov-in .2s ease; }
    @keyframes gcsu-ov-in { from { opacity:0; } to { opacity:1; } }

    /* ── MODAL PANEL ────────────────────────────────────────────── */
    .gcsu-panel {
      background: var(--white);
      border-radius: 18px;
      box-shadow: var(--shadow-lg);
      width: 100%; max-width: 460px;
      animation: gcsu-panel-up .25s cubic-bezier(.16,1,.3,1);
      overflow: hidden;
    }
    @keyframes gcsu-panel-up {
      from { opacity:0; transform: translateY(22px) scale(.98); }
      to   { opacity:1; transform: none; }
    }
    .gcsu-head {
      padding: 20px 22px 0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .gcsu-head h2 {
      font-size: 1rem; font-weight: 700; margin: 0;
      display: flex; align-items: center; gap: 8px; color: var(--text);
    }
    .gcsu-lock {
      width: 28px; height: 28px; border-radius: 7px;
      background: #eef0ff;
      display: flex; align-items: center; justify-content: center;
      font-size: .85rem;
    }
    .gcsu-close {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1px solid var(--border);
      background: transparent; color: var(--muted);
      font-size: .9rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .gcsu-close:hover { background: var(--bg); }
    .gcsu-body { padding: 18px 22px 24px; }

    /* ── STEP TRACK ─────────────────────────────────────────────── */
    .gcsu-steps {
      display: flex; align-items: center; margin-bottom: 22px;
    }
    .gcsu-st {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
    }
    .gcsu-dot {
      width: 26px; height: 26px; border-radius: 50%;
      border: 2px solid var(--border); background: var(--white);
      display: flex; align-items: center; justify-content: center;
      font-size: .72rem; font-weight: 700; color: var(--muted);
      transition: all .25s;
    }
    .gcsu-st.active .gcsu-dot { border-color: var(--accent); color: var(--accent); }
    .gcsu-st.done   .gcsu-dot { border-color: var(--success); background: var(--success); color: #fff; }
    .gcsu-st.err    .gcsu-dot { border-color: var(--danger);  background: var(--danger);  color: #fff; }
    .gcsu-lbl {
      font-size: .65rem; font-weight: 600; color: var(--muted);
      letter-spacing: .03em; text-transform: uppercase;
    }
    .gcsu-st.active .gcsu-lbl { color: var(--accent); }
    .gcsu-st.done   .gcsu-lbl { color: var(--success); }
    .gcsu-st.err    .gcsu-lbl { color: var(--danger); }
    .gcsu-line {
      flex: 1; height: 2px; background: var(--border);
      margin: 0 4px 16px; transition: background .25s;
    }
    .gcsu-line.done { background: var(--success); }

    /* ── DROP ZONE ──────────────────────────────────────────────── */
    #gcsu-drop {
      border: 2px dashed var(--border); border-radius: var(--r);
      padding: 36px 16px; text-align: center; cursor: pointer;
      transition: border-color .2s, background .2s;
      background: var(--bg);
    }
    #gcsu-drop:hover, #gcsu-drop.over {
      border-color: var(--accent); background: #eef0ff;
    }
    #gcsu-drop .gcsu-dz-ico { font-size: 2rem; display: block; margin-bottom: 10px; }
    #gcsu-drop h3 { font-size: .93rem; font-weight: 600; margin: 0 0 4px; color: var(--text); }
    #gcsu-drop p  { font-size: .76rem; color: var(--muted); margin: 0; }

    /* ── FILE CHIP ──────────────────────────────────────────────── */
    #gcsu-chip {
      display: none; align-items: center; gap: 10px;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r); padding: 12px 14px; margin-top: 10px;
    }
    #gcsu-chip.show { display: flex; }
    .gcsu-chip-ico {
      width: 36px; height: 36px; border-radius: 8px;
      background: #eef0ff;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; flex-shrink: 0;
    }
    .gcsu-chip-name {
      font-size: .84rem; font-weight: 600; flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: var(--text);
    }
    .gcsu-chip-size { font-size: .7rem; color: var(--muted); }
    .gcsu-chip-change {
      font-size: .74rem; color: var(--accent);
      cursor: pointer; text-decoration: none; flex-shrink: 0;
    }
    .gcsu-chip-change:hover { text-decoration: underline; }

    /* ── PROGRESS ───────────────────────────────────────────────── */
    #gcsu-prog { display: none; margin-top: 14px; }
    #gcsu-prog.show { display: block; }
    .gcsu-prog-row {
      display: flex; justify-content: space-between;
      font-size: .76rem; font-weight: 500; margin-bottom: 5px;
      color: var(--text);
    }
    .gcsu-prog-pct { color: var(--muted); }
    .gcsu-track {
      height: 5px; background: var(--border);
      border-radius: 3px; overflow: hidden;
    }
    .gcsu-fill {
      height: 100%; border-radius: 3px; background: var(--accent);
      transition: width .3s ease, background .3s;
    }
    .gcsu-fill.scan   { background: var(--warning); }
    .gcsu-fill.upload { background: var(--accent); }
    .gcsu-fill.ok     { background: var(--success); }
    .gcsu-fill.fail   { background: var(--danger); }

    /* ── STATUS PILL ────────────────────────────────────────────── */
    #gcsu-status {
      display: none; gap: 8px; padding: 10px 14px;
      border-radius: 8px; font-size: .81rem;
      line-height: 1.5; margin-top: 12px;
    }
    #gcsu-status.show    { display: flex; align-items: flex-start; }
    #gcsu-status.success { background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; }
    #gcsu-status.error   { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
    #gcsu-status.warning { background:#fffbeb; color:#92400e; border:1px solid #fde68a; }

    /* ── ACTION BUTTON ──────────────────────────────────────────── */
    #gcsu-action {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; width: 100%; padding: 13px 20px; margin-top: 14px;
      background: var(--accent); color: #fff; border: none;
      border-radius: var(--r); font-size: .9rem; font-weight: 600;
      cursor: pointer; transition: background .15s, transform .1s;
    }
    #gcsu-action:disabled { opacity: .4; cursor: not-allowed; }
    #gcsu-action:not(:disabled):hover  { background: var(--accent-h); }
    #gcsu-action:not(:disabled):active { transform: scale(.98); }
    #gcsu-action.sent { background: var(--success); }

    .gcsu-footer {
      font-size: .71rem; color: var(--muted);
      display: flex; align-items: flex-start;
      gap: 6px; margin-top: 12px; line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

/*
  ═══════════════════════════════════════════════════════════════════
  INJECT HTML
  ═══════════════════════════════════════════════════════════════════
*/
function injectHTML() {
  const wrap = document.createElement('div');
  wrap.id = 'gcsu-root';
  wrap.innerHTML = `
    <!-- TOAST -->
    <div id="gcsu-toast" role="alert" aria-live="polite">
      <span>📎</span>
      <span id="gcsu-toast-msg">Your agent is requesting a document — click to upload</span>
      <span id="gcsu-toast-close" aria-label="Dismiss">✕</span>
    </div>

    <!-- FLOATING ACTION BUTTON -->
    <button id="gcsu-fab" aria-haspopup="dialog" aria-label="Upload secure document">
      <span class="gcsu-fab-ico">📎</span>
      Upload Secure Document
    </button>

    <!-- MODAL -->
    <div id="gcsu-modal" role="dialog" aria-modal="true" aria-labelledby="gcsu-modal-title">
      <div class="gcsu-panel">
        <div class="gcsu-head">
          <h2 id="gcsu-modal-title">
            <span class="gcsu-lock">🔒</span>
            Secure Document Upload
          </h2>
          <button class="gcsu-close" id="gcsu-close" aria-label="Close">✕</button>
        </div>
        <div class="gcsu-body">

          <!-- STEPS -->
          <div class="gcsu-steps">
            <div class="gcsu-st active" id="gcsu-st1">
              <div class="gcsu-dot">1</div>
              <div class="gcsu-lbl">Select</div>
            </div>
            <div class="gcsu-line" id="gcsu-ln1"></div>
            <div class="gcsu-st" id="gcsu-st2">
              <div class="gcsu-dot">2</div>
              <div class="gcsu-lbl">Upload</div>
            </div>
          </div>

          <!-- DROP ZONE -->
          <div id="gcsu-drop" role="button" tabindex="0"
               aria-label="Click or drop a file to select">
            <span class="gcsu-dz-ico">📂</span>
            <h3>Drop your file here or click to browse</h3>
            <p>PDF · DOCX · PNG · JPG · TXT &nbsp;·&nbsp; Max 10 MB</p>
          </div>
          <input type="file" id="gcsu-file-input"
                 accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.csv"
                 style="display:none" />

          <!-- FILE CHIP -->
          <div id="gcsu-chip">
            <div class="gcsu-chip-ico" id="gcsu-chip-ico">📄</div>
            <div style="flex:1;min-width:0">
              <div class="gcsu-chip-name" id="gcsu-chip-name"></div>
              <div class="gcsu-chip-size" id="gcsu-chip-size"></div>
            </div>
            <span class="gcsu-chip-change" id="gcsu-chip-change" tabindex="0">Change</span>
          </div>

          <!-- PROGRESS -->
          <div id="gcsu-prog">
            <div class="gcsu-prog-row">
              <span id="gcsu-prog-label">Scanning…</span>
              <span class="gcsu-prog-pct" id="gcsu-prog-pct">0%</span>
            </div>
            <div class="gcsu-track">
              <div class="gcsu-fill" id="gcsu-fill" style="width:0%"></div>
            </div>
          </div>

          <!-- STATUS -->
          <div id="gcsu-status">
            <span id="gcsu-status-ico"></span>
            <span id="gcsu-status-txt"></span>
          </div>

          <!-- ACTION -->
          <button id="gcsu-action" disabled>
            <span id="gcsu-btn-ico">🔒</span>
            <span id="gcsu-btn-lbl">Send to Agent</span>
          </button>

          <div class="gcsu-footer">
            <span>ℹ️</span>
            Files are securely delivered to your agent via encrypted upload.
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
}

/*
  ═══════════════════════════════════════════════════════════════════
  MAIN LOGIC
  ═══════════════════════════════════════════════════════════════════
*/
function initUpload() {
  // DOM refs
  const toast       = document.getElementById('gcsu-toast');
  const toastMsg    = document.getElementById('gcsu-toast-msg');
  const toastClose  = document.getElementById('gcsu-toast-close');
  const fab         = document.getElementById('gcsu-fab');
  const modal       = document.getElementById('gcsu-modal');
  const closeBtn    = document.getElementById('gcsu-close');
  const drop        = document.getElementById('gcsu-drop');
  const fileInput   = document.getElementById('gcsu-file-input');
  const chip        = document.getElementById('gcsu-chip');
  const chipIco     = document.getElementById('gcsu-chip-ico');
  const chipName    = document.getElementById('gcsu-chip-name');
  const chipSize    = document.getElementById('gcsu-chip-size');
  const chipChange  = document.getElementById('gcsu-chip-change');
  const prog        = document.getElementById('gcsu-prog');
  const progLabel   = document.getElementById('gcsu-prog-label');
  const progPct     = document.getElementById('gcsu-prog-pct');
  const fill        = document.getElementById('gcsu-fill');
  const status      = document.getElementById('gcsu-status');
  const statusIco   = document.getElementById('gcsu-status-ico');
  const statusTxt   = document.getElementById('gcsu-status-txt');
  const actionBtn   = document.getElementById('gcsu-action');
  const btnIco      = document.getElementById('gcsu-btn-ico');
  const btnLbl      = document.getElementById('gcsu-btn-lbl');
  const st1 = document.getElementById('gcsu-st1');
  const st2 = document.getElementById('gcsu-st2');
  const ln1 = document.getElementById('gcsu-ln1');

  // State
  let selectedFile          = null;
  let uploading             = false;
  let toastTimer            = null;
  let autoOpenTimer         = null;
  let parsedIdentifierType  = null;  // parsed from trigger message
  let parsedIdentifier      = null;  // parsed from trigger message

  // Helpers
  const fmt = b => b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB';
  const mimeIco = m => m==='application/pdf'?'📄':m.startsWith('image/')?'🖼️':m.includes('word')?'📝':'📎';

  function setSteps(active, errAt) {
    [[st1,1],[st2,2]].forEach(([el,n]) => {
      el.className = 'gcsu-st' + (n===errAt?' err':n<active?' done':n===active?' active':'');
    });
    ln1.className = 'gcsu-line' + (active>1&&!errAt?' done':'');
  }
  function setProgress(label, pct, cls) {
    prog.classList.add('show');
    progLabel.textContent = label;
    progPct.textContent   = pct+'%';
    fill.style.width      = pct+'%';
    fill.className        = 'gcsu-fill '+(cls||'');
  }
  function hideProgress() { prog.classList.remove('show'); }
  function showStatus(text, type) {
    const icons = {success:'✅',error:'❌',warning:'⚠️'};
    status.className    = 'show '+type;
    statusIco.textContent = icons[type]||'';
    statusTxt.textContent = text;
  }
  function hideStatus() { status.className = ''; }

  // Toast + FAB
  function showToast() {
    clearTimeout(toastTimer);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 12000);
  }
  function hideToast() { clearTimeout(toastTimer); toast.classList.remove('show'); }
  function showFab()   { fab.classList.add('show'); }
  function hideFab()   { fab.classList.remove('show'); }

  toast.addEventListener('click', e => {
    if (e.target === toastClose) { hideToast(); return; }
    hideToast(); hideFab(); clearTimeout(autoOpenTimer); openModal();
  });
  fab.addEventListener('click', () => {
    hideFab(); hideToast(); clearTimeout(autoOpenTimer); openModal();
  });

  // Modal
  function openModal() {
    if (modal.classList.contains('open')) return;
    hideFab();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    resetModal();
  }
  function closeModal() {
    if (uploading) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
  function resetModal() {
    selectedFile = null; uploading = false;
    drop.style.display = '';
    chip.classList.remove('show');
    hideProgress(); hideStatus();
    actionBtn.className = '';
    actionBtn.disabled  = true;
    btnIco.textContent  = '🔒';
    btnLbl.textContent  = 'Send to Agent';
    setSteps(1);
  }

  // Expose globally so TamperMonkey menu / console can trigger it
  window.openSecureUpload = openModal;

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

  // File selection
  function handleFile(file) {
    if (!file) return;
    hideStatus();
    if (!CONFIG.ALLOWED_MIME.has(file.type)) {
      showStatus(`Unsupported type: ${file.type||'unknown'}. Use PDF, DOCX, PNG, JPG, or TXT.`, 'error');
      return;
    }
    if (file.size > CONFIG.MAX_BYTES) {
      showStatus(`File too large: ${fmt(file.size)}. Max is ${fmt(CONFIG.MAX_BYTES)}.`, 'error');
      return;
    }
    selectedFile = file;
    drop.style.display   = 'none';
    chipIco.textContent  = mimeIco(file.type);
    chipName.textContent = file.name;
    chipSize.textContent = fmt(file.size);
    chip.classList.add('show');
    actionBtn.disabled   = false;
    setSteps(1);
  }

  drop.addEventListener('click',    () => fileInput.click());
  drop.addEventListener('keydown',  e  => { if(e.key==='Enter'||e.key===' ') fileInput.click(); });
  drop.addEventListener('dragover', e  => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave',() => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
  chipChange.addEventListener('click', resetModal);

  // Customer document upload API
  async function uploadToCustomerAPI(file) {
    setSteps(2); setProgress('Uploading document…', 10, 'upload');

    if (!parsedIdentifierType || !parsedIdentifier) {
      throw new Error('Missing identifierType or identifier — check trigger message format (e.g. "please upload LOANS 4587902")');
    }

    const form = new FormData();
    form.append('identifierType', parsedIdentifierType);
    form.append('identifier',     parsedIdentifier);
    form.append('files',          file, file.name);

    const basicAuth = btoa(`${CONFIG.UPLOAD_USERNAME}:${CONFIG.UPLOAD_PASSWORD}`);

    let tick = 10;
    const ticker = setInterval(() => { tick = Math.min(tick + 8, 80); setProgress('Uploading…', tick, 'upload'); }, 300);

    try {
      const res = await fetch(CONFIG.UPLOAD_ENDPOINT, {
        method:  'POST',
        headers: { 'Authorization': 'Basic ' + basicAuth },
        body:    form
      });
      clearInterval(ticker);

      // Parse body regardless of HTTP status — error details live in the JSON
      let body;
      try { body = await res.json(); } catch(_) { throw new Error(`HTTP ${res.status} — non-JSON response`); }

      // HTTP-level auth failure (may not have a JSON body)
      if (res.status === 401) throw new Error('AUTHORIZATION_FAILURE');

      // Check application-level status
      if (body.status === 'SUCCESS') {
        setProgress('Upload complete', 100, 'ok');
        console.log('[GCSU] Upload success:', JSON.stringify(body));
        return body;
      }

      // Map API error codes to friendly messages
      const errorCode = body?.errors?.[0]?.code || 'UNKNOWN';
      const errorMsgs = {
        INVALID_FILE_TYPE:      'This file type is not supported.',
        INVALID_FILE_SIZE:      'The file is too large to upload.',
        AUTHORIZATION_FAILURE:  'Authorization failed — check API credentials.',
        UPLOAD_ERROR:           'The file may be corrupted or flagged as malicious.',
        INVALID_FILE:           'A general error occurred during upload.',
        TIMEOUT:                'The upload timed out — please try again.',
      };
      throw new Error(errorMsgs[errorCode] || `Upload failed: ${errorCode}`);

    } catch(err) {
      clearInterval(ticker);
      throw new Error(err.message);
    }
  }

  function notifyAgent(file) {
    try {
      Genesys('command', 'MessagingService.sendMessage',
        { message: `Document uploaded: ${file.name} (${fmt(file.size)})` },
        ()=>{}, e=>console.warn('[GCSU]',e)
      );
    } catch(_){}
  }

  // Main action
  actionBtn.addEventListener('click', async () => {
    if (!selectedFile || uploading) return;
    uploading = true;
    actionBtn.disabled = true;
    btnIco.textContent = '⏳';
    btnLbl.textContent = 'Uploading…';
    hideStatus();

    const file = selectedFile;
    try {
      await uploadToCustomerAPI(file);

      notifyAgent(file);

      st2.className = 'gcsu-st done';
      ln1.className = 'gcsu-line done';
      showStatus(`"${file.name}" uploaded successfully to your agent.`, 'success');
      actionBtn.className = 'sent';
      btnIco.textContent  = '✅';
      btnLbl.textContent  = 'Document Sent Successfully';
      setTimeout(closeModal, 4000);

    } catch(err) {
      hideProgress();
      showStatus(String(err.message || err), 'error');
      setSteps(1);
      actionBtn.disabled = false;
      btnIco.textContent = '🔒';
      btnLbl.textContent = 'Send to Agent';
      uploading = false;
    }
  });

  // ── TRIGGER DETECTION ──────────────────────────────────────────
  let subscribed = false;

  function checkMessageForTrigger(msg) {
    const text = (
      msg.text ||
      msg.body ||
      msg.message ||
      (msg.content?.[0]?.contentType === 'Text' && msg.content[0].text) ||
      (typeof msg.content === 'string' && msg.content) ||
      ''
    ).toLowerCase();

    console.log('[GCSU] Message received:', JSON.stringify(msg).substring(0, 200));

    if (text.includes(CONFIG.TRIGGER_PHRASE.toLowerCase())) {
      // Parse: "please upload LOANS 4587902"
      // Expected format after trigger phrase: <identifierType> <identifier>
      const VALID_TYPES = ['LOANS', 'ACCOUNTS', 'NEWMEMBER'];
      const after = text.slice(text.indexOf(CONFIG.TRIGGER_PHRASE.toLowerCase()) + CONFIG.TRIGGER_PHRASE.length).trim();
      const parts = after.split(/\s+/);
      const detectedType = parts[0] ? parts[0].toUpperCase() : null;
      const detectedId   = parts[1] || null;

      if (detectedType && VALID_TYPES.includes(detectedType) && detectedId) {
        parsedIdentifierType = detectedType;
        parsedIdentifier     = detectedId;
        console.log(`[GCSU] Parsed identifierType=${parsedIdentifierType}, identifier=${parsedIdentifier}`);
      } else {
        parsedIdentifierType = null;
        parsedIdentifier     = null;
        console.warn('[GCSU] Trigger phrase found but could not parse identifierType/identifier. Raw after phrase:', after);
      }

      console.log('[GCSU] Trigger phrase matched - opening upload UI');
      showToast();
      showFab();
      clearTimeout(autoOpenTimer);
      autoOpenTimer = setTimeout(() => {
        hideToast(); hideFab(); openModal();
      }, CONFIG.AUTO_OPEN_DELAY);
      return true;
    }
    return false;
  }

  function watchForTrigger() {
    if (subscribed) return;
    subscribed = true;
    console.log('[GCSU] Subscribing to message events');

    // Primary event name
    Genesys('subscribe', 'MessagingService.messagesReceived', e => {
      console.log('[GCSU] messagesReceived fired. Raw:', JSON.stringify(e).substring(0, 300));
      // Actual payload shape: e.data.messages = [{text, type, direction, ...}]
      const messages =
        Array.isArray(e?.data?.messages) ? e.data.messages :  // ← real shape
        Array.isArray(e?.data)           ? e.data           :
        Array.isArray(e?.messages)       ? e.messages       :
        (e?.data ? [e.data] : []);
      for (const msg of messages) {
        if (checkMessageForTrigger(msg)) break;
      }
    });

    // Alternate singular event name used in some SDK versions
    try {
      Genesys('subscribe', 'MessagingService.messageReceived', e => {
        console.log('[GCSU] messageReceived (singular) fired:', JSON.stringify(e).substring(0, 200));
        const msg = e?.data || e?.message || e || {};
        checkMessageForTrigger(msg);
      });
    } catch(_) {}

    // DOM MutationObserver fallback — watches the chat bubble transcript
    const chatObserver = new MutationObserver(() => {
      document.querySelectorAll('[class*="genesys"] [class*="message"], [class*="gcui"] [class*="message"]')
        .forEach(el => {
          if (el.dataset.gcsuChecked) return;
          el.dataset.gcsuChecked = '1';
          if (el.textContent.toLowerCase().includes(CONFIG.TRIGGER_PHRASE.toLowerCase())) {
            console.log('[GCSU] Trigger phrase found via DOM observer');
            checkMessageForTrigger({ text: el.textContent });
          }
        });
    });
    chatObserver.observe(document.body, { childList: true, subtree: true });
    console.log('[GCSU] DOM observer active as fallback. Listening for: "' + CONFIG.TRIGGER_PHRASE + '"');
  }

  // ── SDK INIT — try every ready event, also fallback after 2s ───
  const sdkPoll = setInterval(() => {
    if (typeof Genesys !== 'function') return;
    clearInterval(sdkPoll);
    console.log('[GCSU] Genesys SDK found');

    ['Messenger.ready', 'MessagingService.ready', 'Messenger.opened', 'WebMessenger.ready'].forEach(evt => {
      try { Genesys('subscribe', evt, () => { console.log('[GCSU] Event:', evt); watchForTrigger(); }); } catch(_) {}
    });

    // Fallback: subscribe immediately in case SDK already initialized before our script ran
    setTimeout(watchForTrigger, 2000);
  }, 300);
}


/*
  ═══════════════════════════════════════════════════════════════════
  BOOTSTRAP — wait for DOM then inject
  ═══════════════════════════════════════════════════════════════════
*/
(function bootstrap() {
  // Don't inject twice
  if (document.getElementById('gcsu-root')) return;

  if (document.body) {
    injectCSS();
    injectHTML();
    initUpload();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      injectCSS();
      injectHTML();
      initUpload();
    });
  }
})();
