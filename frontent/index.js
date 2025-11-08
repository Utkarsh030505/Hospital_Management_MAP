
const $ = (sel) => document.querySelector(sel);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const PALETTE = ['#7cdeff', '#a3ffb6', '#ffd17c', '#ff9db6', '#d6a3ff', '#9ee8b4', '#f6a06c', '#9ad0ff', '#b0f7ff', '#ffb5a3', '#c2a3ff', '#cfff7c', '#c0ffd9', '#ffc27c', '#ffa8f0', '#a8ffd5'];

const BuiltInEnvs = {
    'demo-grid': async () => genDemoGrid(1600, 900),
    'warehouse': async () => genWarehouse(1600, 900)
};

function genDemoGrid(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#0a0f1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d2740';
    for (let i = 0; i < 10; i++) { const x = Math.random() * w * .8, y = Math.random() * h * .8; const bw = 80 + Math.random() * 140, bh = 40 + Math.random() * 120; g.fillRect(x, y, bw, bh); }
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; const step = 40; g.beginPath();
    for (let x = 0; x < w; x += step) { g.moveTo(x, 0); g.lineTo(x, h); }
    for (let y = 0; y < h; y += step) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    return createImageBitmap(c);
}
function genWarehouse(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#0b1326'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#29365a';
    const rows = 6, margin = 60, shelfH = 24, gap = (h - margin * 2 - rows * shelfH) / (rows - 1);
    for (let r = 0; r < rows; r++) { const y = margin + r * (shelfH + gap); for (let col = 0; col < 8; col++) { const x = 80 + col * 160; const w2 = 120; g.fillRect(x, y, w2, shelfH); } }
    g.strokeStyle = 'rgba(124, 222, 255, .35)'; g.setLineDash([6, 10]); g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < 4; i++) { const x = 160 + i * 320; g.moveTo(x, 40); g.lineTo(x, h - 40); }
    g.stroke(); g.setLineDash([]);
    return createImageBitmap(c);
}

async function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { createImageBitmap(img).then(b => { URL.revokeObjectURL(url); resolve(b); }); };
        img.onerror = reject; img.src = url;
    });
}

const state = {
    envBitmap: null,
    envName: 'demo-grid',
    agents: [],
    agentCount: 5,
    zoom: 1,
    panX: 0,
    panY: 0,
    showGrid: true,
    showIds: true,
    tick: 0,
    ws: null
};

const canvas = $('#stage');
const ctx = canvas.getContext('2d');

function worldToScreen(x, y) { return [x * state.zoom + state.panX, y * state.zoom + state.panY]; }

