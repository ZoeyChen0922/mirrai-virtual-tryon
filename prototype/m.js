/* Phone handoff page. Reads only item ids + size from the URL; the face photo never leaves the kiosk in this demo. */
const $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search);
const S = {
  lang: q.get('lang') || 'zh', items: (q.get('items') || 'T7,B9').split(',').filter(id => PRODUCTS.some(p => p.id === id)),
  look: q.get('l'), group: q.get('s') || 'M', size: q.get('size') || 'M', sid: q.get('sid') || 'A0000',
  exp: +q.get('exp') || Date.now() + 864e5, store: q.get('store') || STORE.id, pending: q.get('pending') === '1',
  view: 'mine', detail: null, coupon: false, posterFace: false,
  t: q.get('t') || '', api: false, img: null // img: the customer's own generated try-on, fetched from tools/server.py
};
const t = (zh, en) => (S.lang === 'zh' ? zh : en);
const byId = id => PRODUCTS.find(p => p.id === id);
const name = p => (S.lang === 'zh' ? p.zh : p.en);
const lookImg = () => S.img || (S.look ? `assets/tryon/${S.look}_${S.group}.webp` : null);
const deletedKey = 'mirrai_deleted_' + S.sid;
let deleted = false;
try { deleted = sessionStorage.getItem(deletedKey) === '1'; } catch (e) {}

function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2600); }
function buyURL(p) {
  const u = new URL(p.url, location.href); // only store attribution — no personal data
  u.searchParams.set('utm_source', 'kiosk'); u.searchParams.set('utm_medium', 'tryon'); u.searchParams.set('store', S.store);
  u.searchParams.set('lang', S.lang);
  return u.toString();
}
const head = back => `<header class="head">${back ? `<button class="back" data-a="home">← ${t('返回', 'Back')}</button>` : '<span class="logo">MIRRAI</span>'}
  <button class="lang" data-a="lang">${S.lang === 'zh' ? 'EN' : '中文'}</button></header>`;
const foot = `<p class="foot">${t('全部商品与试穿图均由 AI 生成，商品、价格与"官网"均为笔试原型的演示内容。',
  'All products and try-ons are AI-generated; products, prices and the "online store" are demo content for a design-exercise prototype.')}</p>`;

function viewMine() {
  const img = lookImg();
  const hero = S.pending
    ? `<div class="pending"><div><div class="spin"></div><b>${t('正在生成你的搭配', 'Still creating your look')}</b><p>${t('完成后会自动显示在这里', 'It will appear here when ready')}</p></div></div>`
    : img ? `<div class="hero"><img src="${img}" alt=""><span class="badge">AI PREVIEW</span></div><p class="caption">${S.img && q.get('f') === '1'
        ? t('由你的照片生成 · 仅你可见 · 24 小时后删除', 'Generated from your photo · Only you can see it · Deleted after 24h')
        : S.img ? t('按你的尺码生成 · 默认形象 · 24 小时后删除', 'Generated for your size · Default face · Deleted after 24h')
        : t('演示使用示例形象', 'Demo avatar')}</p>`
    : `<div class="flats">${S.items.map(id => `<img src="assets/products/${byId(id).img}" alt="">`).join('')}</div><p class="caption">${t('这套的上身效果还在准备中，先看官方商品图', 'Try-on for this combination is on its way — product photos for now')}</p>`;
  return `${head(false)}
    <div class="private">${t('私人链接 · 仅你可见 · 24 小时后失效', 'Private link · Only you can see this · Expires in 24h')}</div>
    ${hero}
    <div class="coupon"><span><b>${t('门店专享 $10 券', '$10 off in store')}</b><small>${t('今日有效 · 满 $60 可用', 'Today only · On $60+')}</small></span>
      <button class="${S.coupon ? 'got' : ''}" data-a="coupon">${S.coupon ? t('已领取', 'Claimed') : t('领取', 'Claim')}</button></div>
    <div class="list"><p class="label" style="padding:14px 0 4px">${t('这套搭配', 'In this look')}</p>
      ${S.items.map(id => { const p = byId(id); return `<button class="li" data-a="detail" data-id="${p.id}"><img src="assets/products/${p.img}" alt="">
        <span><b>${name(p)}</b><small>${p.stock === 'in' ? `${t('本店有货 · 货架', 'In store · Rack')} ${p.rack}` : t('本店暂缺 · 可线上购买', 'Not in store · Online')}</small></span>
        <span>${money(p.price)}<small class="go">${t('查看', 'View')}</small></span></button>`; }).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-a="poster">${t('生成分享海报', 'Share poster')}</button>
      ${img && !S.pending ? `<a class="btn" href="${img}" download="mirrai-look.webp">${t('保存试穿图', 'Save image')}</a>` : ''}
      <button class="btn quiet" data-a="delete">${t('删除这次试穿记录', 'Delete this try-on')}</button>
    </div>${foot}`;
}

