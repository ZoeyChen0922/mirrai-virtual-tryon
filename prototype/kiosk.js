/* MIRRAI kiosk — P0 attract → P1 face → P2 profile → P3 gallery → P4 generating → P5 result → P6 handoff → P7 done.
   Everything is simulated locally: no photo leaves this page, nothing is written to storage. */
const $ = s => document.querySelector(s);
const app = $('#app'), screenEl = $('#screen'), overlay = $('#overlay'), toastEl = $('#toast');
const byId = id => PRODUCTS.find(p => p.id === id);
const IDLE_MS = 60000, IDLE_GRACE = 10;
const DEFAULT_SEL = { top: 'T7', bottom: 'B9', full: null }; // L1 — featured look
const STEPS = ['attract', 'face', 'profile', 'gallery', 'generating', 'result', 'handoff', 'done'];

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 5l-7 7 7 7"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5l7 7-7 7"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'
};

let state, scenario = 'normal', faceScenario = 'normal';
let timers = {}, stream = null, detector = null, detectTimer = null, lastTouch = Date.now(), idleOpen = false;

function fresh(lang = 'zh') {
  return {
    step: 'attract', lang, consent: false, face: null, // face: dataURL | 'sim' | 'skipped'
    profile: { height: '165', size: 'M' }, // womenswear store: no gender choice
    avatar: { status: 'idle', progress: 0 },
    sel: { ...DEFAULT_SEL }, look: null, fallback: null, sid: null, token: null, early: false,
    avatarImg: null, resultImg: null // generated from the customer's photo when tools/server.py is running
  };
}
state = fresh();
const isPhoto = f => typeof f === 'string' && f.startsWith('data:');

// Real generation is available only when served by tools/server.py (it holds the API key).
// On a static host the kiosk falls back to the pre-rendered demo images.
// Re-checked before every generation, so starting the server after opening the page still works.
let API = null;
function detectAPI() {
  return fetch('/api/config', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(c => {
    API = c && c.ok ? c : null;
    // A server started before a catalogue change would drop unknown garments — flag it in the demo panel.
    const stale = !!API && (!API.products || API.products.join() !== PRODUCTS.map(p => p.id).sort().join()
      || LOOKS.some(l => (API.looks?.[l.id] || []).join() !== [...l.items].sort().join()));
    parent.postMessage({ source: 'kiosk', type: 'api', ok: !!API, model: API?.model, stale }, '*');
    return API;
  });
}
detectAPI();
const t = (zh, en) => (state.lang === 'zh' ? zh : en);

/* ---------- plumbing ---------- */
function fit() {
  const k = Math.min(innerWidth / 1080, innerHeight / 1920);
  app.style.transform = `translate(${(innerWidth - 1080 * k) / 2}px, ${(innerHeight - 1920 * k) / 2}px) scale(${k})`;
}
addEventListener('resize', fit); fit();

function emit(name, data = {}) {
  parent.postMessage({ source: 'kiosk', type: 'event', name, data, step: state.step }, '*');
}
function clearTimer(name) { clearInterval(timers[name]); clearTimeout(timers[name]); delete timers[name]; }
function clearAllTimers() { Object.keys(timers).forEach(clearTimer); }

function toast(msg, ms = 2600) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimer('toast'); timers.toast = setTimeout(() => (toastEl.hidden = true), ms);
}

function go(step) {
  if (state.step === 'face' && step !== 'face') stopCamera();
  state.step = step;
  lastTouch = Date.now(); // automatic page changes count as activity
  render();
  parent.postMessage({ source: 'kiosk', type: 'step', step }, '*');
}

function reset(reason) {
  const lang = state.lang;
  stopCamera(); clearAllTimers(); closeOverlay();
  // Cleared before the customer took it with them → delete the stored result too.
  if (API && state.sid && reason !== 'handoff_done') fetch(`/api/result?sid=${state.sid}&t=${state.token}`, { method: 'DELETE' }).catch(() => {});
  emit('session_clear', { reason });
  state = fresh(lang);
  go('attract');
}

// Keep horizontal scroll positions of gallery rows across re-renders.
function render() {
  const keep = {};
  screenEl.querySelectorAll('[data-keep]').forEach(el => (keep[el.dataset.keep] = el.scrollLeft));
  screenEl.innerHTML = VIEWS[state.step]();
  screenEl.querySelectorAll('[data-keep]').forEach(el => (el.scrollLeft = keep[el.dataset.keep] || 0));
  AFTER[state.step]?.();
}

