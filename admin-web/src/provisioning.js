import { BrowserFlasher, serialUnavailable, wrongPortReason } from './web-serial.js';

/** USB belongs to the computer running this browser. */
const STEPS = [
  ['READING_MAC', 'Đọc MAC'],
  ['BINDING', 'Gắn chip'],
  ['BROKER', 'Tạo tài khoản MQTT'],
  ['FLASHING', 'Ghi firmware (≈1 phút)'],
  ['PROVISIONING', 'Nạp danh tính'],
  ['VERIFYING', 'Kiểm tra'],
  ['DONE', 'Hoàn tất'],
];
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function progress(job) {
  const current = job.stage === 'FAILED' ? job.failedAt : job.stage;
  const index = STEPS.findIndex(([key]) => key === current);
  return `<ol class="flash-steps">${STEPS.map(([key, label], i) => {
    const state = job.stage === 'DONE' || i < index ? 'done' : i === index ? (job.stage === 'FAILED' ? 'failed' : 'active') : '';
    const mark = state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'active' ? '●' : '○';
    return `<li class="${state}" data-step="${key}"><span aria-hidden="true">${mark}</span>${esc(label)}</li>`;
  }).join('')}</ol>`;
}

/**
 * @param api      (path, method?, body?) => Promise<json>
 * @param device   InventoryView của thiết bị cần nạp
 * @param releases danh sách ReleaseView; chỉ bản `flashable` được chọn
 * @param onDone   nhận Issued (QR bàn giao) khi job DONE
 * @param onBusy   báo app tạm dừng làm mới trong lúc nạp
 */
