'use strict';
// Интерфейс лаунчера. Состояние приходит из Kotlin (window.onLauncher), действия уходят в мост Native.

(function () {
  // ── иконки (контуры в духе lucide) ──
  const ICONS = {
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    play: '<path d="M6 3l14 9-14 9V3z"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.8L21 8"/><path d="M21 3v5h-5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    package: '<path d="m7.5 4.3 9 5.2"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };
  const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const fillIcons = (root) => root.querySelectorAll('i[data-i]').forEach((el) => { el.outerHTML = icon(el.dataset.i); });

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Мост; в обычном браузере (разработка вёрстки) — заглушка
  const N = window.Native || mockNative();

  let S = null; // последнее состояние
  let prevBusy = '';
  let modalKind = '';

  // ── форматирование ──
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  }
  function uptime(ms) {
    const min = Math.max(0, Math.floor(ms / 60000));
    if (min < 1) return 'меньше минуты';
    const h = Math.floor(min / 60), m = min % 60;
    if (h >= 24) return Math.floor(h / 24) + ' д ' + (h % 24) + ' ч';
    return (h ? h + ' ч ' : '') + m + ' мин';
  }
  function ago(t) {
    if (!t) return 'ещё не проверялось';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'только что';
    const m = Math.floor(s / 60);
    if (m < 60) return plural(m, 'минуту', 'минуты', 'минут') + ' назад';
    const h = Math.floor(m / 60);
    if (h < 24) return plural(h, 'час', 'часа', 'часов') + ' назад';
    return plural(Math.floor(h / 24), 'день', 'дня', 'дней') + ' назад';
  }
  function when(t) {
    if (!t) return 'ещё не было';
    const d = new Date(t), now = new Date();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
    if (day === 0) return 'сегодня, ' + hm;
    if (day === 1) return 'вчера, ' + hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + hm;
  }
  const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const channelLabel = (c) => (c === 'main' ? 'main — стабильная' : c);

  // ── отрисовка ──
  function render() {
    if (!S) return;
    const f = S.front, p = S.prefs, busy = S.busy;
    document.documentElement.dataset.theme = p.theme;
    $('themeBtn').innerHTML = icon(p.theme === 'light' ? 'moon' : 'sun');
    const inst = S.installed;
    $('versions').textContent = `фронт ${inst ? inst.version : '—'} · лаунчер ${S.launcher}`;

    // запуск
    $('autoHint').textContent = p.autostart ? 'Автозапуск включён' : 'Автозапуск выключен';
    const emblem = $('emblem');
    emblem.className = 'emblem' + (f.running ? '' : f.starting ? ' busy' : ' off');
    $('stateDot').className = 'dot' + (f.running ? ' on' : f.error ? ' err' : '');
    $('stateTitle').textContent = f.running ? 'Фронт запущен' : f.starting ? 'Запускается…' : busy === 'update' ? 'Обновляется' : 'Фронт остановлен';
    $('stateSub').textContent = f.running
      ? `Работает ${uptime(Date.now() - f.startedAt)} · порт ${f.port}`
      : f.error || (inst ? `Порт ${f.port} · нажмите «Запустить»` : 'Фронт ещё не установлен — нажмите «Обновить»');
    $('addr').textContent = f.url;

    const openLabel = p.openInApp ? 'Открыть' : 'Открыть в браузере';
    const dis = busy ? ' disabled' : '';
    const btns = f.running
      ? `<button class="btn primary" data-act="open">${icon(p.openInApp ? 'play' : 'globe')}<span>${openLabel}</span></button>
         <button class="btn" data-act="restart"${dis}>${icon('refresh')}<span>Перезапустить</span></button>
         <button class="btn" data-act="stop"${dis}>${icon('square')}<span>Остановить</span></button>`
      : `<button class="btn primary" data-act="start"${f.starting || busy || !inst ? ' disabled' : ''}>${icon('play')}<span>Запустить</span></button>
         <button class="btn" data-act="open"${f.starting || busy || !inst ? ' disabled' : ''}>${icon(p.openInApp ? 'play' : 'globe')}<span>Запустить и открыть</span></button>`;
    // не пересоздаём кнопки без нужды — иначе теряется нажатие
    if ($('launchBtns').dataset.html !== btns) { $('launchBtns').innerHTML = btns; $('launchBtns').dataset.html = btns; }

    document.querySelectorAll('input[data-pref]').forEach((el) => { el.checked = !!p[el.dataset.pref]; });

    // обновления
    const av = S.available && S.available.version;
    $('verNow').textContent = inst ? inst.version : '—';
    $('verNowSub').textContent = inst ? [inst.commit, inst.branch].filter(Boolean).join(' · ') : 'не установлен';
    $('verAvail').textContent = av ? av.version : S.checking ? '…' : '—';
    $('verAvailSub').textContent = av ? [av.commit, av.branch].filter(Boolean).join(' · ') : '';
    $('updBadge').hidden = !S.hasUpdate;
    $('whatsNewBtn').hidden = !S.available;
    const sel = $('channel');
    const opts = S.channels.map((c) => `<option value="${esc(c)}"${c === p.channel ? ' selected' : ''}>${esc(channelLabel(c))}</option>`).join('');
    if (sel.dataset.opts !== opts) { sel.innerHTML = opts; sel.dataset.opts = opts; }
    sel.value = p.channel;
    sel.disabled = !!busy;
    const upd = $('updBtn');
    upd.disabled = !!busy || !S.available || (!S.hasUpdate && !!inst);
    upd.querySelector('span').textContent = S.hasUpdate ? (inst ? 'Обновить' : 'Установить') : S.available ? 'Установлена последняя версия' : 'Обновить';
    $('checkBtn').classList.toggle('spin', S.checking);
    $('checkBtn').disabled = S.checking;
    $('checkNote').textContent = S.checkError
      ? `Не удалось проверить: ${S.checkError}`
      : `Проверено ${ago(S.lastCheck)} · перед обновлением создаётся бэкап`;

    // обслуживание
    $('backupHint').textContent = `Бэкапы хранятся в ${S.backupDir}`;
    $('footDir').textContent = S.backupDir;
    $('lastBackup').textContent = 'последний: ' + when(S.lastBackup);
    const setBusy = (id, key, text) => {
      const b = $(id);
      b.disabled = !!busy;
      const span = b.querySelector('span');
      if (!span.dataset.text) span.dataset.text = span.textContent;
      span.textContent = busy === key ? text : span.dataset.text;
    };
    setBusy('exportBtn', 'export', 'Сохраняю…');
    setBusy('importBtn', 'import', 'Загружаю…');
    setBusy('reinstallBtn', 'reinstall', 'Переустанавливаю…');
    setBusy('resetBtn', 'reset', 'Удаляю…');

    renderLog($('log'), S.journal);

    // экран обновления
    const u = S.update;
    $('home').hidden = !!u;
    $('updScreen').hidden = !u;
    if (u) renderUpdate(u);
    $('footLeft').textContent = u && u.active ? 'Обновление идёт · фронт временно недоступен' : 'Лаунчер можно свернуть — фронт продолжит работать';

    // тост по завершении операции
    if (prevBusy && !busy && prevBusy !== 'update') {
      const last = S.journal[S.journal.length - 1];
      if (last) toast(last.text);
    }
    prevBusy = busy;
  }

  function renderLog(el, entries) {
    const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    const html = entries.length
      ? entries.map((e) => `<div class="row${e.a ? ' a' : ''}"><span class="t">${hm(e.t)}</span><span class="s">${e.a ? '✦' : ''}</span><span class="m">${esc(e.text)}</span></div>`).join('')
      : '<div class="empty">Журнал пуст</div>';
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
    if (stick || !el.dataset.scrolled) { el.scrollTop = el.scrollHeight; el.dataset.scrolled = '1'; }
  }

  const STEPS = [
    ['Остановка фронта', 'сервер будет остановлен'],
    ['Бэкап перед обновлением', 'персонажи, чаты и настройки'],
    ['Загрузка обновления', 'сборка из GitHub Releases'],
    ['Установка файлов', 'обычно несколько секунд'],
    ['Запуск фронта', 'откроется автоматически'],
  ];

  function renderUpdate(u) {
    const done = u.finished;
    $('updTitle').textContent = done ? `Фронт обновлён до ${u.target}` : u.error ? 'Обновление прервано' : `Обновляем до ${u.target}`;
    $('updSub').textContent = done
      ? 'Всё готово — можно возвращаться к персонажам'
      : u.error || 'Не закрывайте лаунчер — фронт запустится сам, когда всё будет готово';
    const pct = done ? 100 : u.percent;
    $('updPercent').textContent = pct + '%';
    $('updBar').style.width = pct + '%';
    $('updSteps').innerHTML = STEPS.map(([title, hint], i) => {
      let cls = 'todo', mark = '';
      if (done || i < u.step) { cls = 'done'; mark = icon('check'); }
      else if (i === u.step) {
        if (u.error) { cls = 'err'; mark = icon('x'); }
        else { cls = 'now'; mark = '<span>✦</span>'; }
      }
      const sub = u.detail[i] || hint;
      return `<li class="${cls}"><span class="mark">${mark}</span><div><div class="st-title">${title}</div><div class="st-sub">${esc(sub)}</div></div></li>`;
    }).join('');
    renderLog($('updLog'), u.log);
    const btn = $('updCancel');
    if (u.active) {
      btn.innerHTML = `${icon('x')}<span>${u.cancelled ? 'Отменяю…' : 'Отменить'}</span>`;
      btn.dataset.act = 'cancelUpdate';
      btn.disabled = u.cancelled || u.step >= 4;
    } else {
      btn.innerHTML = `${icon('check')}<span>${done ? 'Готово' : 'Закрыть'}</span>`;
      btn.dataset.act = 'dismissUpdate';
      btn.disabled = false;
    }
    $('updNote').textContent = u.active ? 'При ошибке останется прежняя версия фронта' : done ? '' : 'Установленная версия не изменилась';
  }

  // ── модальные окна ──
  function openModal(kind, html, danger) {
    modalKind = kind;
    const box = $('modalBox');
    box.className = 'modal' + (danger ? ' danger' : '');
    box.innerHTML = '<span class="modal-star">✦</span>' + html;
    fillIcons(box);
    $('modal').hidden = false;
  }
  function closeModal() {
    $('modal').hidden = true;
    modalKind = '';
  }

  function resetModal() {
    openModal('reset', `
      <div class="modal-head">
        <span class="tile-icon"><i data-i="alert"></i></span>
        <div><h2>Перезапуск с нуля</h2><div class="sub">Фронт запустится как после первой установки</div></div>
      </div>
      <div class="label">будет удалено</div>
      <ul class="x">
        <li><i data-i="x"></i>Персонажи и их аватары</li>
        <li><i data-i="x"></i>Все чаты, ветки и закладки</li>
        <li><i data-i="x"></i>Лорбуки и персоны</li>
        <li><i data-i="x"></i>Настройки, пресеты и темы</li>
        <li><i data-i="x"></i>Сохранённые API-ключи</li>
      </ul>
      <p>Сами файлы фронта останутся. Отменить удаление нельзя — только загрузить бэкап. Данные во внешнем браузере не затрагиваются.</p>
      <label class="tg"><input type="checkbox" id="rsBackup" checked /><span class="sw"></span><span>Сначала сохранить бэкап<br><span class="sub">в ${esc(S.backupDir)}</span></span></label>
      <h4>Для подтверждения введите УДАЛИТЬ</h4>
      <input class="field" id="rsConfirm" autocomplete="off" autocapitalize="characters" placeholder="УДАЛИТЬ" />
      <div class="modal-actions">
        <button class="btn" data-act="closeModal">Отмена</button>
        <button class="btn danger solid" data-act="resetDo" id="rsDo" disabled><i data-i="trash"></i><span>Удалить и перезапустить</span></button>
      </div>`, true);
    $('rsConfirm').addEventListener('input', (e) => { $('rsDo').disabled = e.target.value.trim().toUpperCase() !== 'УДАЛИТЬ'; });
  }

  function whatsNewModal() {
    const a = S.available;
    if (!a) return;
    const v = a.version;
    openModal('notes', `
      <div class="modal-head">
        <span class="tile-icon"><i data-i="download"></i></span>
        <div><h2>Что нового</h2><div class="sub">${esc(v ? v.version + ' · ' + v.commit : '')} · ветка ${esc(a.channel)}${a.published ? ' · ' + esc(when(Date.parse(a.published))) : ''}</div></div>
      </div>
      <pre class="notes">${esc(a.notes || 'Описания нет')}</pre>
      <div class="modal-actions">
        ${a.url ? '<button class="btn" data-act="openRelease">Открыть на GitHub</button>' : ''}
        <button class="btn primary" data-act="closeModal">Понятно</button>
      </div>`);
  }

  function helpModal() {
    openModal('help', `
      <div class="modal-head">
        <span class="tile-icon"><i data-i="help"></i></span>
        <div><h2>Как это работает</h2><div class="sub">Divinax ${esc(S.installed ? S.installed.version : '')} · лаунчер ${esc(S.launcher)}</div></div>
      </div>
      <p>Лаунчер сам раздаёт фронт по адресу <b>${esc(S.front.url)}</b> — Termux и Node.js не нужны. Пока сервер работает, в шторке висит уведомление: лаунчер можно свернуть или закрыть.</p>
      <p><b>Где данные.</b> Персонажи и чаты хранятся в браузере, который открыл фронт. Во встроенном окне — внутри лаунчера: бэкап, загрузка бэкапа и «перезапуск с нуля» работают с ними. Во внешнем браузере данные свои — для них пользуйтесь резервной копией во вкладке «Интерфейс» самого фронта (её .json можно загрузить сюда).</p>
      <p><b>Обновления</b> берутся из релизов <b>web-&lt;ветка&gt;</b> репозитория ${esc(S.repo)}, их собирает GitHub Actions. Перед обновлением сохраняется автобэкап, при ошибке остаётся прежняя версия.</p>
      <p><b>Бэкапы</b> лежат в папке ${esc(S.backupDir)}. Файлы, которые скачивает сам фронт (карточки, чаты), — там же.</p>
      <div class="modal-actions">
        <button class="btn" data-act="openRepo">Репозиторий</button>
        <button class="btn primary" data-act="closeModal">Понятно</button>
      </div>`);
  }

  function quitModal() {
    if (!S.front.running) return N.quit();
    openModal('quit', `
      <div class="modal-head">
        <span class="tile-icon"><i data-i="x"></i></span>
        <div><h2>Закрыть лаунчер?</h2><div class="sub">Фронт сейчас запущен</div></div>
      </div>
      <p>Закрытие остановит сервер фронта. Чтобы фронт продолжил работать в фоне, лаунчер достаточно свернуть.</p>
      <div class="modal-actions">
        <button class="btn" data-act="minimize">Свернуть</button>
        <button class="btn primary" data-act="quitDo">Остановить и закрыть</button>
      </div>`);
  }

  // ── тост ──
  let toastTimer;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // ── действия ──
  const ACTIONS = {
    theme: () => N.setPref('theme', S.prefs.theme === 'light' ? 'dark' : 'light'),
    help: helpModal,
    minimize: () => { closeModal(); N.minimize(); },
    quit: quitModal,
    quitDo: () => { closeModal(); N.quit(); },
    copyAddr: () => { N.copy(S.front.url); toast('Адрес скопирован'); },
    openBrowser: () => N.openBrowser(),
    open: () => N.open(),
    start: () => N.start(),
    stop: () => N.stop(),
    restart: () => N.restart(),
    check: () => N.checkUpdates(),
    update: () => N.update(),
    whatsNew: whatsNewModal,
    openRelease: () => S.available && N.openUrl(S.available.url),
    openRepo: () => N.openUrl('https://github.com/' + S.repo),
    cancelUpdate: () => N.cancelUpdate(),
    dismissUpdate: () => N.dismissUpdate(),
    export: () => N.exportBackup(!!S.prefs.backupKeys),
    import: () => N.importBackup(),
    reinstall: () => N.reinstall(),
    resetAsk: resetModal,
    resetDo: () => { const b = $('rsBackup').checked; closeModal(); N.reset(b); },
    closeModal,
    copyLog: () => { N.copyLog(); toast('Журнал скопирован'); },
    shareLog: () => N.shareLog(),
    clearLog: () => N.clearLog(),
    folder: () => N.openFolder(),
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act]();
  });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.pref) N.setPref(el.dataset.pref, String(el.checked));
    if (el.id === 'channel') N.setPref('channel', el.value);
  });

  // «Назад» на Android: сначала закрываем окна
  window.onBack = function () {
    if (modalKind) { closeModal(); return true; }
    if (S && S.update && !S.update.active) { N.dismissUpdate(); return true; }
    return false;
  };

  window.onLauncher = function (state) {
    S = state;
    render();
  };

  fillIcons(document);
  try { window.onLauncher(JSON.parse(N.state())); } catch (e) { /* состояние придёт позже */ }
  setInterval(render, 30000); // время работы и «проверено … назад»
  if (!window.Native) {
    const m = new URLSearchParams(location.search).get('modal');
    if (m && ACTIONS[m]) ACTIONS[m]();
  }

  // ── заглушка для отладки вёрстки в обычном браузере ──
  function mockNative() {
    const now = Date.now();
    const st = {
      launcher: '1.0',
      prefs: { autostart: true, openAfterStart: true, bootStart: false, checkOnLaunch: true, openInApp: true, backupKeys: false, channel: 'main', theme: 'dark' },
      front: { running: true, starting: false, startedAt: now - 8040000, url: 'http://127.0.0.1:8000', port: 8000, error: null },
      installed: { version: '0.3.1', commit: '98f0f98', date: '', branch: 'main' },
      available: { channel: 'main', version: { version: '0.3.2', commit: 'a1b2c3d', branch: 'main' }, notes: '• Обрезка аватаров\n• Регексы пресетов', published: new Date(now - 86400000).toISOString(), url: 'https://github.com' },
      hasUpdate: true,
      channels: ['main', 'dev'],
      checking: false, checkError: null, lastCheck: now - 300000, lastBackup: now - 80000000,
      backupDir: 'Download/Divinax', busy: '', stats: null, repo: 'jellysilly/Divinax',
      journal: [
        { t: now - 8100000, text: 'Запуск лаунчера 1.0', a: false },
        { t: now - 8099000, text: 'Проверка обновлений: доступна 0.3.2 · a1b2c3d', a: false },
        { t: now - 8098000, text: 'Запуск сервера фронта на порту 8000', a: false },
        { t: now - 8097000, text: 'Сервер слушает http://127.0.0.1:8000', a: true },
        { t: now - 8096000, text: 'Загружено: 24 персонажа, 57 чатов, 3 группы', a: false },
        { t: now - 600000, text: 'Бэкап сохранён: divinax-2026-09-22-2310.zip', a: true },
      ],
      update: null,
    };
    const q = new URLSearchParams(location.search);
    if (q.get('screen') === 'update') {
      st.busy = 'update';
      st.update = { target: '0.3.2', step: 2, percent: 52, detail: ['сервер остановлен корректно', 'divinax-auto-2026-09-23-0914.zip', '0.3.1 → 0.3.2 · 64%', '', ''], error: null, finished: false, cancelled: false, active: true, log: st.journal.slice(-4) };
    }
    if (q.get('theme')) st.prefs.theme = q.get('theme');
    const push = () => setTimeout(() => window.onLauncher(JSON.parse(JSON.stringify(st))), 0);
    return new Proxy({}, {
      get: (_, name) => (...args) => {
        if (name === 'state') return JSON.stringify(st);
        if (name === 'setPref') { st.prefs[args[0]] = args[1] === 'true' ? true : args[1] === 'false' ? false : args[1]; push(); }
        if (name === 'stop') { st.front.running = false; push(); }
        if (name === 'start') { st.front.running = true; st.front.startedAt = Date.now(); push(); }
        console.log('Native.' + String(name), args);
      },
    });
  }
})();