function topbar(i, { back = true } = {}) {
  return `<header class="top">
    <button class="icon" data-a="back" aria-label="Back" ${back ? '' : 'style="visibility:hidden"'}>${ICON.back}</button>
    <div class="dots">${[0, 1, 2, 3].map(n => `<i class="${n === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="top-r"><button class="txt" data-a="lang">${state.lang === 'zh' ? 'EN' : '中文'}</button><button class="txt" data-a="clear">${t('清除', 'Clear')}</button></div>
  </header>`;
}
const faceThumb = () =>
  state.avatarImg ? `<img class="face avatar" src="${state.avatarImg}" alt="">`
  : isPhoto(state.face) ? `<img class="face" src="${state.face}" alt="">` : `<span class="face">${ICON.person}</span>`;
const selItems = () => (state.sel.full ? [state.sel.full] : [state.sel.top, state.sel.bottom].filter(Boolean));
const name = p => (state.lang === 'zh' ? p.zh : p.en);

function qrImg(text, cell = 8) {
  if (typeof qrcode !== 'function') return `<div class="fine">${text}</div>`;
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createImgTag(cell, 0);
}
function mobileURL(extra = {}) {
  const u = new URL('m.html', API?.lan ? API.lan + '/' : location.href); // LAN address so a phone on the same Wi-Fi can open it
  const look = findLook(selItems());
  const p = { items: selItems().join(','), s: sizeGroup(state.profile.size), size: state.profile.size, lang: state.lang,
    sid: state.sid, t: state.token, f: isPhoto(state.face) ? 1 : 0, exp: Date.now() + 24 * 3600e3, store: STORE.id, ...(look ? { l: look.id } : {}), ...extra };
  Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString(); // only item ids and size — never the face photo
}

// While waiting: other confirmed looks, those sharing a piece with the current pick first. Tapping one tries it instead.
const lookPrice = l => l.items.reduce((sum, id) => sum + byId(id).price, 0);
function recsHTML() {
  const cur = selItems(), curId = findLook(cur)?.id;
  const shared = l => l.items.filter(id => cur.includes(id)).length;
  const recs = LOOKS.filter(l => l.id !== curId).sort((a, b) => shared(b) - shared(a)).slice(0, 3);
  return `<div class="recs"><span class="label">${t('这几套也适合你 · 点一下换成这套', 'You might also like · Tap to try instead')}</span>
    <div class="rec-row">${recs.map(l => `<button class="rec" data-look="${l.id}">
      <img src="assets/tryon/${l.id}_${sizeGroup(state.profile.size)}.webp" alt="">
      <b>${l.name[state.lang]}</b><span>${money(lookPrice(l))}<small> · ${l.items.length} ${t('件', l.items.length > 1 ? 'pieces' : 'piece')}</small></span>
    </button>`).join('')}</div></div>`;
}

/* ---------- views ---------- */
const VIEWS = {
  attract: () => `<section class="attract" data-a="start">
      <div class="slides">${LOOKS.map(l => `<img src="assets/tryon/${l.id}_M.webp" alt="" onerror="this.remove()">`).join('')}</div>
      <div class="attract-shade"></div>
      <div class="attract-top"><span class="logo">MIRRAI</span><button class="txt light" data-a="lang">${state.lang === 'zh' ? 'EN' : '中文'}</button></div>
      <div class="attract-copy">
        <p class="label">${t('本季新品 · AI 试穿', 'New in · AI try-on')}</p>
        <h1>${t('10 秒，<br>看见自己穿上它。', 'See yourself<br>in it.')}</h1>
        <button class="btn light" data-a="start">${t('点击开始', 'Tap to start')}</button>
        <p class="fine">${t('无需登录 · 拍照可选 · 离开即清除', 'No sign-in · Photo optional · Cleared when you leave')}</p>
      </div>
    </section>`,

  face: () => `<section class="page">${topbar(0)}
      <div class="frame-title">${t('拍一张你的照片', 'Take a picture of yourself')}</div>
      <p class="hint">${t('光线充足 · 正对镜头 · 摘下帽子和墨镜', 'Good lighting · Face the camera · No hat or sunglasses')}</p>
      <div class="cam">
        <video id="cam" playsinline muted></video>
        <img id="still" alt="" hidden>
        <div class="cam-sim" id="camSim" hidden>${ICON.person}<span>${t('摄像头不可用 · 演示中模拟拍照', 'Camera unavailable · Photo is simulated in this demo')}</span></div>
        <div class="oval" id="oval"></div>
        <div class="count" id="count" hidden></div>
        <div class="cam-msg" id="camMsg" hidden></div>
      </div>
      <div class="cam-actions" id="camActions"></div>
      <div class="face-foot">
        <button class="link" data-a="skip-face">${t('跳过，使用默认形象', 'Skip, use default face')}</button>
        <p class="fine">${t('照片仅用于本次生成 · 不用于训练模型 · 原图不保存', 'Only for this try-on · Never used to train models · Original not stored')}</p>
      </div>
      ${state.consent ? '' : `<div class="sheet"><div class="sheet-box">
        <p class="label">${t('拍照前说明', 'Before we take a photo')}</p>
        <h2>${t('你的照片只服务这一次试穿', 'Your photo is only for this try-on')}</h2>
        <ul>
          <li><b>01</b>${t('照片会发送到图像生成服务（OpenAI）生成你的试穿形象，只用于这一次，不用于训练模型', 'Sent to our image service (OpenAI) only to create this try-on — never used to train models')}</li>
          <li><b>02</b>${t('原始照片不保存；离开或 60 秒无操作，屏幕上的内容立即清除', 'The original photo is not stored; this screen clears when you leave or after 60s idle')}</li>
          <li><b>03</b>${t('生成结果只保留 24 小时，只能通过你本人扫码取回，可随时删除', 'Your result is kept for 24h, reachable only through your QR code, and deletable anytime')}</li>
        </ul>
        <div class="sheet-actions">
          <button class="btn primary" data-a="consent">${t('同意并拍照', 'Agree & continue')}</button>
          <button class="btn" data-a="skip-face">${t('跳过，使用默认形象', 'Skip, use default face')}</button>
        </div></div></div>`}
    </section>`,

  profile: () => {
    const P = state.profile;
    const opt = (key, val, label, wide) => `<button class="opt ${wide ? 'wide' : ''} ${P[key] === val ? 'on' : ''}" data-opt="${key}" data-val="${val}">${label}</button>`;
    return `<section class="page">${topbar(1)}
      <div class="frame-title sm">${t('按身高和尺码生成身形 · 不问体重 · 不拍全身', "We'll build your body from your height and size — no weight, no full-body photo")}</div>
      <div class="who">${faceThumb()}<p>${state.face === 'skipped' ? t('已使用默认形象', 'Using the default face') : t('已记录你的脸部照片，仅本次使用', 'Face photo captured for this session only')}</p></div>
      <div class="group"><span class="label">${t('身高 (cm)', 'Height (cm)')}</span><div class="opts">${['155', '160', '165', '170', '175', '180'].map((h, i, a) => opt('height', h, i === 0 ? '≤155' : i === a.length - 1 ? '180+' : h)).join('')}</div></div>
      <div class="group"><span class="label">${t('你平时穿的尺码', 'Your typical clothing size')}</span><div class="opts">${['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].map(s => opt('size', s, s)).join('')}</div></div>
      <div class="bottom"><button class="btn primary" data-a="create-avatar">${t('生成我的形象', 'Create an avatar')}</button></div>
    </section>`;
  },

  gallery: () => {
    const s = state.sel, items = selItems(), n = items.length;
    const complete = !!(s.full || (s.top && s.bottom));
    const row = (cat, title) => {
      const list = PRODUCTS.filter(p => p.cat === cat);
      const dim = cat === 'full' ? !!(s.top || s.bottom) && !s.full : !!s.full;
      return `<div class="row"><div class="row-head"><span class="label">${title}</span>
          <span class="row-arrows"><button data-scroll="${cat}" data-dir="-1" aria-label="prev">${ICON.left}</button><button data-scroll="${cat}" data-dir="1" aria-label="next">${ICON.right}</button></span></div>
        <div class="track" data-keep="${cat}" id="track-${cat}">${list.map(p => {
          const on = s[cat] === p.id;
          return `<button class="card ${on ? 'on' : ''} ${dim && !on ? 'dim' : ''}" data-item="${p.id}">
            <img src="assets/products/${p.img}" alt="">${p.stock === 'online' ? `<span class="tag">${t('仅线上', 'Online only')}</span>` : ''}
            <span class="cap"><b>${name(p)}</b><span>${money(p.price)}</span></span></button>`;
        }).join('')}</div></div>`;
    };
    const av = state.avatar;
    return `<section class="page">${topbar(2)}
      <div class="gal-head"><div class="frame-title sm">${t('选择你的搭配', 'Select your look')}</div><button class="txt" data-a="clear-sel">${t('清空', 'Clear')} (${n})</button></div>
      <div class="status">${faceThumb()}<div class="meta"><span id="avText">${av.status === 'ready' ? t('你的形象已就绪 ✓', 'Your avatar is ready ✓') : t('正在生成你的形象…', 'Creating your avatar…') + ' ' + Math.round(av.progress) + '%'}</span>
        <div class="bar"><i id="avBar" style="width:${av.progress}%"></i></div></div>
        <div class="picked">${items.map(id => `<img src="assets/products/${byId(id).img}" alt="">`).join('')}</div></div>
      ${row('top', t('上装', 'Tops'))}${row('bottom', t('下装', 'Bottoms'))}${row('full', t('连衣裙 · 全身', 'Full body'))}
      <div class="gal-bottom"><button class="btn primary" data-a="create-look" ${complete ? '' : 'disabled'}>${t('生成上身效果', 'Create look')}</button>
        <p class="fine">${complete ? '' : s.top ? t('再选一件下装，或直接选一条连衣裙', 'Add a bottom, or pick a full-body piece') : s.bottom ? t('再选一件上装，或直接选一条连衣裙', 'Add a top, or pick a full-body piece') : t('选一件上装 + 一件下装，或一条连衣裙', 'Pick a top + a bottom, or one full-body piece')}</p></div>
    </section>`;
  },

  generating: () => {
    const first = byId(selItems()[0]);
    return `<section class="page">${topbar(3, { back: false })}
      <div class="gen">
        <div class="ring"><svg viewBox="0 0 340 340"><circle cx="170" cy="170" r="160" stroke="#e2e0db"/><circle id="arc" cx="170" cy="170" r="160" stroke="#111" stroke-dasharray="1005" stroke-dashoffset="1005"/></svg><div class="pct" id="pct">0%</div></div>
        <h2 id="genTitle">${t('正在生成你的搭配', 'Creating your look')}</h2>
        <p class="sub" id="genSub">${t('预计 8 秒', 'About 8 seconds')}</p>
        <div class="sell" id="sell"><img src="assets/products/${first.img}" alt=""><div><span class="label">${t('等待时，认识这件', 'While you wait')}</span><b>${name(first)}</b><p>${first.note[state.lang]}</p></div></div>
        ${recsHTML()}
        <div id="early"></div>
      </div></section>`;
  },

  result: () => {
    const items = selItems().map(byId), g = sizeGroup(state.profile.size);
    const stage = state.fallback
      ? `<div class="fallback"><div class="flats">${items.map(p => `<img src="assets/products/${p.img}" alt="">`).join('')}</div>
          <p>${state.fallback === 'offline' ? t('网络暂时不可用，先看看官方商品图。你的选择已保存。', "We're offline — here are the product photos. Your picks are saved.")
            : state.fallback === 'nomatch' ? t('这套搭配的上身效果还在准备中，先看看官方商品图。', 'The try-on for this combination is still on its way — here are the product photos.')
              + `<br><small style="color:#8a8a8a;font-size:22px">${t('（演示提示：未连接生成服务，只有 6 套精选搭配有预生成效果图。请运行 tools/server.py 并打开 localhost:4174）', '(Demo: generation service not connected — only the 6 curated looks have pre-rendered images. Run tools/server.py and open localhost:4174)')}</small>`
            : t('这次没有生成成功，已自动重试。先看看官方商品图，你的选择都还在。', "That didn't work, even after a retry. Here are the product photos — your picks are saved.")}</p></div>`
      : `<img src="${state.resultImg || `assets/tryon/${state.look.id}_${g}.webp`}" alt="try-on result"><span class="badge">AI PREVIEW</span>
         <span class="demo">${state.resultImg && isPhoto(state.face) ? t('由你的照片生成', 'Generated from your photo')
           : state.resultImg ? t('按你的身高和尺码生成 · 默认形象', 'Generated for your height and size · Default face')
           : state.face === 'skipped' ? t('默认形象', 'Default avatar')
           : t('演示使用示例形象<br>接入生成服务后为你的脸', 'Demo avatar<br>Your face when the generation service is on')}</span>`;
    return `<section class="page">${topbar(3)}
      <div class="stage">${stage}</div>
      <div class="items">${items.map(p => `<div class="item"><b>${name(p)}</b><span class="price">${money(p.price)}</span>
        <small>${p.stock === 'in' ? `${t('货架', 'Rack')} ${p.rack} · ${t('本店有', 'In store:')} ${state.profile.size}` : `<span class="oos">${t('本店暂缺 · 可线上购买', 'Not in store · Available online')}</span>`}</small></div>`).join('')}</div>
      <div class="res-actions">
        ${state.fallback && state.fallback !== 'nomatch' ? `<button class="btn" data-a="retry">${t('再试一次', 'Try again')}</button>` : `<button class="btn" data-a="change-items">${t('换一套', 'Change items')}</button>`}
        <button class="btn" data-a="change-size">${t('换尺码', 'Change size')}</button></div>
      <div class="res-bottom"><button class="btn primary" data-a="handoff">${t('扫码带走 · 领门店券', 'Take it with you')}</button></div>
    </section>`;
  },

  handoff: () => `<section class="page">${topbar(3)}
      <div class="hand">
        <p class="label">${t('用手机继续 · 无需下载 APP', 'Continue on your phone · No app needed')}</p>
        <h2>${t('扫码保存试穿图，<br>再领一张门店券', 'Scan to save your look<br>and get an in-store offer')}</h2>
        <div class="qr-box">${qrImg(mobileURL(), 10)}</div>
        <div class="perks"><div>${t('保存试穿图', 'Save your look')}</div><div>${t('领 $10 门店券', '$10 off in store')}</div><div>${t('叫店员送到试衣间', 'Staff bring your size')}</div></div>
        <p class="fine">${t('私人链接 · 24 小时后失效', 'Private link · Expires in 24 hours')}<br>${t('没带手机？把这个号码给店员：', 'No phone? Show this code to staff:')} <span class="code">${state.sid}</span></p>
      </div>
      <div class="bottom"><button class="link" data-a="finish">${t('完成，清除我的记录', 'Done, clear my session')}</button></div>
    </section>`,

  done: () => `<section class="page"><div class="done">
      <p class="label">${t('已发送', 'Sent')}</p>
      <h2>${t('已发送到你的手机', 'Sent to your phone')}</h2>
      <p>${t('这块屏幕将在', 'This screen clears in')} <b id="doneCount">5</b> ${t('秒后清空，你的照片不会保留。', 'seconds. Your photo is not kept.')}</p>
    </div></section>`
};

/* ---------- per-view setup ---------- */
const AFTER = {
  attract() {}, // attract loop = cross-fading slideshow of the eight looks (no video in this version)
  face() {
    if (state.consent) startCamera();
  },
  gallery() {},
  generating() { startGeneration(); },
  handoff() { parent.postMessage({ source: 'kiosk', type: 'handoff', url: mobileURL() }, '*'); emit('qr_show'); },
  done() {
    let n = 5;
    timers.done = setInterval(() => { n -= 1; const el = $('#doneCount'); if (el) el.textContent = n; if (n <= 0) reset('handoff_done'); }, 1000);
  }
};

/* ---------- P1 camera ---------- */
async function startCamera() {
  renderShutter();
  if (!navigator.mediaDevices?.getUserMedia) return simCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } });
    if (state.step !== 'face') return stopCamera();
    const v = $('#cam'); v.srcObject = stream; await v.play();
    loadDetector();
    clearTimer('detect'); timers.detect = setInterval(updateFaceIssue, 400);
  } catch (e) { simCamera(); }
}
function simCamera() {
  const sim = $('#camSim'); if (sim) sim.hidden = false;
  clearTimer('detect'); timers.detect = setInterval(updateFaceIssue, 400);
}
function stopCamera() {
  if (stream) stream.getTracks().forEach(tr => tr.stop());
  stream = null; clearTimer('detect'); clearTimer('countdown');
}

// On-device face detection (MediaPipe, WASM). If it fails to load, capture is simply allowed.
async function loadDetector() {
  if (detector !== null) return;
  detector = false;
  try {
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const vision = await import(`${base}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
    detector = await vision.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
      runningMode: 'VIDEO'
    });
  } catch (e) { detector = false; }
}
const probe = document.createElement('canvas'); probe.width = probe.height = 24;
function currentIssue() {
  if (faceScenario !== 'normal') return faceScenario;
  const v = $('#cam');
  if (!stream || !v || v.readyState < 2) return null;
  const c = probe.getContext('2d', { willReadFrequently: true }); c.drawImage(v, 0, 0, 24, 24);
  const d = c.getImageData(0, 0, 24, 24).data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  if (sum / (d.length / 4) < 50) return 'dark';
  if (detector) {
    const n = detector.detectForVideo(v, performance.now()).detections.length;
    if (n === 0) return 'noface';
    if (n > 1) return 'multi';
  }
  return null;
}
let issue = null;
function updateFaceIssue() {
  if (state.step !== 'face' || !$('#still')?.hidden) return;
  const next = currentIssue();
  if (next !== issue) {
    issue = next;
    if (issue) emit('face_error', { type: issue });
    const msg = $('#camMsg');
    msg.hidden = !issue;
    msg.textContent = { noface: t('没有看到你的脸，请靠近一点', "We can't see your face — step a little closer"),
      multi: t('请确保画面里只有你一个人', 'Make sure only you are in the frame'),
      dark: t('光线太暗，请换个亮一点的位置', "It's too dark — find better lighting") }[issue] || '';
    renderShutter();
  }
}
function renderShutter() {
  const box = $('#camActions'); if (!box) return;
  box.innerHTML = `<button class="shutter" data-a="shoot" aria-label="Take photo" ${issue ? 'disabled' : ''}></button>`;
}
function shoot() {
  let n = 3; const count = $('#count'); count.hidden = false; count.textContent = n;
  clearTimer('countdown');
  timers.countdown = setInterval(() => {
    n -= 1;
    if (n > 0) { count.textContent = n; return; }
    clearTimer('countdown'); count.hidden = true;
    const v = $('#cam'), still = $('#still');
    if (stream && v.readyState >= 2) {
      const side = Math.min(v.videoWidth, v.videoHeight), c = document.createElement('canvas');
      c.width = c.height = 720; const x = c.getContext('2d');
      x.translate(720, 0); x.scale(-1, 1);
      x.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 720, 720);
      state.face = c.toDataURL('image/jpeg', 0.85); // kept in memory only
      still.src = state.face; still.hidden = false;
    } else {
      state.face = 'sim';
      $('#camSim').innerHTML = `<span>✓<br><br>${t('已模拟拍照（演示）', 'Photo simulated (demo)')}</span>`;
    }
    $('#oval').hidden = true;
    emit('face_capture', { simulated: state.face === 'sim' });
    $('#camActions').innerHTML = `<button class="btn" data-a="retake">${t('重拍', 'Retake')}</button><button class="btn primary" data-a="use-photo">${t('使用这张', 'Use this photo')}</button>`;
  }, 1000);
}

