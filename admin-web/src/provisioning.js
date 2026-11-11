/** "Nạp code": USB nằm trên máy chạy backend, kể cả khi admin mở web qua Tailscale. */
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
    <p>Cắm ESP32-S3 vào <b>máy chạy backend</b>. Toàn bộ flash của chip sẽ bị xoá rồi ghi firmware và danh tính mới. Đóng Serial Monitor trước khi nạp.</p>
    <form class="stack">
      <div class="actions"><button type="button" class="secondary find">Tìm cổng USB</button>
        <select name="port" aria-label="Cổng USB máy backend" required><option value="">Chọn cổng USB</option></select></div>
      <p class="usb-status" role="status" aria-live="polite"></p>
      <label>Bản firmware có factory image
        <select name="releaseId" required>${flashable.map((r) => `<option value="${r.id}">${esc(r.label)} · ${esc(r.version)}</option>`).join('')}</select></label>
      ${flashable.length ? '' : '<div class="notice">Chưa có bản firmware kèm factory image. Vào Cập nhật firmware để phát hành bản có factory image.</div>'}
      <label>Mật khẩu tài khoản hiện tại<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="flash-progress" hidden></div>
      <div class="error" role="alert" hidden></div>
      <div class="actions"><button type="button" class="secondary cancel">Đóng</button><button type="submit" class="start">Bắt đầu nạp</button></div>
    </form>`;
  document.body.append(dialog);
  dialog.showModal();
  const form = dialog.querySelector('form');
  const port = form.elements.port, status = dialog.querySelector('.usb-status'), error = dialog.querySelector('.error');
  const start = dialog.querySelector('.start'), panel = dialog.querySelector('.flash-progress');
  let busy = false;
  const lock = (value) => {
    busy = value; onBusy(value);
    form.querySelectorAll('button,select,input').forEach((el) => { el.disabled = value; });
  };
  start.disabled = !flashable.length;
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); else dialog.remove(); });
  dialog.querySelector('.cancel').onclick = () => { if (!busy) dialog.remove(); };
  dialog.querySelector('.find').onclick = async () => {
    status.textContent = 'Đang tìm cổng USB trên máy chạy backend…';
    port.replaceChildren(new Option('Chọn cổng USB', ''));
    try {
      const response = await api('/api/admin/usb/ports');
      if (!response.enabled) {
        status.textContent = 'Máy chủ chưa bật USB (backend chạy trong Docker?). Dùng công cụ CLI hoặc chạy backend trực tiếp trên máy cắm chip.';
        start.disabled = true; return;
      }
      for (const p of response.ports) port.add(new Option(`${p.device} · ${p.description}`, p.device));
      if (response.ports.length === 1) port.value = response.ports[0].device;
      status.textContent = response.ports.length ? 'Chọn đúng cổng của ESP32-S3.' : 'Không thấy cổng USB. Cắm ESP32-S3 vào máy chạy backend rồi tìm lại.';
    } catch (err) { status.textContent = err.message; }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    error.hidden = true;
    const body = Object.fromEntries(new FormData(form));
    form.elements.password.value = '';
    lock(true);
    try {
      let job = await api(`/api/admin/inventory/${encodeURIComponent(device.deviceId)}/flash`, 'POST',
        { port: body.port, releaseId: Number(body.releaseId), password: body.password });
      panel.hidden = false;
      while (!['DONE', 'FAILED'].includes(job.stage)) {
        panel.innerHTML = progress(job) + '<p class="notice">Đang nạp, đừng rút cáp USB.</p>';
        await new Promise((resolve) => setTimeout(resolve, 1500));
        job = await api(`/api/admin/provisioning-jobs/${encodeURIComponent(job.jobId)}`);
      }
      panel.innerHTML = progress(job);
      if (job.stage === 'FAILED') throw Error(job.error || 'Nạp code thất bại; thử lại.');
      lock(false);
      dialog.remove();
      onDone(job.result);
    } catch (err) {
      error.textContent = err.message; error.hidden = false;
      lock(false);
      start.textContent = 'Thử nạp lại';
    }
  };
  return dialog;
}
