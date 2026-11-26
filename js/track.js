/* 트랙 SVG와 선수 렌더링 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const SAMPLES = 1440;          // 경로 미리 계산 지점 수 (프레임마다 getPointAtLength 호출 방지)
  const STRIDE_HZ = 1.5;         // 초당 걸음 주기
  const MAX_STANDING = 24;       // 화면에 서 있는 랩 선수 최대 수 (최고·최저는 항상 표시)
  const SLOTS = [-14, 14];       // 서 있는 선수가 설 레인(안쪽/바깥쪽)
  const MIN_GAP = 22;            // 같은 레인에서 이보다 가까우면 겹친 것으로 봄(px)

  const COLORS = {
    total: '#facc15',
    current: '#f5f5f4',
    lap: '#38bdf8',
    best: '#22c55e',
    worst: '#ef4444',
  };
  const HEADS = ['#1c1917', '#7c2d12', '#44403c', '#a16207', '#292524', '#57534e'];

  function el(tag, attrs, parent, before) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.insertBefore(e, before || null);
    return e;
  }

  function makeRunner(parent, jersey, idx, before) {
    const g = el('g', null, parent, before);
    const wrap = el('g', null, g);                 // 등장 애니메이션 전용(변환 속성 없음)
    el('ellipse', { cx: 0, cy: 1, rx: 11, ry: 3, fill: 'rgba(0,0,0,.25)' }, wrap);
    const body = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, wrap);
    const r = { g, wrap, body, facing: 1, rev: -1 };
    r.legBack = el('polyline', { stroke: '#57534e', 'stroke-width': 4 }, body);
    r.armBack = el('polyline', { stroke: '#57534e', 'stroke-width': 3.5 }, body);
    r.torso = el('line', { stroke: jersey, 'stroke-width': 7 }, body);
    r.head = el('circle', { r: 5.5, fill: HEADS[Math.max(0, idx) % HEADS.length], stroke: 'none' }, body);
    r.legFront = el('polyline', { stroke: '#1c1917', 'stroke-width': 4 }, body);
    r.armFront = el('polyline', { stroke: '#1c1917', 'stroke-width': 3.5 }, body);
    return r;
  }

  function setLabel(r, num, rev) {
    if (!r.label) r.label = el('text', { class: 'runner-label' }, r.wrap);
    r.label.textContent = String(num);
    if (rev > 0) {
      const ts = el('tspan', { class: 'runner-rev', dx: 2 }, r.label);
      ts.textContent = '+' + rev;
    }
    r.rev = rev;
  }

  const pts = a => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

  /** mode: 'run' | 'idle' | 'cheer' */
  function pose(r, phase, mode) {
    const amp = mode === 'run' ? 1 : mode === 'idle' ? 0.35 : 0.1;
    const bob = mode === 'run' ? -Math.abs(Math.cos(phase)) * 2 : 0;
    const hip = [0, -18 + bob];
    const sh = [mode === 'cheer' ? 1 : 3.5, -31 + bob];
    const head = [mode === 'cheer' ? 1.5 : 5.5, -39 + bob];

    const leg = p => {
      const a = Math.sin(p) * 0.85 * amp;
      const b = 0.15 + 1.2 * Math.max(0, Math.cos(p)) * amp;
      const knee = [hip[0] + 9.5 * Math.sin(a), hip[1] + 9.5 * Math.cos(a)];
      const foot = [knee[0] + 9.5 * Math.sin(a - b), knee[1] + 9.5 * Math.cos(a - b)];
      return [hip, knee, foot];
    };
    const arm = (p, side) => {
      let a, f;
      if (mode === 'cheer') { a = Math.PI - 0.45 * side; f = Math.PI - 0.15 * side; }
      else { a = -Math.sin(p) * 0.95 * amp; f = a + 1.5; }
      const elbow = [sh[0] + 7 * Math.sin(a), sh[1] + 7 * Math.cos(a)];
      return [sh, elbow, [elbow[0] + 6.5 * Math.sin(f), elbow[1] + 6.5 * Math.cos(f)]];
    };
    r.legFront.setAttribute('points', pts(leg(phase)));
    r.legBack.setAttribute('points', pts(leg(phase + Math.PI)));
    r.armFront.setAttribute('points', pts(arm(phase + Math.PI, 1)));
    r.armBack.setAttribute('points', pts(arm(phase, -1)));
    r.torso.setAttribute('x1', hip[0]); r.torso.setAttribute('y1', hip[1]);
    r.torso.setAttribute('x2', sh[0]); r.torso.setAttribute('y2', sh[1]);
    r.head.setAttribute('cx', head[0]); r.head.setAttribute('cy', head[1]);
  }

  function Track(svg) {
    this.svg = svg;
    const lane = svg.querySelector('#lane');
    this.L = lane.getTotalLength();
    this.table = [];
    for (let i = 0; i < SAMPLES; i++) {
      const d = (i / SAMPLES) * this.L;
      const p = lane.getPointAtLength(d);
      const q = lane.getPointAtLength((d + 1) % this.L);
      let tx = q.x - p.x, ty = q.y - p.y;
      const n = Math.hypot(tx, ty) || 1;
      tx /= n; ty /= n;
      this.table.push({ x: p.x, y: p.y, dx: tx, nx: -ty, ny: tx }); // n = 안쪽 방향 법선
    }
    this.progress = svg.querySelector('#progress');
    this.progress.style.strokeDasharray = this.L;
    this.ticksG = svg.querySelector('#ticks');
    this.standingG = svg.querySelector('#standing');
    this.moversG = svg.querySelector('#movers');
    this.main = makeRunner(this.moversG, COLORS.total, 0);
    this.lapRunner = null;
    this.lapRunnerNum = 0;
  }

  Track.prototype.at = function (frac) {
    frac -= Math.floor(frac);
    const f = frac * SAMPLES;
    const i = Math.floor(f) % SAMPLES, j = (i + 1) % SAMPLES, w = f - Math.floor(f);
    const a = this.table[i], b = this.table[j];
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, dx: a.dx, nx: a.nx, ny: a.ny };
  };

  /** 눈금 60개와 4분할 라벨 */
  Track.prototype.setTicks = function (quarterLabels) {
    const g = this.ticksG;
    g.textContent = '';
    for (let s = 0; s < 60; s++) {
      const t = this.at(s / 60);
      const major = s % 5 === 0;
      if (s) {
        const r0 = 28, r1 = major ? 19 : 24;
        el('line', {
          x1: t.x + t.nx * r0, y1: t.y + t.ny * r0,
          x2: t.x + t.nx * r1, y2: t.y + t.ny * r1,
          stroke: 'rgba(255,255,255,' + (major ? 0.9 : 0.45) + ')',
          'stroke-width': major ? 2 : 1,
        }, g);
      }
      if (s % 15 === 0) {
        el('text', { class: 'tick-label', x: t.x + t.nx * 46, y: t.y + t.ny * 46 }, g)
          .textContent = quarterLabels[s / 15];
      }
    }
  };

  /** offset: 바깥(+)/안쪽(-), s: 크기 */
  Track.prototype.place = function (r, frac, offset, s, smoothFacing) {
    const t = this.at(frac);
    const x = t.x - t.nx * offset, y = t.y - t.ny * offset + 10;
    if (smoothFacing) {
      if (t.dx > 0.25) r.facing = 1; else if (t.dx < -0.25) r.facing = -1;
    } else {
      r.facing = t.dx >= 0 ? 1 : -1;
    }
    r.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
    r.body.setAttribute('transform', 'scale(' + r.facing * s + ',' + s + ')');
    if (r.label) { r.label.setAttribute('x', 0); r.label.setAttribute('y', -46 * s - 6); }
  };

  /** 매 프레임: 전체 선수, 진행 중인 랩 선수, 진행 궤적 */
  Track.prototype.update = function (o) {
    const phase = (o.total / 1000) * STRIDE_HZ * 2 * Math.PI;
    const mode = o.running && !o.reduced ? 'run' : 'idle';
    const frac = (o.total % o.lapLen) / o.lapLen;

    this.place(this.main, frac, 0, 1.35, true);
    pose(this.main, phase, mode);

    if (this.lapRunner && o.split != null) {
      const rev = Math.floor(o.split / o.lapLen);
      if (rev !== this.lapRunner.rev) setLabel(this.lapRunner, this.lapRunnerNum, rev);
      this.place(this.lapRunner, (o.split % o.lapLen) / o.lapLen, 16, 1.15, true);
      pose(this.lapRunner, phase + 1.3, mode);
    }
    this.progress.style.strokeDashoffset = this.L * (1 - frac);
  };

  /** 진행 중인 랩을 달리는 선수 (num=null 이면 제거) */
  Track.prototype.setLapRunner = function (num) {
    if (num == null) {
      if (this.lapRunner) this.lapRunner.g.remove();
      this.lapRunner = null;
      return;
    }
    if (!this.lapRunner) this.lapRunner = makeRunner(this.moversG, COLORS.current, num, this.main.g);
    this.lapRunnerNum = num;
    this.lapRunner.head.setAttribute('fill', HEADS[num % HEADS.length]);
    setLabel(this.lapRunner, num, 0);
  };

  Track.prototype.lapColor = function (i, st) {
    return i === st.best ? COLORS.best : i === st.worst ? COLORS.worst : COLORS.lap;
  };

  /** 완주한 랩 선수들: 자기 랩 기록 위치에 서서 만세. 겹치면 오래된 선수를 작고 흐리게. */
  Track.prototype.setStanding = function (laps, st, lapLen, popIndex) {
    const g = this.standingG;
    g.textContent = '';
    const n = laps.length;
    if (!n) return;

    const pick = new Set();
    for (let i = Math.max(0, n - MAX_STANDING); i < n; i++) pick.add(i);
    if (st.best >= 0) pick.add(st.best);
    if (st.worst >= 0) pick.add(st.worst);

    const placed = [], items = [];
    [...pick].sort((a, b) => b - a).forEach(i => {   // 최신 랩부터 자리 배정
      const rev = Math.floor(laps[i] / lapLen);
      const frac = (laps[i] - rev * lapLen) / lapLen;
      const d = frac * this.L;
      let choice = null;
      for (const off of SLOTS) {
        let gap = Infinity;
        for (const p of placed) {
          if (p.off !== off) continue;
          let dd = Math.abs(p.d - d);
          gap = Math.min(gap, Math.min(dd, this.L - dd));
        }
        if (!choice || gap > choice.gap) choice = { off, gap };
      }
      placed.push({ d, off: choice.off });
      items.push({ i, frac, rev, off: choice.off, crowded: choice.gap < MIN_GAP });
    });

    items.reverse().forEach(it => {                    // 오래된 것부터 그려 최신이 위로
      const r = makeRunner(g, this.lapColor(it.i, st), it.i + 1);
      setLabel(r, it.i + 1, it.rev);
      const highlighted = it.i === st.best || it.i === st.worst || it.i === n - 1;
      const dim = it.crowded && !highlighted;
      this.place(r, it.frac, it.off, dim ? 0.85 : 1.05, false);
      pose(r, 0, 'cheer');
      if (dim) r.g.setAttribute('opacity', '0.55');
      if (it.i === popIndex) r.wrap.classList.add('runner-pop');
    });
  };

  root.SWTrack = { Track, COLORS };
})(typeof self !== 'undefined' ? self : this);