/* ---------- P2 → P3 avatar job (runs in the background while the user shops) ---------- */
// Real call: customer's face + body for the chosen size (≈30–60s). Otherwise an 8s simulation.
const eased = (ms, expected) => Math.min(95, 95 * (1 - Math.exp(-ms / (expected / 2.5))));
// The pre-rendered demo images show a 165 cm woman in M or XL; any other height/size needs a real generation.
const defaultBody = () => state.profile.height === '165' && ['M', 'XL'].includes(state.profile.size);
const bodyParams = () => ({ size: state.profile.size, height: state.profile.height });
function startAvatarJob() {
  clearTimer('avatar');
  state.avatar = { status: 'running', progress: 0 }; state.avatarImg = null;
  const real = !!API && (isPhoto(state.face) || !defaultBody()), total = real ? 40000 : 8000, t0 = Date.now(), sid = state.sid;
  const paint = () => {
    const txt = $('#avText'), bar = $('#avBar');
    if (txt) txt.textContent = state.avatar.status === 'ready' ? t('你的形象已就绪 ✓', 'Your avatar is ready ✓') : `${t('正在生成你的形象…', 'Creating your avatar…')} ${Math.round(state.avatar.progress)}%`;
    if (bar) bar.style.width = state.avatar.progress + '%';
  };
  const done = img => {
    clearTimer('avatar'); state.avatar = { status: 'ready', progress: 100 };
    if (img) state.avatarImg = img;
    emit('avatar_ready', { real: !!img });
    state.step === 'gallery' ? render() : paint();
  };
  timers.avatar = setInterval(() => {
    const ms = Date.now() - t0;
    state.avatar.progress = real ? eased(ms, total) : Math.min(100, (ms / total) * 100);
    if (!real && state.avatar.progress >= 100) return done(null);
    paint();
  }, 200);
  if (real) {
    fetch('/api/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ face: isPhoto(state.face) ? state.face : null, ...bodyParams() }) })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => state.sid === sid && done(d.image))
      .catch(() => { if (state.sid === sid) { emit('avatar_fallback'); done(null); } });
  }
}

function showEarly() {
  state.early = true; emit('gen_slow_prompt');
  const url = mobileURL({ pending: 1 });
  parent.postMessage({ source: 'kiosk', type: 'handoff', url, early: true }, '*');
  $('#early').innerHTML = `<div class="early"><div class="qr">${qrImg(url, 5)}</div><div><b>${t('不想等？先扫码', 'Rather not wait? Scan now')}</b><p>${t('生成完成后会自动出现在你的手机上。', "Your look will appear on your phone when it's ready.")}</p></div></div>`;
}

// Real try-on through tools/server.py. The server returns the customer's own image, or {static:true}
// when the default face + a curated look means the pre-rendered image is already correct.
function realGeneration(items) {
  const sid = state.sid, t0 = Date.now(), expected = 40000;
  state.resultImg = null;
  $('#genSub').textContent = t('正在用你的照片生成，约 30–60 秒', 'Generating with your photo — about 30–60 seconds');
  timers.gen = setInterval(() => {
    if (state.step !== 'generating') return clearTimer('gen');
    const ms = Date.now() - t0, p = eased(ms, expected);
    $('#arc').style.strokeDashoffset = 1005 * (1 - p / 100);
    $('#pct').textContent = Math.round(p) + '%';
    if (!state.early && ms > 15000) showEarly();
  }, 200);
  const stale = () => state.sid !== sid || state.step !== 'generating';
  fetch('/api/tryon', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid, t: state.token, face: isPhoto(state.face) ? state.face : null,
      ...bodyParams(), look: state.look?.id || null, items }) })
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(d => {
      if (stale()) return;
      clearTimer('gen'); state.resultImg = d.image || null;
      emit('gen_success', { ms: Date.now() - t0, real: !!d.image, look: state.look?.id || null });
      go('result');
    })
    .catch(() => {
      if (stale()) return;
      clearTimer('gen'); state.fallback = 'error'; emit('gen_fallback', { reason: 'api_error' }); go('result');
    });
}