function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b0f1d'; ctx.fillRect(0, 0, W, H);

    // environment: fixed position (centered). No panning.
    if (state.envBitmap) {
        const scale = Math.min(W / state.envBitmap.width, H / state.envBitmap.height) * state.zoom;
        const iw = state.envBitmap.width * scale, ih = state.envBitmap.height * scale;
        const ox = (W - iw) / 2; const oy = (H - ih) / 2;
        ctx.drawImage(state.envBitmap, ox, oy, iw, ih);
    }

    if (state.showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
        const step = 40 * state.zoom;
        const startX = (W % step) / 2; // center-ish
        const startY = (H % step) / 2;
        ctx.beginPath();
        for (let x = startX; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = startY; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
        ctx.restore();
    }

    const R = 10 * Math.max(0.7, state.zoom);
    state.agents.forEach((a, i) => {
        const [sx, sy] = worldToScreen(a.x, a.y);
        ctx.beginPath(); ctx.fillStyle = PALETTE[i % PALETTE.length];
        ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
        if (state.showIds) { ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.font = `700 ${12 + Math.round(2 * state.zoom)}px ui-sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(a.id), sx, sy); }
    });
}

// No panning or wheel zoom — intentionally disabled

function resetAgents(n) { state.agents = Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 100 + Math.random() * 1000, y: 100 + Math.random() * 500 })); draw(); }
function clearAgents() { state.agents = []; draw(); }

async function loadEnvironment(nameOrBitmap) {
    if (nameOrBitmap instanceof ImageBitmap) { state.envBitmap = nameOrBitmap; state.envName = 'custom'; }
    else if (BuiltInEnvs[nameOrBitmap]) { state.envBitmap = await BuiltInEnvs[nameOrBitmap](); state.envName = nameOrBitmap; }
    else { console.warn('Unknown environment', nameOrBitmap); }
    state.zoom = 1; state.panX = 0; state.panY = 0; draw();
}

// Playback (demo idle motion)
let raf = null, playing = false;
function step() { if (!playing) return; state.tick++; $('#tickText').textContent = `Ticks: ${state.tick}`; state.agents.forEach((a, i) => { a.x += Math.sin((state.tick + i) / 40) * 0.6; a.y += Math.cos((state.tick + i) / 50) * 0.6; }); draw(); raf = requestAnimationFrame(step); }
function play() { if (!playing) { playing = true; raf = requestAnimationFrame(step); } }
function pause() { playing = false; if (raf) cancelAnimationFrame(raf); }

// WebSocket client (same as before)
function setConnStatus(connected) { const pill = $('#connPill'); const text = $('#connText'); pill.classList.toggle('connected', connected); text.textContent = connected ? 'Connected' : 'Disconnected'; }
function connectWS(url) {
    try { if (state.ws) { state.ws.close(); state.ws = null; } } catch { }
    const ws = new WebSocket(url); state.ws = ws; setConnStatus(false);
    ws.onopen = () => { setConnStatus(true); ws.send(JSON.stringify({ type: 'hello', agentCount: state.agentCount })); };
    ws.onclose = () => { setConnStatus(false); };
    ws.onerror = () => { setConnStatus(false); };
    ws.onmessage = (ev) => { try { const msg = JSON.parse(ev.data); if (msg.type === 'state' && Array.isArray(msg.agents)) { state.agents = msg.agents.map(a => ({ id: a.id, x: a.x, y: a.y })); draw(); } else if (msg.type === 'reset' && Array.isArray(msg.agents)) { state.agents = msg.agents.map(a => ({ id: a.id, x: a.x, y: a.y })); state.tick = 0; draw(); } else if (msg.type === 'env' && typeof msg.url === 'string') { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => createImageBitmap(img).then(bm => { state.envBitmap = bm; draw(); }); img.src = msg.url; } } catch (e) { console.warn('Invalid WS message', e); } };
}

// Wire up UI
$('#agentCount').addEventListener('change', (e) => { state.agentCount = parseInt(e.target.value, 10); resetAgents(state.agentCount); });
$('#envSelect').addEventListener('change', async (e) => { if (e.target.value === 'upload') { $('#envUpload').click(); return; } await loadEnvironment(e.target.value); });
$('#envUpload').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; const bm = await loadImageFromFile(f); await loadEnvironment(bm); $('#envSelect').value = 'upload'; });

$('#btnRandomize').addEventListener('click', () => resetAgents(state.agentCount));
$('#btnClear').addEventListener('click', () => clearAgents());

$('#btnConnect').addEventListener('click', () => connectWS($('#wsUrl').value.trim()));
$('#btnDisconnect').addEventListener('click', () => { if (state.ws) { state.ws.close(); state.ws = null; setConnStatus(false); } });

// Zoom buttons
function setZoom(z) { state.zoom = clamp(z, 0.5, 3); draw(); }
$('#btnZoomIn').addEventListener('click', () => setZoom(state.zoom * 1.15));
$('#btnZoomOut').addEventListener('click', () => setZoom(state.zoom / 1.15));

$('#btnStart').addEventListener('click', play);
$('#btnPause').addEventListener('click', pause);

$('#toggleGrid').addEventListener('change', (e) => { state.showGrid = e.target.checked; draw(); });
$('#toggleIds').addEventListener('change', (e) => { state.showIds = e.target.checked; draw(); });

(async function boot() { await loadEnvironment('demo-grid'); resetAgents(state.agentCount); draw(); })();
