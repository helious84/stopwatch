/*
 * 스탑워치 핵심 로직 — DOM·UI에 의존하지 않는 순수 함수 모음.
 * 브라우저에서는 window.SWCore, Node에서는 module.exports 로 사용한다.
 *
 * 시간은 벽시계(Date.now, epoch ms) 기준으로 저장한다.
 *  - 앱이 종료되거나 기기가 잠들어도 startedAt 만 있으면 경과 시간을 복원할 수 있다.
 *  - performance.now 는 일부 Android 기기에서 절전 중 멈추므로 사용하지 않는다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SWCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;

  function initial() {
    return { v: VERSION, running: false, startedAt: 0, accumulated: 0, laps: [] };
  }

  /** 경과 시간(ms). 시계가 뒤로 돌아가도 음수가 되지 않게 막는다. */
  function elapsed(s, now) {
    return s.accumulated + (s.running ? Math.max(0, now - s.startedAt) : 0);
  }

  function start(s, now) {
    if (s.running) return s;
    return { ...s, running: true, startedAt: now };
  }

  function pause(s, now) {
    if (!s.running) return s;
    return { ...s, running: false, startedAt: 0, accumulated: elapsed(s, now) };
  }

  function lapSum(s) {
    let t = 0;
    for (const x of s.laps) t += x;
    return t;
  }

  /** 진행 중인 랩의 시간 */
  function split(s, now) {
    return Math.max(0, elapsed(s, now) - lapSum(s));
  }

  function addLap(s, now) {
    if (!s.running) return s;
    return { ...s, laps: s.laps.concat(split(s, now)) };
  }

  function isPristine(s) {
    return !s.running && s.accumulated === 0 && s.laps.length === 0;
  }

  function serialize(s) {
    return JSON.stringify(s);
  }

  /** 저장된 문자열을 검증해서 상태로 복원. 손상됐으면 null. */
  function deserialize(str) {
    if (typeof str !== 'string') return null;
    try {
      const o = JSON.parse(str);
      const num = x => typeof x === 'number' && isFinite(x) && x >= 0;
      if (!o || o.v !== VERSION) return null;
      if (typeof o.running !== 'boolean' || !num(o.startedAt) || !num(o.accumulated)) return null;
      if (!Array.isArray(o.laps) || !o.laps.every(num)) return null;
      if (o.running && o.startedAt === 0) return null;
      return { v: VERSION, running: o.running, startedAt: o.startedAt, accumulated: o.accumulated, laps: o.laps.slice() };
    } catch (e) {
      return null;
    }
  }

  /** 최고·최저 랩 인덱스(랩 2개 미만이거나 모두 같으면 -1)와 평균 */
  function stats(laps) {
    if (!laps.length) return { best: -1, worst: -1, avg: 0 };
    let best = 0, worst = 0, sum = 0;
    laps.forEach((x, i) => {
      sum += x;
      if (x < laps[best]) best = i;
      if (x > laps[worst]) worst = i;
    });
    const avg = sum / laps.length;
    if (laps.length < 2 || laps[best] === laps[worst]) return { best: -1, worst: -1, avg };
    return { best, worst, avg };
  }

  /** 트랙 위치: rev = 완주한 바퀴 수, frac = 이번 바퀴 진행률(0~1) */
  function trackPos(ms, lapLen) {
    const rev = Math.floor(ms / lapLen);
    return { rev, frac: (ms - rev * lapLen) / lapLen };
  }

  function parts(ms) {
    ms = Math.max(0, Math.floor(ms));
    return {
      h: Math.floor(ms / 3600000),
      m: Math.floor(ms / 60000) % 60,
      s: Math.floor(ms / 1000) % 60,
      cs: Math.floor(ms / 10) % 100,
    };
  }

  const pad = n => String(n).padStart(2, '0');

  /** 00:00.00 또는 1:00:00.00 */
  function format(ms) {
    const p = parts(ms);
    return (p.h ? p.h + ':' : '') + pad(p.m) + ':' + pad(p.s) + '.' + pad(p.cs);
  }

  /** 00:00 또는 1:00:00 (제목 표시줄용) */
  function formatShort(ms) {
    const p = parts(ms);
    return (p.h ? p.h + ':' : '') + pad(p.m) + ':' + pad(p.s);
  }

  /** 기록 하나(session = {endedAt, total, laps})를 공유용 텍스트로 */
  function toText(session, L) {
    const st = stats(session.laps);
    const lines = [L.title + ' — ' + L.date];
    let head = L.total + ' ' + format(session.total);
    if (session.laps.length) head += ' · ' + L.lapCount + ' · ' + L.avg + ' ' + format(st.avg);
    lines.push(head);
    if (session.laps.length) {
      lines.push('');
      let cum = 0;
      session.laps.forEach((x, i) => {
        cum += x;
        let line = L.lap + ' ' + (i + 1) + '\t' + format(x) + '\t' + format(cum);
        if (i === st.best) line += '\t▲ ' + L.best;
        if (i === st.worst) line += '\t▼ ' + L.worst;
        lines.push(line);
      });
    }
    return lines.join('\n');
  }

  function toCSV(session) {
    const rows = ['lap,lap_time,total_time,lap_ms,total_ms'];
    let cum = 0;
    session.laps.forEach((x, i) => {
      cum += x;
      rows.push([i + 1, format(x), format(cum), Math.round(x), Math.round(cum)].join(','));
    });
    rows.push(['total', '', format(session.total), '', Math.round(session.total)].join(','));
    return rows.join('\r\n') + '\r\n';
  }

  return {
    VERSION, initial, elapsed, start, pause, addLap, split, lapSum, isPristine,
    serialize, deserialize, stats, trackPos, parts, format, formatShort, toText, toCSV,
  };
});