/* ---------- P4 generation (scenario-driven) ---------- */
async function startGeneration() {
  clearTimer('gen');
  if (!API) await detectAPI();
  if (state.step !== 'generating') return;
  const items = selItems();
  state.look = findLook(items); state.fallback = null; state.early = false; state.resultImg = null;
  emit('gen_start', { items, look: state.look?.id || null, scenario, real: !!API && scenario === 'normal' });
  if (scenario === 'offline') { state.fallback = 'offline'; emit('gen_fallback', { reason: 'offline' }); return setTimeout(() => go('result'), 900); }
  // "Normal" uses the real service whenever there is something to personalise; slow/fail stay simulated for the demo.
  if (API && scenario === 'normal' && (isPhoto(state.face) || !state.look || !defaultBody())) return realGeneration(items);
  const total = scenario === 'slow' ? 24000 : 8000;
  let t0 = Date.now(), retried = false, startedAt = Date.now();
  const arc = () => $('#arc'), pct = () => $('#pct');
  timers.gen = setInterval(() => {
    if (state.step !== 'generating') return clearTimer('gen');
    let p = Math.min(100, ((Date.now() - t0) / total) * 100);
    if (state.avatar.status !== 'ready') { // avatar still baking: merge both waits
      p = Math.min(p, 40);
      $('#genSub').textContent = t('正在完成你的形象…', 'Finishing your avatar…');
    } else if (!retried) {
      $('#genSub').textContent = scenario === 'slow' && Date.now() - startedAt > 15000
        ? t('比平时慢一些，你可以先扫码', 'Taking longer than usual — you can scan now') : t('预计 8 秒', 'About 8 seconds');
    }
    if (scenario === 'fail' && !retried && p >= 70) {
      retried = true; t0 = Date.now(); emit('gen_retry');
      $('#genTitle').textContent = t('正在自动重试', 'Retrying automatically'); return;
    }
    if (scenario === 'fail' && retried && p >= 55) {
      clearTimer('gen'); state.fallback = 'error'; emit('gen_fallback', { reason: 'error' }); return go('result');
    }
    if (scenario === 'slow' && !state.early && Date.now() - startedAt > 15000) showEarly();
    arc().style.strokeDashoffset = 1005 * (1 - p / 100);
    pct().textContent = Math.round(p) + '%';
    if (p >= 100) {
      clearTimer('gen');
      if (!state.look) { state.fallback = 'nomatch'; emit('gen_fallback', { reason: 'nomatch' }); }
      else emit('gen_success', { ms: Date.now() - startedAt, look: state.look.id });
      go('result');
    }
  }, 100);
}