function viewDetail() {
  const p = byId(S.detail), inStore = p.stock === 'in';
  const staff = `<button class="btn ${inStore ? 'primary' : ''}" data-a="staff">${t(`请店员把 ${S.size} 码送到试衣间`, `Ask staff to bring size ${S.size}`)}</button>`;
  const online = p.url ? `<a class="btn ${inStore ? '' : 'primary'}" href="${buyURL(p)}" target="_blank" rel="noopener" data-a="buy">${t('去官网购买', 'Buy online')} ↗</a>` : '';
  return `${head(true)}
    <img class="detail-img" src="assets/products/${p.img}" alt="">
    <div class="detail"><h1>${name(p)}</h1><div class="price">${money(p.price)}</div><p>${p.note[S.lang]}</p>
      <div class="facts">
        <div><span>${t('尺码建议', 'Size advice')}</span><span>${t(`你选的是 ${S.size}，建议 ${S.size} 码`, `You chose ${S.size} — we suggest ${S.size}`)}</span></div>
        <div><span>${t('本店库存', 'In this store')}</span>${inStore ? `<span>${t('有货', 'In stock')} · ${t('货架', 'Rack')} ${p.rack}</span>` : `<span class="oos">${t('暂时缺货', 'Out of stock')}</span>`}</div>
      </div></div>
    <div class="actions">${inStore ? staff + online : online}</div>${foot}`;
}

const viewGone = (title, body) => `${head(false)}<div class="empty"><p class="label">MIRRAI</p><h1>${title}</h1><p>${body}</p></div>`;

function render() {
  $('#m').innerHTML = deleted ? viewGone(t('记录已删除', 'Deleted'), t('我们没有保留你的照片和试穿记录。', "We don't keep your photo or try-on."))
    : Date.now() > S.exp ? viewGone(t('这次试穿已过期', 'This try-on has expired'), t('链接 24 小时后自动失效，我们不保留你的数据。', "Links expire after 24 hours. We don't keep your data."))
    : S.view === 'detail' ? viewDetail() : viewMine();
  scrollTo(0, 0);
}

