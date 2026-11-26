/* 화면 동작 — 핵심 로직은 core.js, 트랙 그림은 track.js */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0';
  const C = window.SWCore;
  const COLORS = window.SWTrack.COLORS;
  const KEYS = {
    state: 'sw.state.v1',
    settings: 'sw.settings.v1',
    history: 'sw.history.v1',
    onboarded: 'sw.onboarded.v1',
  };
  const DEFAULTS = { lapLen: 60000, theme: 'system', lang: 'auto', sound: false, vibrate: true, keepAwake: true };
  const LAP_LENS = [30000, 60000, 120000, 300000];
  const HISTORY_MAX = 100;
  const MIN_LAP_MS = 80;              // 실수로 두 번 누른 랩 무시

  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');

  // ---------- 저장소 (사생활 모드 등에서 실패해도 앱은 동작) ----------
  const store = {
    raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    setRaw(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } },
    get(k, d) { try { const v = this.raw(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { this.setRaw(k, JSON.stringify(v)); },
  };

  let settings = Object.assign({}, DEFAULTS, store.get(KEYS.settings, {}));
  if (!LAP_LENS.includes(settings.lapLen)) settings.lapLen = DEFAULTS.lapLen;
  let state = C.deserialize(store.raw(KEYS.state)) || C.initial();
  let history = store.get(KEYS.history, []);
  if (!Array.isArray(history)) history = [];

  let lang = 'ko';
  let t = window.SWI18n.make(lang);
  const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const track = new window.SWTrack.Track($('track'));

  let raf = 0, lastRev = -1, lastTitleSec = -1;

  const saveState = () => store.setRaw(KEYS.state, C.serialize(state));
  const saveSettings = () => store.set(KEYS.settings, settings);
  const saveHistory = () => store.set(KEYS.history, history);

  // ---------- 표시 형식 ----------
  function durLabel(ms) {
    return ms < 60000 ? t('secN', { n: ms / 1000 }) : t('minN', { n: ms / 60000 });
  }
  function tickLabel(ms) {
    if (ms === 0) return '0';
    if (ms < 60000) return t('secShort', { n: +(ms / 1000).toFixed(1) });
    return Math.floor(ms / 60000) + ':' + pad(Math.round((ms % 60000) / 1000));
  }
  function speak(ms) {
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(2);
    return m ? t('speakMS', { m, s }) : t('speakS', { s });
  }
  function fmtDate(ms) {
    try {
      return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
    } catch (e) {
      return new Date(ms).toLocaleString();
    }
  }

  // ---------- 피드백: 소리, 진동, 스크린리더 ----------
  let actx = null;
  function ensureAudio() {
    if (!settings.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function beep(freq, dur) {
    if (!settings.sound) return;
    ensureAudio();
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur);
  }
  function buzz(ms) {
    if (settings.vibrate && navigator.vibrate) navigator.vibrate(ms || 12);
  }
  function announce(msg) {
    const a = $('announcer');
    a.textContent = '';
    setTimeout(() => { a.textContent = msg; }, 40);
  }

  // ---------- 화면 꺼짐 방지 ----------
  let wakeLock = null;
  async function syncWake() {
    const want = state.running && settings.keepAwake && !document.hidden;
    if (want && !wakeLock && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch (e) { wakeLock = null; }
    } else if (!want && wakeLock) {
      const w = wakeLock;
      wakeLock = null;
      w.release().catch(() => {});
    }
  }

  // ---------- 토스트 ----------
  let toastTimer = 0;
  function showToast(msg, actionLabel, action) {
    $('toastMsg').textContent = msg;
    const b = $('toastAction');
    if (actionLabel) {
      b.hidden = false;
      b.textContent = actionLabel;
      b.onclick = () => { hideToast(); action(); };
    } else {
      b.hidden = true;
      b.onclick = null;
    }
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 2500);
  }
  function hideToast() { $('toast').hidden = true; }

  // ---------- 렌더링 ----------
  function render() {
    const now = Date.now();
    const total = C.elapsed(state, now);
    const p = C.parts(total);
    $('clockMain').textContent = (p.h ? p.h + ':' : '') + pad(p.m) + ':' + pad(p.s);
    $('clockCs').textContent = '.' + pad(p.cs);

    const hasLaps = state.laps.length > 0;
    const split = C.split(state, now);
    track.update({
      total, split: hasLaps ? split : null, lapLen: settings.lapLen,
      running: state.running, reduced: reducedMQ.matches,
    });

    const rev = Math.floor(total / settings.lapLen);
    if (rev !== lastRev) {
      const lc = $('lapsCount');
      lc.textContent = t('lapsDone', { n: rev });
      if (lastRev >= 0 && rev > lastRev && state.running) {
        lc.classList.remove('pulse');
        void lc.getBBox();
        lc.classList.add('pulse');
        beep(660, 0.14);
        buzz(30);
      }
      lastRev = rev;
    }

    const cur = $('laps').firstElementChild;
    if (cur && cur.dataset.current) {
      cur.querySelector('.split').textContent = C.format(split);
      cur.querySelector('.total').textContent = C.format(total);
    }

    if (state.running) {
      const sec = Math.floor(total / 1000);
      if (sec !== lastTitleSec) {
        lastTitleSec = sec;
        document.title = C.formatShort(total) + ' · ' + t('appTitle');
      }
    }
  }

  function loop() {
    render();
    raf = state.running && !document.hidden ? requestAnimationFrame(loop) : 0;
  }
  function ensureLoop() {
    if (!raf && state.running && !document.hidden) raf = requestAnimationFrame(loop);
  }

  function lapRow(name, color, split, total, cls, tag) {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const n = document.createElement('span');
    n.className = 'name';
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.style.background = color;
    n.append(dot, name);
    if (tag) {
      const b = document.createElement('b');
      b.className = 'tag ' + cls;
      b.textContent = tag;
      n.append(b);
    }
    const s = document.createElement('span');
    s.className = 'split';
    s.textContent = C.format(split);
    const tt = document.createElement('span');
    tt.className = 'total';
    tt.textContent = C.format(total);
    li.append(n, s, tt);
    return li;
  }

  function renderLaps() {
    const ul = $('laps');
    ul.textContent = '';
    if (C.isPristine(state)) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('emptyLaps');
      ul.append(li);
      return;
    }
    const now = Date.now();
    const laps = state.laps;
    const st = C.stats(laps);
    const frag = document.createDocumentFragment();
    const cur = lapRow(t('lapN', { n: laps.length + 1 }), laps.length ? COLORS.current : COLORS.total,
      C.split(state, now), C.elapsed(state, now));
    cur.dataset.current = '1';
    frag.append(cur);
    let total = C.lapSum(state);
    for (let i = laps.length - 1; i >= 0; i--) {
      const cls = i === st.best ? 'best' : i === st.worst ? 'worst' : '';
      const tag = cls ? (cls === 'best' ? '▲ ' + t('best') : '▼ ' + t('worst')) : '';
      frag.append(lapRow(t('lapN', { n: i + 1 }), track.lapColor(i, st), laps[i], total, cls, tag));
      total -= laps[i];
    }
    ul.append(frag);
  }

  function refreshControls() {
    const main = $('mainBtn'), left = $('leftBtn');
    const pristine = C.isPristine(state);
    main.textContent = state.running ? t('stop') : pristine ? t('start') : t('resume');
    main.classList.toggle('running', state.running);
    if (state.running || pristine) {
      left.textContent = t('lap');
      left.dataset.action = 'lap';
      left.disabled = !state.running;
    } else {
      left.textContent = t('reset');
      left.dataset.action = 'reset';
      left.disabled = false;
    }
    $('shareBtn').hidden = pristine;
    if (!state.running) document.title = t('appTitle');
    lastTitleSec = -1;
  }

  /** 상태가 통째로 바뀐 뒤(복원, 초기화, 되돌리기, 설정 변경) 전체 다시 그리기 */
  function refreshAll() {
    lastRev = -1;
    const n = state.laps.length;
    track.setLapRunner(n ? n + 1 : null);
    track.setStanding(state.laps, C.stats(state.laps), settings.lapLen, -1);
    renderLaps();
    refreshControls();
    render();
    ensureLoop();
    syncWake();
  }

  // ---------- 동작 ----------
  function toggle() {
    const now = Date.now();
    if (state.running) {
      state = C.pause(state, now);
      announce(t('aStop', { t: speak(C.elapsed(state, now)) }));
    } else {
      ensureAudio();
      state = C.start(state, now);
      announce(t('aStart'));
    }
    saveState();
    buzz();
    refreshControls();
    renderLaps();
    render();
    ensureLoop();
    syncWake();
  }

  function lap() {
    if (!state.running) return;
    const now = Date.now();
    if (C.split(state, now) < MIN_LAP_MS) return;
    state = C.addLap(state, now);
    saveState();
    const n = state.laps.length;
    track.setLapRunner(n + 1);
    track.setStanding(state.laps, C.stats(state.laps), settings.lapLen, n - 1);
    renderLaps();
    render();
    buzz();
    beep(990, 0.07);
    announce(t('aLap', { n, t: speak(state.laps[n - 1]) }));
  }

  function reset() {
    if (state.running || C.isPristine(state)) return;
    const prev = state;
    const session = { id: Date.now(), endedAt: Date.now(), total: prev.accumulated, laps: prev.laps.slice() };
    history.unshift(session);
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    saveHistory();
    state = C.initial();
    saveState();
    refreshAll();
    buzz();
    announce(t('aReset'));
    showToast(t('resetDone'), t('undo'), () => {
      state = prev;
      history = history.filter(h => h.id !== session.id);
      saveHistory();
      saveState();
      refreshAll();
    });
  }

  // ---------- 공유 / 내보내기 ----------
  function textLabels(s) {
    return {
      title: t('appTitle'), date: fmtDate(s.endedAt), total: t('total'),
      lapCount: t('lapCount', { n: s.laps.length }), avg: t('avg'), lap: t('lap'),
      best: t('best'), worst: t('worst'),
    };
  }
  async function shareSession(s) {
    const text = C.toText(s, textLabels(s));
    if (navigator.share) {
      try { await navigator.share({ title: t('appTitle'), text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); showToast(t('copied')); }
    catch (e) { showToast(t('copyFail')); }
  }
  function downloadCSV(s) {
    const d = new Date(s.endedAt);
    const name = 'stopwatch-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.csv';
    const blob = new Blob(['﻿' + C.toCSV(s)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function currentSession() {
    const now = Date.now();
    return { endedAt: now, total: C.elapsed(state, now), laps: state.laps.slice() };
  }

  // ---------- 기록 ----------
  function renderHistory() {
    const box = $('historyList');
    box.textContent = '';
    $('clearHistory').hidden = !history.length;
    if (!history.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('noHistory');
      box.append(p);
      return;
    }
    history.forEach(s => {
      const d = document.createElement('details');
      d.className = 'session';
      const sum = document.createElement('summary');
      const date = document.createElement('span'); date.className = 's-date'; date.textContent = fmtDate(s.endedAt);
      const tot = document.createElement('span'); tot.className = 's-total'; tot.textContent = C.format(s.total);
      const lc = document.createElement('span'); lc.className = 's-laps'; lc.textContent = t('lapCount', { n: s.laps.length });
      sum.append(date, tot, lc);
      const body = document.createElement('div');
      body.className = 's-body';
      if (s.laps.length) {
        const st = C.stats(s.laps);
        const ol = document.createElement('ol');
        let cum = 0;
        s.laps.forEach((x, i) => {
          cum += x;
          const li = document.createElement('li');
          if (i === st.best) li.className = 'best';
          if (i === st.worst) li.className = 'worst';
          [t('lapN', { n: i + 1 }) + (i === st.best ? ' ▲' : i === st.worst ? ' ▼' : ''), C.format(x), C.format(cum)]
            .forEach(v => { const sp = document.createElement('span'); sp.textContent = v; li.append(sp); });
          ol.append(li);
        });
        body.append(ol);
      }
      const actions = document.createElement('div');
      actions.className = 's-actions';
      const mk = (label, fn, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'text-btn' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.addEventListener('click', fn);
        actions.append(b);
      };
      mk(t('share'), () => shareSession(s));
      mk(t('exportCsv'), () => downloadCSV(s));
      mk(t('delete'), () => {
        const idx = history.indexOf(s);
        history = history.filter(h => h !== s);
        saveHistory();
        renderHistory();
        showToast(t('deleted'), t('undo'), () => {
          history.splice(Math.max(0, idx), 0, s);
          saveHistory();
          renderHistory();
        });
      }, 'danger');
      body.append(actions);
      d.append(sum, body);
      box.append(d);
    });
  }

  // ---------- 대화상자 (Android 뒤로가기로 닫기) ----------
  function openDialog(d) {
    if (d.open) return;
    d.showModal();
    try { history_push(d.id); } catch (e) { /* file:// 등 */ }
  }
  function history_push(id) { window.history.pushState({ dlg: id }, ''); }
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('close', () => {
      if (window.history.state && window.history.state.dlg === d.id) window.history.back();
    });
    d.addEventListener('click', e => {                 // 바깥(배경) 누르면 닫기
      if (e.target === d) d.close();
    });
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
  });
  window.addEventListener('popstate', () => {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  });

  // ---------- 설정 ----------
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    $('themeColor').setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#f5f5f4');
  }

  function applyLang() {
    lang = window.SWI18n.resolve(settings.lang);
    t = window.SWI18n.make(lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(e => { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
    $('setLapLen').querySelectorAll('option').forEach(o => { o.textContent = durLabel(+o.value); });
    $('aboutText').textContent = t('about', { v: APP_VERSION });
    applyLapLen();
  }

  function applyLapLen() {
    track.setTicks([0, 1, 2, 3].map(q => tickLabel((settings.lapLen * q) / 4)));
    $('legend1').textContent = t('legend1', { len: durLabel(settings.lapLen) });
    $('legend2').textContent = t('legend2');
    refreshAll();
  }

  function syncSettingsForm() {
    $('setLapLen').value = String(settings.lapLen);
    $('setTheme').value = settings.theme;
    $('setLang').value = settings.lang;
    $('setSound').checked = settings.sound;
    $('setVibrate').checked = settings.vibrate;
    $('setKeepAwake').checked = settings.keepAwake;
  }

  $('setLapLen').addEventListener('change', e => { settings.lapLen = +e.target.value; saveSettings(); applyLapLen(); });
  $('setTheme').addEventListener('change', e => { settings.theme = e.target.value; saveSettings(); applyTheme(); });
  $('setLang').addEventListener('change', e => { settings.lang = e.target.value; saveSettings(); applyLang(); });
  $('setSound').addEventListener('change', e => { settings.sound = e.target.checked; saveSettings(); if (settings.sound) beep(880, 0.08); });
  $('setVibrate').addEventListener('change', e => { settings.vibrate = e.target.checked; saveSettings(); buzz(20); });
  $('setKeepAwake').addEventListener('change', e => { settings.keepAwake = e.target.checked; saveSettings(); syncWake(); });

  // ---------- 입력 ----------
  function onButton(id, fn) {
    $(id).addEventListener('click', e => { fn(e); e.currentTarget.blur(); });
  }
  onButton('mainBtn', toggle);
  onButton('leftBtn', e => (e.currentTarget.dataset.action === 'reset' ? reset() : lap()));
  onButton('shareBtn', () => shareSession(currentSession()));
  onButton('historyBtn', () => { renderHistory(); openDialog($('historyDlg')); });
  onButton('settingsBtn', () => { syncSettingsForm(); openDialog($('settingsDlg')); });
  $('clearHistory').addEventListener('click', () => {
    if (!confirm(t('confirmClear'))) return;
    history = [];
    saveHistory();
    renderHistory();
  });

  document.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'KeyL' || e.key === 'l' || e.key === 'L' || e.key === 'ㅣ') lap();
    else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') reset();
  });

  // 앱 전환 후 돌아오면 즉시 정확한 시간으로
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { render(); ensureLoop(); }
    syncWake();
  });
  window.addEventListener('pageshow', () => { render(); ensureLoop(); });

  // 다른 탭에서 바뀐 상태 반영
  window.addEventListener('storage', e => {
    if (e.key === KEYS.state) { state = C.deserialize(e.newValue) || C.initial(); refreshAll(); }
    else if (e.key === KEYS.history) { history = store.get(KEYS.history, []); }
  });

  darkMQ.addEventListener && darkMQ.addEventListener('change', applyTheme);
  reducedMQ.addEventListener && reducedMQ.addEventListener('change', render);

  // ---------- 시작 ----------
  applyTheme();
  applyLang();
  if (!store.get(KEYS.onboarded, false)) {
    store.set(KEYS.onboarded, true);   // 한 번 보여주면 끝 (close 이벤트에 의존하지 않음)
    openDialog($('onboardDlg'));
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // 디버깅/테스트용
  window.SWApp = {
    get state() { return state; },
    set state(s) { state = s; saveState(); refreshAll(); },
    refreshAll, render, settings,
  };
})();
