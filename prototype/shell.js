// Demo shell: forwards scenario switches to the kiosk iframe and mirrors its journey + analytics events.
const kiosk = document.getElementById('kiosk');
const send = msg => kiosk.contentWindow.postMessage({ source: 'shell', ...msg }, '*');
const phone = document.getElementById('phone'), phoneFrame = document.getElementById('phoneFrame');
let handoffURL = null, earlyHandoff = false;

function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400); }

document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  send({ type: seg.dataset.kind, value: b.dataset.v });
}));

document.querySelector('.tools').addEventListener('click', e => {
  const tool = e.target.closest('[data-tool]')?.dataset.tool;
  if (tool === 'restart') send({ type: 'restart' });
  if (tool === 'idle') send({ type: 'idleNow' });
  if (tool === 'full') document.getElementById('kioskFrame').requestFullscreen?.();
  if (tool === 'scan') {
    if (!handoffURL) return toast('先在大屏走到「扫码」这一步（或慢速情景的"先扫码"）');
    phoneFrame.src = handoffURL; phone.showModal(); send({ type: 'scanned' });
  }
});
document.getElementById('closePhone').onclick = () => phone.close();

const events = document.getElementById('events');
addEventListener('message', e => {
  const m = e.data || {}; if (m.source !== 'kiosk') return;
  if (m.type === 'step') {
    document.querySelectorAll('#journey li').forEach(li => li.classList.toggle('on', li.dataset.s === m.step));
    if (m.step === 'attract') { handoffURL = null; earlyHandoff = false; }
  }
  if (m.type === 'handoff') { handoffURL = m.url; earlyHandoff = !!m.early; }
  if (m.type === 'api') {
    const el = document.getElementById('apiStatus');
    // Only surfaced when something is wrong; a connected or static (no-server) demo shows nothing.
    el.textContent = '⚠ 生成服务的商品表已过期（服务在改动前启动）：请在终端 Ctrl+C 后重新运行 python3 tools/server.py';
    el.classList.add('warn');
    el.hidden = !m.stale;
  }
  if (m.type === 'event') {
    events.querySelector('.muted')?.remove();
    const li = document.createElement('li');
    const data = Object.keys(m.data || {}).length ? ' ' + JSON.stringify(m.data) : '';
    li.textContent = `${new Date().toLocaleTimeString('en-GB')} ${m.name}${data}`;
    events.prepend(li);
    while (events.children.length > 30) events.lastChild.remove();
  }
});