/* ---------- share poster (Canvas, generated on the phone) ---------- */
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
async function drawPoster() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d');
  x.fillStyle = '#f6f5f2'; x.fillRect(0, 0, 1080, 1920);
  const items = S.items.map(byId);
  try {
    if (S.posterFace && lookImg()) { // opt-in only
      const im = await loadImg(lookImg()); x.fillStyle = '#ece9e3'; x.fillRect(0, 0, 1080, 1420);
      const h = 1420, w = (im.width / im.height) * h; x.drawImage(im, (1080 - w) / 2, 0, w, h);
    } else { // default: product photos, no face
      const ims = await Promise.all(items.map(p => loadImg('assets/products/' + p.img)));
      const w = ims.length > 1 ? 520 : 800, h = w * 1.5, gap = 20, total = ims.length * w + (ims.length - 1) * gap;
      ims.forEach((im, i) => x.drawImage(im, (1080 - total) / 2 + i * (w + gap), 1420 - h - 60, w, h));
    }
  } catch (e) {}
  x.fillStyle = '#111'; x.font = '500 34px Helvetica Neue, Arial, sans-serif'; x.fillText('MIRRAI', 72, 1510);
  x.font = '400 40px Helvetica Neue, PingFang SC, sans-serif';
  items.forEach((p, i) => { x.fillText(name(p), 72, 1590 + i * 60); x.textAlign = 'right'; x.fillText(money(p.price), 1008, 1590 + i * 60); x.textAlign = 'left'; });
  x.fillStyle = '#8a8a8a'; x.font = '400 28px Helvetica Neue, PingFang SC, sans-serif';
  x.fillText(STORE.name, 72, 1800); x.fillText(t('扫码查看商品', 'Scan to shop'), 72, 1846);
  const target = items.find(p => p.url)?.url; // QR opens the product page, never the private try-on link
  if (target && typeof qrcode === 'function') {
    const qr = qrcode(0, 'M'); qr.addData(target); qr.make();
    const qi = await loadImg(qr.createDataURL(6, 0)); x.imageSmoothingEnabled = false; x.drawImage(qi, 848, 1700, 160, 160);
  }
  return c;
}
async function openPoster() {
  const c = await drawPoster(), url = c.toDataURL('image/png');
  $('#sheet').innerHTML = `<div class="sheet-box"><p class="label">${t('分享海报', 'Share poster')}</p>
    <h2>${t('长按图片保存，或直接分享', 'Long-press to save, or share')}</h2>
    <div class="toggle"><span>${t('海报中包含我的试穿形象', 'Include my try-on image')}</span><button class="switch ${S.posterFace ? 'on' : ''}" data-a="poster-face" aria-label="toggle"></button></div>
    <p>${S.posterFace ? t('海报会带上你的试穿形象，分享前请确认。', 'The poster includes your try-on image — check before sharing.') : t('默认只用商品图，不包含你的形象。', 'By default the poster uses product photos only, without you.')}</p>
    <img class="poster" src="${url}" alt="poster">
    <div class="actions" style="margin:0"><button class="btn primary" data-a="share">${t('分享', 'Share')}</button><button class="btn" data-a="close">${t('关闭', 'Close')}</button></div></div>`;
  $('#sheet').hidden = false; openPoster.canvas = c;
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a;
  if (a === 'lang') { S.lang = S.lang === 'zh' ? 'en' : 'zh'; render(); }
  if (a === 'home') { S.view = 'mine'; render(); }
  if (a === 'detail') { S.view = 'detail'; S.detail = el.dataset.id; render(); }
  if (a === 'coupon') { S.coupon = true; render(); toast(t('已领取，结账时出示即可', 'Claimed — show it at checkout')); }
  if (a === 'staff') toast(t(`取衣单 #${S.sid.slice(-2)}18 已发送，店员会把 ${S.size} 码送到试衣间`, `Request #${S.sid.slice(-2)}18 sent — staff will bring size ${S.size}`));
  if (a === 'poster') openPoster();
  if (a === 'poster-face') { S.posterFace = !S.posterFace; openPoster(); }
  if (a === 'close') $('#sheet').hidden = true;
  if (a === 'share') {
    openPoster.canvas.toBlob(async blob => {
      const file = new File([blob], 'mirrai-look.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'MIRRAI' }); } catch (err) {} }
      else toast(t('当前浏览器不支持直接分享，请长按图片保存', 'Sharing not supported here — long-press the image to save'));
    });
  }
  if (a === 'delete') {
    $('#sheet').innerHTML = `<div class="sheet-box"><p class="label">${t('删除', 'Delete')}</p><h2>${t('删除这次试穿记录？', 'Delete this try-on?')}</h2>
      <p>${t('删除后链接立即失效，无法恢复。', 'The link stops working immediately. This can’t be undone.')}</p>
      <div class="actions" style="margin:16px 0 0"><button class="btn primary" data-a="delete-yes">${t('删除', 'Delete')}</button><button class="btn" data-a="close">${t('取消', 'Cancel')}</button></div></div>`;
    $('#sheet').hidden = false;
  }
  if (a === 'delete-yes') {
    deleted = true; S.img = null;
    try { sessionStorage.setItem(deletedKey, '1'); } catch (err) {}
    fetch(`api/result?sid=${encodeURIComponent(S.sid)}&t=${encodeURIComponent(S.t)}`, { method: 'DELETE' }).catch(() => {});
    $('#sheet').hidden = true; render();
  }
});

// Fetch the customer's own result from tools/server.py; keep polling while the kiosk is still generating.
async function loadRemote() {
  try {
    const r = await fetch(`api/result?sid=${encodeURIComponent(S.sid)}&t=${encodeURIComponent(S.t)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (d.status === 'none') return;
    S.api = true;
    if (d.status === 'ready') { S.img = d.image; S.pending = false; render(); }
    else if (d.status === 'pending') { S.pending = true; render(); setTimeout(loadRemote, 2500); }
    else { S.pending = false; render(); } // error → product photos
  } catch (e) {}
}
if (!deleted && S.t) loadRemote();

// Early handoff without the server (static demo): simulate the look arriving.
if (S.pending) setTimeout(() => { if (!S.api) { S.pending = false; render(); } }, 5000);
render();