/* ---------- overlays: idle + clear confirm ---------- */
function openOverlay(html) { overlay.innerHTML = `<div class="sheet-box">${html}</div>`; overlay.hidden = false; }
function closeOverlay() { overlay.hidden = true; overlay.innerHTML = ''; idleOpen = false; clearTimer('idle'); }
function confirmClear() {
  openOverlay(`<p class="label">${t('清除', 'Clear')}</p><h2>${t('清除本次试穿？', 'Clear this session?')}</h2>
    <ul><li>${t('照片、尺码和已选衣服都会被删除，屏幕回到首页。', 'Your photo, size and picks will be deleted and the screen returns to start.')}</li></ul>
    <div class="sheet-actions"><button class="btn primary" data-o="clear-yes">${t('清除', 'Clear')}</button><button class="btn" data-o="close">${t('取消', 'Cancel')}</button></div>`);
}
function openIdle() {
  idleOpen = true; let n = IDLE_GRACE; emit('idle_prompt');
  openOverlay(`<p class="label">${t('还在吗？', 'Still there?')}</p><h2>${t('还在试穿吗？', 'Are you still here?')}</h2>
    <ul><li>${t('为保护隐私，屏幕将在', 'To protect your privacy, this screen clears in')} <b id="idleN">${n}</b> ${t('秒后清空。', 'seconds.')}</li></ul>
    <div class="sheet-actions"><button class="btn primary" data-o="close">${t('我还在', "I'm still here")}</button></div>`);
  timers.idle = setInterval(() => { n -= 1; const el = $('#idleN'); if (el) el.textContent = n; if (n <= 0) reset('idle'); }, 1000);
}
setInterval(() => {
  // The user is waiting, not idle, while a look is generating.
  if (!idleOpen && !['attract', 'generating', 'done'].includes(state.step) && Date.now() - lastTouch > IDLE_MS) openIdle();
}, 1000);
['pointerdown', 'click', 'keydown'].forEach(ev => addEventListener(ev, () => { lastTouch = Date.now(); }, true));