export function openFlashDialog(api, device, releases, onDone, onBusy = () => {}) {
  const flashable = releases.filter((r) => r.flashable);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'flash-heading');
  dialog.innerHTML = `<div class="dialog-title"><h2 id="flash-heading">Nạp code · ${esc(device.name)}</h2></div>
    <p>Cắm ESP32-S3 vào <b>máy đang mở trang admin này</b>. Toàn bộ flash của chip sẽ bị xoá rồi ghi firmware và danh tính mới. Đóng Serial Monitor trước khi nạp và giữ trang mở đến khi hoàn tất.</p>
    <form class="stack">
      <div class="actions"><button type="button" class="secondary scan">Quét lại cổng USB</button>
        <button type="button" class="secondary find">Chọn cổng USB</button>
        <select name="port" aria-label="Cổng USB trên máy này" required><option value="">Chọn cổng USB</option></select></div>
      <p class="usb-status" role="status" aria-live="polite"></p>
      <label>Bản firmware có factory image
        <select name="releaseId" required>${flashable.map((r) => `<option value="${r.id}">${esc(r.label)} · ${esc(r.version)}</option>`).join('')}</select></label>
      ${flashable.length ? '' : '<div class="notice">Chưa có bản firmware kèm factory image. Vào Cập nhật firmware để phát hành bản có factory image.</div>'}
      <label>Mật khẩu tài khoản hiện tại<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="usb-reconnect notice" hidden><p></p><button type="button" class="secondary reconnect">Chọn cổng sau reset để tiếp tục</button></div>
      <div class="flash-progress" hidden></div>
      <div class="error" role="alert" hidden></div>
      <div class="actions"><button type="button" class="secondary cancel">Đóng</button><button type="submit" class="start">Bắt đầu nạp</button></div>
    </form>`;
  document.body.append(dialog);
  dialog.showModal();
  const form = dialog.querySelector('form');
  const port = form.elements.port, status = dialog.querySelector('.usb-status'), error = dialog.querySelector('.error');
  const start = dialog.querySelector('.start'), panel = dialog.querySelector('.flash-progress');
  const reconnectPanel = dialog.querySelector('.usb-reconnect'), reconnectButton = dialog.querySelector('.reconnect');
  let busy = false, ports = [], sessionId = null, verified = null, stage = 'READING_MAC';
  let scanVersion = 0, choosingPort = false, stopped = false;
  let cancelReconnect = null;
  const scanButton = dialog.querySelector('.scan'), chooseButton = dialog.querySelector('.find');
  const unavailable = serialUnavailable();
  const refreshStart = () => { start.disabled = busy || !!unavailable || !flashable.length || (!verified && !port.value); };
  const lock = (value) => {
    busy = value; onBusy(value);
    form.querySelectorAll('button,select,input').forEach((el) => { el.disabled = value; });
    scanButton.disabled = value || !!unavailable || !!verified;
    chooseButton.disabled = value || !!unavailable || !!verified;
    refreshStart();
    if (verified) {
      form.elements.password.required = false;
      form.elements.password.disabled = true;
      form.elements.releaseId.disabled = true;
      port.disabled = true;
      dialog.querySelector('.find').disabled = true;
    }
  };
  const renderStage = (next, message = 'Đang nạp, đừng rút cáp USB.') => {
    stage = next; panel.hidden = false;
    panel.innerHTML = progress({ stage }) + `<p class="notice">${esc(message)}</p>`;
  };
  const showPorts = (available, selected) => {
    ports = available;
    port.replaceChildren(new Option('Chọn cổng USB', ''));
    ports.forEach((p, index) => {
      const info = p.getInfo();
      port.add(new Option(`USB ${index + 1} · VID ${info.usbVendorId?.toString(16) || '?'} / PID ${info.usbProductId?.toString(16) || '?'}`, String(index)));
    });
    const index = ports.indexOf(selected);
    if (index >= 0) port.value = String(index);
    else if (ports.length === 1) port.value = '0';
    refreshStart();
  };
  port.onchange = refreshStart;
  refreshStart();
  const scanStatus = () => {
    status.textContent = ports.length === 1
      ? 'Đã tự tìm thấy và chọn 1 cổng USB trên máy này. Kiểm tra đúng ESP32-S3 trước khi nạp.'
      : ports.length > 1
        ? `Tìm thấy ${ports.length} cổng USB. Chọn đúng ESP32-S3 trong danh sách.`
        : 'Đang tự quét USB trên máy này. Cắm ESP32-S3; nếu chưa cấp quyền, bấm Chọn cổng USB một lần.';
  };
  // getPorts never opens a port or resets a chip. Only granted ports are visible.
  const scan = async (force = false) => {
    if (stopped || unavailable || busy || verified || choosingPort || !dialog.isConnected) return;
    const version = ++scanVersion;
    try {
      const available = (await navigator.serial.getPorts()).filter((p) => p.connected !== false);
      if (version !== scanVersion || stopped || !dialog.isConnected || busy || verified || choosingPort) return;
      const changed = available.length !== ports.length || available.some((p, i) => p !== ports[i]);
      if (changed || force) {
        const selected = port.value === '' ? null : ports[Number(port.value)];
        showPorts(available, selected);
        scanStatus();
      }
    } catch {
      if (version === scanVersion && !stopped && dialog.isConnected && !busy && !verified && !choosingPort)
        status.textContent = 'Chưa quét được USB. Bấm Quét lại cổng USB hoặc kiểm tra quyền trình duyệt.';
    }
  };
  status.textContent = unavailable || 'Đang tự quét cổng USB trên máy này…';
  scanButton.disabled = chooseButton.disabled = !!unavailable;
  scanButton.onclick = () => scan(true);
  const onConnect = () => { void scan(true); };
  const onDisconnect = (event) => {
    if (busy || verified || choosingPort) return;
    const disconnected = event.port || event.target;
    const selected = port.value === '' ? null : ports[Number(port.value)];
    showPorts(ports.filter((p) => p !== disconnected && p.connected !== false), selected);
    scanStatus();
    void scan(true);
  };
  if (!unavailable) {
    navigator.serial.addEventListener('connect', onConnect);
    navigator.serial.addEventListener('disconnect', onDisconnect);
    void scan(true);
  }
  const scanTimer = unavailable ? null : setInterval(() => { void scan(); }, 1500);
  const preventUnload = (event) => { if (busy || verified) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', preventUnload);
  const cleanup = () => {
    stopped = true;
    cancelReconnect?.();
    ++scanVersion;
    clearInterval(scanTimer);
    observer.disconnect();
    navigator.serial?.removeEventListener('connect', onConnect);
    navigator.serial?.removeEventListener('disconnect', onDisconnect);
    window.removeEventListener('beforeunload', preventUnload);
  };
  // The app also removes dialogs when login expires, outside this component.
  const observer = new MutationObserver(() => { if (!dialog.isConnected) cleanup(); });
  observer.observe(document.body, { childList: true });
  const remove = () => { cleanup(); dialog.remove(); };
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); else remove(); });
  dialog.querySelector('.cancel').onclick = () => { if (!busy) remove(); };
  dialog.querySelector('.find').onclick = async () => {
    choosingPort = true;
    ++scanVersion;
    scanButton.disabled = chooseButton.disabled = true;
    try {
      const selected = await navigator.serial.requestPort();
      const available = (await navigator.serial.getPorts()).filter((p) => p.connected !== false);
      if (stopped || !dialog.isConnected) return;
      showPorts(available, selected);
      status.textContent = 'Đã chọn USB trên máy này. Có thể bắt đầu nạp.';
    } catch (err) {
      status.textContent = err.name === 'NotFoundError' ? 'Chưa chọn cổng USB. Bấm Chọn cổng USB để thử lại.' : 'Không truy cập được USB. Kiểm tra quyền trình duyệt rồi thử lại.';
    } finally {
      choosingPort = false;
      scanButton.disabled = chooseButton.disabled = !!unavailable || busy || !!verified;
    }
  };
  const reconnect = (message) => new Promise((resolve, reject) => {
    reconnectPanel.hidden = false;
    reconnectPanel.querySelector('p').textContent = `${message} Firmware đã ghi xong; chọn lại cổng để tiếp tục, không cần nạp lại.`;
    reconnectButton.disabled = false;
    const finish = () => {
      clearTimeout(timer);
      reconnectPanel.hidden = true;
      reconnectButton.disabled = true;
      reconnectButton.onclick = null;
      cancelReconnect = null;
    };
    const timer = setTimeout(() => { finish(); reject(Error('Hết thời gian chờ chọn cổng USB sau reset.')); }, 120000);
    cancelReconnect = () => { finish(); reject(Error('Hộp thoại nạp đã đóng.')); };
    reconnectButton.onclick = async () => {
      reconnectButton.disabled = true;
      try {
        // Permission requests must run directly in a real click handler.
        const selected = await navigator.serial.requestPort();
        if (!dialog.isConnected) return;
        finish();
        resolve(selected);
      } catch (error) {
        reconnectPanel.querySelector('p').textContent = error.name === 'NotFoundError'
          ? 'Chưa chọn cổng. Thả BOOT, nhấn RESET rồi chọn lại cổng của ESP32-S3 để tiếp tục.'
          : 'Không mở được hộp thoại USB. Kiểm tra quyền trình duyệt rồi chọn lại.';
        reconnectButton.disabled = false;
      }
    };
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    error.hidden = true;
    const body = Object.fromEntries(new FormData(form));
    form.elements.password.value = '';
    lock(true);
    let flasher;
    try {
      if (!verified) {
        if (sessionId) {
          await api(`/api/admin/browser-flash/${encodeURIComponent(sessionId)}`, 'DELETE');
          sessionId = null;
        }
        const selected = ports[Number(body.port)];
        if (!selected || body.port === '') throw Error('Chọn cổng USB trước khi nạp.');
        const portProblem = wrongPortReason(selected);
        if (portProblem) throw Error(portProblem);
        flasher = new BrowserFlasher(selected);
        renderStage('READING_MAC', 'Đang kết nối ESP32-S3. Nếu cần, giữ BOOT rồi nhấn RESET.');
        const factoryMac = await flasher.readMac();
        renderStage('BINDING', 'Đang gắn chip và tạo tài khoản MQTT…');
        const session = await api(`/api/admin/inventory/${encodeURIComponent(device.deviceId)}/browser-flash`, 'POST',
          { factoryMac, releaseId: Number(body.releaseId), password: body.password });
        body.password = '';
        sessionId = session.jobId;
        renderStage('FLASHING', 'Đang tải factory image…');
        const image = await api(`/api/admin/browser-flash/${encodeURIComponent(sessionId)}/image`);
        await flasher.flash(image, session.imageSha256, (percent) => renderStage('FLASHING', `Đang ghi firmware: ${percent}%. Đừng rút cáp USB.`));
        renderStage('PROVISIONING');
        verified = await flasher.provision(session.payload, () => renderStage('VERIFYING'), reconnect);
        session.payload = null;
      }
      renderStage('VERIFYING', 'Chip đã xác nhận danh tính. Đang lưu kết quả lên máy chủ…');
      const job = await api(`/api/admin/browser-flash/${encodeURIComponent(sessionId)}/complete`, 'POST', verified);
      panel.innerHTML = progress(job);
      verified = null; sessionId = null;
      lock(false);
      remove();
      onDone(job.result);
    } catch (err) {
      if (sessionId && !verified) {
        try { await api(`/api/admin/browser-flash/${encodeURIComponent(sessionId)}`, 'DELETE'); sessionId = null; }
        catch { /* server expires abandoned sessions after 15 minutes */ }
      }
      panel.innerHTML = progress({ stage: 'FAILED', failedAt: stage });
      error.textContent = verified ? `Chip đã nạp xong nhưng chưa lưu được kết quả: ${err.message} Bấm Xác nhận hoàn tất để thử lưu lại.` : err.message;
      error.hidden = false;
      start.textContent = verified ? 'Xác nhận hoàn tất' : 'Thử nạp lại';
    } finally {
      body.password = '';
      try { await flasher?.close(); } catch { /* port already closed or chip rebooted */ }
      lock(false);
    }
  };
  return dialog;
}
