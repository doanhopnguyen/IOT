import { wireUsbReader } from './usb';
import { icon } from './icons';
import QRCode from 'qrcode';

const root = document.querySelector('#app');
let csrf = '',
  account = null,
  tab = 'overview',
  inventory = [],
  accounts = [],
  issued = null,
  poll,
  dashboard = null;
let usbBusy = false,
  refreshing = false,
  loaded = false,
  loadError = '',
  lastUpdated = null;
const ACCOUNT_PAGE_SIZE = 10;
let accountPage = 1;
const filters = {
  devices: { query: '', state: '', connection: '' },
  accounts: { query: '', state: '', role: '' },
};
const tabs = [
  ['overview', 'Tổng quan', 'grid'],
  ['devices', 'Danh mục cửa', 'door'],
  ['accounts', 'Tài khoản', 'users'],
  ['new', 'Đăng ký chip & QR', 'chip'],
];
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const online = (device) =>
  Boolean(device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 90000);
const date = (value) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : 'Chưa có kết nối';
const stateLabels = {
  INVENTORY: ['Chưa nhận cửa', 'blue'],
  CLAIMED: ['Đang thiết lập', 'amber'],
  ACTIVE: ['Đang hoạt động', 'green'],
  RESETTING: ['Đang đặt lại', 'red'],
  REGISTERED: ['Đã đăng ký', 'blue'],
  PROVISIONED: ['Đã cấp phát', 'blue'],
  MAINTENANCE: ['Bảo trì', 'amber'],
  SUSPENDED: ['Tạm ngưng', 'red'],
  DECOMMISSIONED: ['Ngừng sử dụng', ''],
};
const badge = (label, tone = '', dot = false) =>
  `<span class="badge ${tone}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;
const stateBadge = (state) => badge(...(stateLabels[state] || [state, '']));
const brand = () =>
  `<div class="brand"><span class="brand-icon">${icon('brand-mark')}</span><span>Smart Door</span></div>`;
const empty = (title, description, symbol = 'search', action = '') =>
  `<div class="empty"><span class="empty-icon">${icon(symbol)}</span><h3>${title}</h3><p>${description}</p>${action}</div>`;
const loading = () =>
  '<div class="loading" role="status"><span class="spinner"></span>Đang tải dữ liệu hệ thống…</div>';

async function token() {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!response.ok) throw Error('Không kết nối được phiên đăng nhập. Vui lòng thử lại.');
  csrf = (await response.json()).token;
}
async function api(path, method = 'GET', body) {
  if (method !== 'GET' && !csrf) await token();
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(method === 'GET' ? {} : { 'X-CSRF-TOKEN': csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && account) {
      account = null;
      csrf = '';
      issued = null;
      loaded = false;
      clearInterval(poll);
      document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
      login('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    const fallback =
      response.status === 401
        ? 'Email, số điện thoại hoặc mật khẩu chưa đúng.'
        : response.status === 403
          ? 'Bạn không có quyền thực hiện hoặc phiên xác thực đã thay đổi. Vui lòng đăng nhập lại.'
          : `Không thực hiện được yêu cầu (${response.status}).`;
    const message = result.message || result.detail;
    throw Error(
      !message ||
        [
          'Authentication required',
          'Bad credentials',
          'Access denied or invalid CSRF token',
        ].includes(message)
        ? fallback
        : message,
    );
  }
  return response.status === 204 ? null : response.json();
}
function notify(message, error = false) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${error ? 'error' : 'success'}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `${icon(error ? 'alert' : 'check')}<span>${esc(message)}</span><button aria-label="Đóng thông báo">${icon('close')}</button>`;
  el.querySelector('button').onclick = () => el.remove();
  document.body.append(el);
  setTimeout(() => el.remove(), error ? 12000 : 6500);
}
function login(error = '') {
  root.innerHTML = `<div class="login-page"><div class="login-image"><img src="./assets/smart-door-login-hero.webp" alt="Cửa gỗ với thiết bị khóa thông minh" fetchpriority="high" decoding="async"></div><main class="login-main"><div class="login-content"><div class="login-brand">${brand()}</div><h1>Đăng nhập</h1><form id="login" class="stack login-form"><label for="identifier">Email hoặc số điện thoại</label><input id="identifier" name="identifier" autocomplete="username" required><label for="password">Mật khẩu</label><div class="password-field"><input id="password" name="password" type="password" autocomplete="current-password" required><button type="button" id="show-password" class="icon-button" aria-label="Hiện mật khẩu" aria-pressed="false">${icon('eye')}</button></div><div id="login-error" class="error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</div><button id="login-submit" type="submit">Đăng nhập</button></form></div></main></div>`;
  document.querySelector('#identifier').focus({ preventScroll: true });
  document.querySelector('#show-password').onclick = (event) => {
    const input = document.querySelector('#password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    event.currentTarget.setAttribute('aria-pressed', String(show));
  };
  document.querySelector('#login').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const errorEl = document.querySelector('#login-error');
    button.disabled = true;
    button.textContent = 'Đang đăng nhập…';
    errorEl.hidden = true;
    try {
      await token();
      const result = await api(
        '/api/auth/login',
        'POST',
        Object.fromEntries(new FormData(event.target)),
      );
      account = result;
      await token();
      if (!account.admin) {
        await api('/api/auth/logout', 'POST');
        account = null;
        throw Error(
          'Tài khoản này không có quyền quản trị hệ thống. Vui lòng sử dụng ứng dụng Smart Door.',
        );
      }
      loaded = false;
      tab = 'overview';
      render();
      await refresh(true);
      startPolling();
    } catch (err) {
      if (errorEl.isConnected) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        const field = document.querySelector('[name="identifier"]')?.value.trim()
          ? document.querySelector('#password')
          : document.querySelector('#identifier');
        field?.focus({ preventScroll: true });
      } else notify(err.message, true);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = 'Đăng nhập';
      }
    }
  };
}
function startPolling() {
  clearInterval(poll);
  poll = setInterval(() => {
    void refresh();
  }, 10000);
}
async function refresh(force = false) {
  if (
    !account ||
    refreshing ||
    usbBusy ||
    document.querySelector('dialog[open]') ||
    (!force && (document.activeElement?.matches('input,select') || issued))
  )
    return;
  refreshing = true;
  const button = document.querySelector('#reload');
  if (button) button.disabled = true;
  try {
    const result = await Promise.all([
      api('/api/admin/inventory'),
      api('/api/admin/accounts'),
      api('/api/admin/dashboard').catch(() => null),
    ]);
    if (!account) return;
    [inventory, accounts, dashboard] = result;
    loaded = true;
    loadError = '';
    lastUpdated = new Date();
    if (tab !== 'new' && !issued) render();
    else updateNotice();
  } catch (err) {
    loadError = err.message;
    if (account) {
      if (!loaded && tab !== 'new') render();
      else updateNotice();
    }
  } finally {
    refreshing = false;
    const reload = document.querySelector('#reload');
    if (reload) reload.disabled = false;
  }
}
function updateNotice() {
  const el = document.querySelector('#load-error');
  if (!el) return;
  el.hidden = !loadError;
  el.textContent = loadError
    ? `${loadError}${loaded ? ' Dữ liệu bên dưới là lần cập nhật gần nhất.' : ''}`
    : '';
}
async function navigate(next) {
  if (next === tab) return;
  if (
    issued &&
    !(await confirmAction(
      'Bạn đã lưu thông tin bàn giao?',
      'Thông tin riêng chỉ hiển thị một lần. Hãy tải file cấp phát và lưu QR trước khi chuyển màn hình.',
      'Đã lưu, tiếp tục',
    ))
  )
    return;
  tab = next;
  issued = null;
  render();
}
function render() {
  if (!account) return;
  root.innerHTML = `<div class="shell"><aside><div class="sidebar-brand">${brand()}</div><nav class="nav" aria-label="Điều hướng chính">${tabs.map(([key, label, symbol]) => `<button data-tab="${key}" class="${tab === key ? 'active' : ''}" ${tab === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}</nav><div class="foot"><div class="account-mini"><span class="account-avatar" aria-hidden="true">${esc((account.fullName || '').trim().normalize('NFC').split(/\s+/).at(-1)?.charAt(0).toLocaleUpperCase('vi') || '?')}</span><div class="name">${esc(account.fullName)}</div></div><button id="logout" class="logout">${icon('logout')} Đăng xuất</button></div></aside><div class="workspace"><main><header class="bar"><h1>${tab === 'overview' ? 'Tổng quan hệ thống' : tab === 'devices' ? 'Danh mục thiết bị' : tab === 'accounts' ? 'Quản lý tài khoản' : 'Đăng ký chip & QR'}</h1><div class="bar-actions"><button id="reload" class="secondary" aria-label="Làm mới dữ liệu">${icon('refresh')}<span>Làm mới</span></button>${tab !== 'new' ? `<button data-tab="new" aria-label="Đăng ký chip mới">${icon('plus')}<span>Đăng ký chip</span></button>` : ''}</div></header><div id="load-error" class="error page-notice" role="alert" hidden></div><div id="content">${content()}</div></main></div></div>`;
  updateNotice();
  document
    .querySelectorAll('[data-tab]')
    .forEach((button) => (button.onclick = () => navigate(button.dataset.tab)));
  document.querySelector('#logout').onclick = async (event) => {
    const logoutButton = event.currentTarget;
    if (
      issued &&
      !(await confirmAction(
        'Rời thông tin bàn giao?',
        'Hãy tải file cấp phát và lưu QR trước khi đăng xuất. Thông tin riêng chỉ hiển thị một lần.',
        'Đăng xuất',
      ))
    )
      return;
    logoutButton.disabled = true;
    try {
      await api('/api/auth/logout', 'POST');
      account = null;
      csrf = '';
      issued = null;
      loaded = false;
      clearInterval(poll);
      login();
    } catch (err) {
      notify(err.message, true);
      if (logoutButton.isConnected) logoutButton.disabled = false;
    }
  };
  document.querySelector('#reload').onclick = () => {
    if (issued) notify('Hãy lưu thông tin bàn giao trước khi chuyển màn hình.');
    else void refresh(true);
  };
  document.querySelector('#register')?.addEventListener('submit', register);
  if (tab === 'new')
    wireUsbReader(api, (value) => {
      usbBusy = value;
    });
  wireFilters();
  wireRows();
  if (issued) showIssued();
}
function content() {
  if (tab === 'new') return registration();
  if (!loaded)
    return `<section class="panel">${loadError ? empty('Chưa tải được dữ liệu', 'Kiểm tra kết nối rồi bấm Làm mới.', 'alert') : loading()}</section>`;
  if (tab === 'accounts')
    return `<section class="panel"><div class="section-header"><div class="account-summary"><h2>Tài khoản hệ thống</h2><strong class="account-total" aria-label="${accounts.length} tài khoản">${accounts.length}</strong></div></div>${filterBar('accounts')}<div id="results">${accountTable()}</div></section>`;
  const heading = tab === 'overview' ? 'Thiết bị trong hệ thống' : 'Tất cả thiết bị';
  const table = `<section class="panel"><div class="section-header"><div><h2>${heading} <span class="count">${inventory.length}</span></h2></div>${tab === 'overview' ? '<button data-tab="devices" class="link-button">Xem tất cả ' + icon('arrow') + '</button>' : ''}</div>${filterBar('devices')}<div id="results">${deviceTable()}</div></section>`;
  if (tab !== 'overview') return table;
  const live = dashboard?.online ?? inventory.filter(online).length;
  const metrics = [
    ['door', 'Tổng thiết bị', inventory.length, '', ''],
    ['wifi', 'Đang trực tuyến', live, 'Có tín hiệu trong 90 giây', 'green'],
    [
      'clock',
      'Đang thiết lập',
      inventory.filter((d) => d.state === 'CLAIMED').length,
      'Đã có chủ, chờ hoàn tất',
      'amber',
    ],
    [
      'users',
      'Tổng tài khoản',
      accounts.length,
      `${accounts.filter((a) => a.status === 'ACTIVE').length} tài khoản hoạt động`,
      '',
    ],
  ];
  if (dashboard)
    metrics.push(
      ['alert', 'Cảnh báo đang mở', dashboard.openAlerts, '', ''],
      [
        'alert',
        'Cảnh báo nghiêm trọng',
        dashboard.criticalAlerts,
        '',
        dashboard.criticalAlerts ? 'red' : '',
      ],
      [
        'clock',
        'Lượt vào hôm nay',
        dashboard.accessToday.granted,
        `Từ chối ${dashboard.accessToday.denied}`,
        '',
      ],
      ['wifi', 'Thiết bị ngoại tuyến', dashboard.offline, '', ''],
    );
  return `<div class="metrics">${metrics.map(([symbol, label, value, note, tone]) => `<article class="panel metric ${tone === 'red' ? 'critical' : ''}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(symbol)}</span></div><b>${value}</b><small>${note}</small></article>`).join('')}</div>${table}`;
}
function filterBar(kind) {
  const f = filters[kind];
  const options =
    kind === 'accounts'
      ? [
          ['ACTIVE', 'Đang hoạt động'],
          ['DISABLED', 'Đã khóa'],
        ]
      : [...new Set(inventory.map((d) => d.state))].map((state) => [
          state,
          stateLabels[state]?.[0] || state,
        ]);
  return `<div class="toolbar"><div class="search">${icon('search')}<input id="search" aria-label="${kind === 'accounts' ? 'Tìm tài khoản' : 'Tìm thiết bị'}" placeholder="${kind === 'accounts' ? 'Tìm tên, email hoặc số điện thoại…' : 'Tìm tên thiết bị, UID hoặc chủ cửa…'}" value="${esc(f.query)}"></div><select id="state-filter" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option>${options.map(([key, label]) => `<option value="${esc(key)}" ${f.state === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><select id="extra-filter" aria-label="${kind === 'accounts' ? 'Lọc vai trò' : 'Lọc kết nối'}">${(kind ===
  'accounts'
    ? [
        ['', 'Tất cả vai trò'],
        ['admin', 'Quản trị viên'],
        ['user', 'Người dùng'],
      ]
    : [
        ['', 'Tất cả kết nối'],
        ['online', 'Trực tuyến'],
        ['offline', 'Ngoại tuyến'],
      ]
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${(kind === 'accounts' ? f.role : f.connection) === key ? 'selected' : ''}>${label}</option>`,
    )
    .join('')}</select></div>`;
}
function footer(count, total) {
  return `<div class="table-footer"><span>Hiển thị ${count} / ${total} ${tab === 'accounts' ? 'tài khoản' : 'thiết bị'}</span><span>Cập nhật ${lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>`;
}
function deviceTable() {
  const f = filters.devices;
  const q = f.query.trim().toLocaleLowerCase('vi');
  const rows = inventory.filter(
    (d) =>
      `${d.name} ${d.deviceUid} ${d.factoryMac ?? ''} ${d.owner ?? ''}`
        .toLocaleLowerCase('vi')
        .includes(q) &&
      (!f.state || d.state === f.state) &&
      (!f.connection || online(d) === (f.connection === 'online')),
  );
  if (!rows.length)
    return empty(
      inventory.length ? 'Không tìm thấy thiết bị' : 'Bắt đầu với thiết bị đầu tiên',
      inventory.length
        ? 'Thử tên khác hoặc thay đổi bộ lọc.'
        : 'Đăng ký chip để tạo mã nhận cửa và QR bàn giao.',
      'chip',
      inventory.length ? '' : '<button data-tab="new">' + icon('plus') + ' Đăng ký chip</button>',
    );
  return `<p class="scroll-hint">Vuốt ngang bảng để xem đủ thông tin và thao tác.</p><div class="tablewrap" role="region" aria-label="Danh sách thiết bị" tabindex="0"><table><thead><tr><th>Thiết bị / định danh</th><th>Chủ cửa</th><th>Trạng thái cấp phát</th><th>Kết nối</th><th>Thao tác</th></tr></thead><tbody>${rows.map((d) => `<tr><td><div class="device-cell"><span class="device-symbol">${icon('door')}</span><div><b>${esc(d.name)}</b><code>${esc(d.deviceUid)}</code></div></div></td><td>${esc(d.owner || 'Chưa bàn giao')}<small>${d.unitId ? 'Đã nhận vào tài khoản' : 'Đang trong danh mục'}</small></td><td>${stateBadge(d.state)}<small>${d.setupReady ? 'Thiết lập đã hoàn tất' : 'Chưa xác nhận sẵn sàng'}</small></td><td><span class="connection ${online(d) ? 'online' : ''}"><span class="dot"></span>${online(d) ? 'Trực tuyến' : 'Ngoại tuyến'}</span><small>${date(d.lastSeenAt)}</small></td><td class="actions">${d.unitId ? `<button class="danger-outline" data-reset="${esc(d.deviceUid)}">Đặt lại / Chuyển giao</button>` : d.operationUuid ? `<button class="secondary" data-code="${esc(d.deviceUid)}">Cấp mã mới</button>` : '<small>Mã đã cấp khi đăng ký</small>'}</td></tr>`).join('')}</tbody></table></div>${footer(rows.length, inventory.length)}`;
}
function accountPagination(pageCount) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (page) =>
      pageCount <= 7 || page === 1 || page === pageCount || Math.abs(page - accountPage) <= 1,
  );
  return `<nav class="pagination" aria-label="Phân trang tài khoản"><button class="secondary" data-account-page="previous" ${accountPage === 1 ? 'disabled' : ''}>Trước</button>${pages.map((page, i) => `${i > 0 && page - pages[i - 1] > 1 ? '<span class="pagination-ellipsis" aria-hidden="true">…</span>' : ''}<button class="secondary page-number" data-account-page="${page}" aria-label="Trang ${page}" ${page === accountPage ? 'aria-current="page"' : ''}>${page}</button>`).join('')}<button class="secondary" data-account-page="next" ${accountPage === pageCount ? 'disabled' : ''}>Sau</button><span class="sr-only" role="status" aria-live="polite">Trang ${accountPage} / ${pageCount}</span></nav>`;
}
function accountTable() {
  const f = filters.accounts;
  const q = f.query.trim().toLocaleLowerCase('vi');
  const rows = accounts.filter(
    (a) =>
      `${a.fullName} ${a.email ?? ''} ${a.phone ?? ''}`.toLocaleLowerCase('vi').includes(q) &&
      (!f.state || a.status === f.state) &&
      (!f.role || Boolean(a.admin) === (f.role === 'admin')),
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / ACCOUNT_PAGE_SIZE));
  accountPage = Math.max(1, Math.min(accountPage, pageCount));
  const pageRows = rows.slice(
    (accountPage - 1) * ACCOUNT_PAGE_SIZE,
    accountPage * ACCOUNT_PAGE_SIZE,
  );
  const pagination = accountPagination(pageCount);
  if (!rows.length)
    return (
      empty('Không tìm thấy tài khoản', 'Thử tên, email hoặc bộ lọc khác.', 'users') + pagination
    );
  return `<p class="scroll-hint">Vuốt ngang bảng để xem đủ thông tin và thao tác.</p><div class="tablewrap" role="region" aria-label="Danh sách tài khoản" tabindex="0"><table class="accounts-table"><thead><tr><th scope="col">Tài khoản</th><th scope="col">Thông tin liên hệ</th><th scope="col">Vai trò hệ thống</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>${pageRows.map((a) => `<tr><td><div class="person-cell"><div><b>${esc(a.fullName)}</b></div></div></td><td>${esc(a.email || 'Chưa có email')}<small>${esc(a.phone || 'Chưa có số điện thoại')}</small></td><td>${badge(a.admin ? 'Quản trị viên' : 'Người dùng', a.admin ? 'blue' : '')}</td><td>${badge(a.status === 'ACTIVE' ? 'Đang hoạt động' : a.status === 'DISABLED' ? 'Đã khóa' : a.status, a.status === 'ACTIVE' ? 'green' : 'red', true)}</td><td class="actions">${a.accountId !== account.accountId ? `<button class="${a.status === 'ACTIVE' ? 'danger-outline' : 'secondary'}" data-status="${a.accountId}" data-next="${a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'}">${icon(a.status === 'ACTIVE' ? 'lock' : 'check')}${a.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở tài khoản'}</button>` : badge('Bạn đang đăng nhập', 'blue')}</td></tr>`).join('')}</tbody></table></div>${pagination}`;
}
function wireFilters() {
  const kind = tab === 'accounts' ? 'accounts' : 'devices';
  const f = filters[kind];
  const update = () => {
    if (kind === 'accounts') accountPage = 1;
    document.querySelector('#results').innerHTML =
      kind === 'accounts' ? accountTable() : deviceTable();
    wireRows();
  };
  document.querySelector('#search')?.addEventListener('input', (event) => {
    f.query = event.target.value;
    update();
  });
  document.querySelector('#state-filter')?.addEventListener('change', (event) => {
    f.state = event.target.value;
    update();
  });
  document.querySelector('#extra-filter')?.addEventListener('change', (event) => {
    f[kind === 'accounts' ? 'role' : 'connection'] = event.target.value;
    update();
  });
}
function wireRows() {
  document.querySelectorAll('[data-account-page]').forEach((button) => {
    button.onclick = () => {
      const direction = button.dataset.accountPage;
      accountPage =
        direction === 'previous'
          ? accountPage - 1
          : direction === 'next'
            ? accountPage + 1
            : Number(direction);
      document.querySelector('#results').innerHTML = accountTable();
      wireRows();
      const target = document.querySelector(`[data-account-page="${direction}"]`);
      const fallback = document.querySelector('.pagination [aria-current="page"]');
      (target?.disabled ? fallback : target)?.focus({ preventScroll: true });
    };
  });
  document
    .querySelectorAll('[data-reset]')
    .forEach((b) => (b.onclick = () => resetDialog(b.dataset.reset)));
  document
    .querySelectorAll('[data-code]')
    .forEach((b) => (b.onclick = () => issueCode(b.dataset.code)));
  document
    .querySelectorAll('[data-status]')
    .forEach((b) => (b.onclick = () => setStatus(b.dataset.status, b.dataset.next)));
  document
    .querySelectorAll('#results [data-tab]')
    .forEach((b) => (b.onclick = () => navigate(b.dataset.tab)));
}
function registration() {
  return `<section class="panel panel-pad"><form id="register"><div class="step"><span class="step-number">1</span><div class="step-content"><h2>Xác định chip</h2><div class="usb-panel"><h3>Đọc MAC qua USB máy chủ</h3><p class="usb-warning">Đóng Serial Monitor; thao tác đọc sẽ khởi động lại thiết bị.</p><div class="actions"><button type="button" id="usbFind" class="secondary">Tìm cổng USB</button><select id="usbPort" aria-label="Cổng USB máy backend"><option value="">Chọn cổng USB</option></select><button type="button" id="usbRead" disabled>Đọc MAC</button></div><p id="usbStatus" role="status" aria-live="polite"></p></div><label>Địa chỉ MAC của chip<input name="factoryMac" placeholder="Ví dụ: 80:B5:4E:C8:14:9C" pattern="[0-9A-Fa-f:\\-]{12,17}" required spellcheck="false" autocomplete="off"></label></div></div><div class="step"><span class="step-number">2</span><div class="step-content"><h2>Thông tin sản phẩm</h2><label>Tên thiết bị<input name="name" maxlength="100" placeholder="Ví dụ: Cửa chính" required></label></div></div><div class="step"><span class="step-number">3</span><div class="step-content"><h2>Tạo QR bàn giao</h2><div id="register-error" class="error" role="alert" hidden></div><button type="submit">${icon('qr')} Tạo thiết bị & mã kích hoạt</button></div></div></form></section><div id="issued"></div>`;
}
async function register(event) {
  event.preventDefault();
  if (usbBusy) return;
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Đang tạo thiết bị…';
  const errorEl = document.querySelector('#register-error');
  errorEl.hidden = true;
  try {
    issued = await api(
      '/api/admin/inventory',
      'POST',
      Object.fromEntries(new FormData(event.target)),
    );
    showIssued();
    event.target.reset();
    try {
      inventory = await api('/api/admin/inventory');
    } catch (err) {
      notify(err.message, true);
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    button.disabled = Boolean(issued);
    button.innerHTML = issued
      ? 'Đã tạo · hãy lưu thông tin bên dưới'
      : `${icon('qr')} Tạo thiết bị & mã kích hoạt`;
  }
}
function productActivationQr(value) {
  const url = new URL('smartdoor://activate');
  url.searchParams.set('code', value.activationCode);
  url.searchParams.set('uid', value.device.deviceUid);
  if (value.setupSsid) url.searchParams.set('ssid', value.setupSsid);
  if (value.setupPassword) url.searchParams.set('key', value.setupPassword);
  return url.toString();
}
function showIssued() {
  const host = document.querySelector('#issued') || document.querySelector('#content');
  const panel = document.createElement('section');
  panel.className = 'panel panel-pad';
  panel.innerHTML = `<div class="success">${icon('check')} Đã cấp thông tin bàn giao. Hãy lưu trước khi rời màn hình này.</div><div class="result"><div class="qr-paper"><canvas aria-label="QR nhận cửa"></canvas><small>${esc(issued.device.name)}<br>${esc(issued.device.deviceUid)}</small></div><div class="stack"><div><h2>QR nhận cửa của sản phẩm</h2><p>Người mua quét mã này trong ứng dụng Smart Door.</p><label>Mã nhận cửa — không phải PIN mở khóa</label><div class="secret" tabindex="0">${esc(issued.activationCode)}</div></div><div class="notice">Nạp file cấp phát vào đúng chip trước khi giao. QR chứa mã nhận cửa và thông tin Wi-Fi thiết lập. Khóa xác thực thiết bị chỉ nằm trong file nạp.</div><div class="actions"><button class="download">${icon('download')} Tải file cấp phát</button><button class="print secondary">${icon('print')} In QR bàn giao</button></div></div></div>`;
  host.replaceChildren(panel);
  QRCode.toCanvas(panel.querySelector('canvas'), productActivationQr(issued), {
    width: 220,
    margin: 2,
  }).catch(() => notify('Chưa dựng được QR. Vui lòng lưu mã nhận cửa và file cấp phát.', true));
  panel.querySelector('.download').hidden = !issued.deviceSecret;
  panel.querySelector('.download').onclick = () => {
    const data = {
      deviceUid: issued.device.deviceUid,
      factoryMac: issued.device.factoryMac,
      deviceSecret: issued.deviceSecret,
      generation: issued.device.generation,
      activationCode: issued.activationCode,
      setupSsid: issued.setupSsid,
      setupPassword: issued.setupPassword,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${issued.device.deviceUid}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  panel.querySelector('.print').onclick = () => window.print();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function createDialog(title, description, fields, submitLabel, submit, danger = false) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'dialog-heading');
  dialog.innerHTML = `<div class="dialog-title"><h2 id="dialog-heading">${title}</h2></div><p>${description}</p><form class="stack">${fields}<div class="error" role="alert" hidden></div><div class="actions"><button type="button" class="secondary cancel">Hủy</button><button type="submit" class="${danger ? 'danger' : ''}">${submitLabel}</button></div></form>`;
  let busy = false;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('.cancel').onclick = () => {
    if (!busy) dialog.remove();
  };
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
    else dialog.remove();
  });
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    busy = true;
    dialog.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await submit(Object.fromEntries(new FormData(event.target)));
      dialog.remove();
    } catch (err) {
      const el = dialog.querySelector('.error');
      el.textContent = err.message;
      el.hidden = false;
    } finally {
      busy = false;
      dialog.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  };
  return dialog;
}
function confirmAction(title, description, label, danger = false) {
  return new Promise((resolve) => {
    const dialog = createDialog(
      title,
      description,
      '',
      label,
      async () => {
        resolve(true);
      },
      danger,
    );
    dialog.querySelector('.cancel').addEventListener('click', () => resolve(false));
    dialog.addEventListener('cancel', () => resolve(false));
  });
}
function resetDialog(uid) {
  createDialog(
    'Đặt lại / Chuyển giao thiết bị',
    'Xóa PIN, Wi-Fi, thẻ, vân tay, thành viên và lịch sử của cửa. Không thể hoàn tác. Chỉ hoàn tất khi thiết bị và backend xác nhận đã xóa.',
    `<div class="dialog-uid">${esc(uid)}</div><label>Nhập lại UID để xác nhận<input name="confirmation" placeholder="Nhập đúng mã thiết bị bên trên" pattern="${esc(uid.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&'))}" required autocomplete="off"></label><label>Mật khẩu admin hiện tại<input name="password" type="password" autocomplete="current-password" required></label><label>Email người nhận · không bắt buộc<input name="recipientEmail" type="email" placeholder="Để trống nếu chỉ đặt lại"></label>`,
    'Xác nhận xóa toàn bộ',
    async (body) => {
      if (body.confirmation !== uid) throw Error('UID xác nhận chưa khớp với thiết bị.');
      await api(`/api/admin/inventory/${encodeURIComponent(uid)}/reset`, 'POST', body);
      notify('Đã gửi yêu cầu đặt lại. Thiết bị cần xác nhận trước khi hoàn tất.');
      setTimeout(() => {
        void refresh(true);
      }, 0);
    },
    true,
  );
}
function issueCode(uid) {
  createDialog(
    'Cấp mã nhận cửa mới',
    'Xác thực lại để cấp mã sau khi đặt lại đã hoàn tất. Hãy lưu QR mới để bàn giao.',
    '<label>Mật khẩu admin hiện tại<input name="password" type="password" autocomplete="current-password" required></label>',
    'Cấp mã mới',
    async (body) => {
      issued = await api(
        `/api/admin/inventory/${encodeURIComponent(uid)}/issue-code`,
        'POST',
        body,
      );
      showIssued();
    },
  );
}
async function setStatus(id, status) {
  const a = accounts.find((item) => String(item.accountId) === id);
  const disable = status === 'DISABLED';
  if (
    !(await confirmAction(
      disable ? 'Khóa tài khoản?' : 'Mở lại tài khoản?',
      `${disable ? 'Tạm ngưng quyền sử dụng hệ thống của' : 'Cho phép sử dụng lại hệ thống với'} ${esc(a?.fullName || 'tài khoản này')}. Quyền của từng cửa vẫn do chủ cửa quản lý.`,
      disable ? 'Khóa tài khoản' : 'Mở tài khoản',
      disable,
    ))
  )
    return;
  try {
    await api(`/api/admin/accounts/${id}/status`, 'PATCH', { status });
    notify(disable ? 'Đã khóa tài khoản.' : 'Đã mở lại tài khoản.');
    await refresh(true);
  } catch (err) {
    notify(err.message, true);
  }
}

root.innerHTML = loading();
try {
  account = await api('/api/accounts/me');
  if (!account.admin) account = null;
  if (account) {
    await token();
    render();
    await refresh(true);
    startPolling();
  } else login();
} catch {
  login();
}