overlay.addEventListener('click', e => {
  const b = e.target.closest('[data-o]'); if (!b) return;
  if (b.dataset.o === 'clear-yes') reset('manual');
  else closeOverlay();
});

// Gallery arrows: animate scrollLeft ourselves — native smooth scrollBy was a no-op against scroll-snap in testing.
function glide(el, dx) {
  const from = el.scrollLeft, to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + dx)), t0 = performance.now();
  if (document.hidden) { el.scrollLeft = to; return; } // rAF does not run while the page is hidden
  const step = now => {
    const k = Math.min(1, (now - t0) / 280);
    el.scrollLeft = from + (to - from) * (1 - Math.pow(1 - k, 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- actions ---------- */
screenEl.addEventListener('click', e => {
  const scroll = e.target.closest('[data-scroll]');
  if (scroll) { glide($('#track-' + scroll.dataset.scroll), 212 * 3 * +scroll.dataset.dir); return; }

  const item = e.target.closest('[data-item]');
  if (item) {
    const p = byId(item.dataset.item), s = state.sel;
    if (s[p.cat] === p.id) s[p.cat] = null;
    else {
      s[p.cat] = p.id;
      if (p.cat === 'full') { s.top = null; s.bottom = null; } else s.full = null; // full body ⟂ top + bottom
    }
    emit('item_select', { id: p.id, selected: s[p.cat] === p.id });
    return render();
  }

  const rec = e.target.closest('[data-look]');
  if (rec) {
    const look = LOOKS.find(l => l.id === rec.dataset.look);
    state.sel = { top: null, bottom: null, full: null };
    look.items.forEach(id => (state.sel[byId(id).cat] = id));
    emit('rec_select', { look: look.id, from: state.step });
    clearTimer('gen'); state.step = null; // force a fresh generating view
    return go('generating');
  }

  const opt = e.target.closest('[data-opt]');
  if (opt) { state.profile[opt.dataset.opt] = opt.dataset.val; return render(); }

  const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
  const back = { face: () => reset('back'), profile: () => go('face'), gallery: () => go('profile'), result: () => go('gallery'), handoff: () => go('result') };
  ({
    start: () => {
      state.sid = 'A' + Math.floor(1000 + Math.random() * 9000);
      state.token = crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12); // unguessable part of the phone link
      emit('attract_tap'); go('face');
    },
    lang: () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; state.step === 'face' ? (stopCamera(), render()) : render(); },
    clear: confirmClear,
    back: () => back[state.step]?.(),
    consent: () => { state.consent = true; emit('face_consent_agree'); render(); },
    'skip-face': () => { state.face = 'skipped'; emit('face_skip'); go('profile'); },
    shoot,
    retake: () => { state.face = null; emit('face_retake'); render(); },
    'use-photo': () => go('profile'),
    'create-avatar': () => { emit('profile_submit', { ...state.profile }); go('gallery'); (API ? Promise.resolve() : detectAPI()).then(startAvatarJob); },
    'clear-sel': () => { state.sel = { top: null, bottom: null, full: null }; render(); },
    'create-look': () => { emit('look_create', { items: selItems() }); go('generating'); },
    retry: () => go('generating'),
    'change-items': () => { emit('result_change_items'); go('gallery'); },
    'change-size': () => { emit('result_change_size'); go('profile'); },
    handoff: () => go('handoff'),
    finish: () => go('done')
  })[a]?.();
});

/* ---------- demo shell bridge ---------- */
addEventListener('message', e => {
  const m = e.data || {}; if (m.source !== 'shell') return;
  if (m.type === 'scenario') scenario = m.value;
  if (m.type === 'faceScenario') { faceScenario = m.value; issue = undefined; updateFaceIssue(); }
  if (m.type === 'restart') reset('demo_restart');
  if (m.type === 'idleNow') lastTouch = 0;
  if (m.type === 'scanned') { emit('qr_scanned', { early: state.step === 'generating' }); if (state.step === 'handoff') go('done'); }
});

render();
