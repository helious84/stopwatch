/* 다국어 문자열. 키가 없으면 한국어 → 키 이름 순으로 대체한다. */
(function (root) {
  'use strict';

  const S = {
    ko: {
      appTitle: '달리는 스탑워치',
      trackDesc: '타원형 트랙. 노란 선수의 위치가 전체 시간을, 번호가 붙은 선수들이 각 랩 기록을 나타냅니다.',
      start: '출발', stop: '정지', resume: '계속', lap: '랩', reset: '초기화',
      lapN: '랩 {n}',
      lapsDone: '{n}바퀴 완주',
      legend1: '한 바퀴 = {len} · 노란 선수 = 전체 시간',
      legend2: '번호 선수 = 각 랩 기록 (+N = 바퀴 초과)',
      secN: '{n}초', minN: '{n}분', secShort: '{n}초',
      lapsLabel: '랩 기록',
      emptyLaps: '출발을 누르면 선수가 달리기 시작해요',
      best: '최고', worst: '최저', avg: '평균', total: '전체',
      lapCount: '랩 {n}개',
      history: '기록', settings: '설정', share: '공유', close: '닫기',
      exportCsv: 'CSV 저장', delete: '삭제', clearAll: '기록 전체 삭제',
      confirmClear: '저장된 기록을 모두 삭제할까요? 되돌릴 수 없어요.',
      noHistory: '아직 저장된 기록이 없어요.\n측정 후 초기화하면 여기에 보관돼요.',
      undo: '되돌리기', resetDone: '초기화했어요. 기록에 보관됨',
      deleted: '기록을 삭제했어요',
      copied: '클립보드에 복사했어요', copyFail: '복사하지 못했어요',
      lapLen: '트랙 한 바퀴', theme: '테마', themeSystem: '시스템 설정', themeLight: '라이트', themeDark: '다크',
      language: '언어', langAuto: '자동',
      sound: '효과음', soundDesc: '랩, 한 바퀴 통과 시',
      vibrate: '진동', vibrateDesc: '버튼을 누를 때',
      keepAwake: '화면 켜짐 유지', keepAwakeDesc: '측정 중 화면이 꺼지지 않게',
      about: '버전 {v} · 개인정보를 수집하지 않으며, 모든 기록은 이 기기에만 저장됩니다.',
      onboardTitle: '트랙을 보면 시간이 보여요',
      onboard1: '노란 선수가 트랙을 한 바퀴 돌면 1분이에요. 위치만 봐도 몇 초인지 알 수 있어요.',
      onboard2: '랩을 누르면 그 랩의 선수가 자기 기록 위치에 멈춰 서고, 새 선수가 출발해요.',
      onboard3: '출발선에 가까이 선 선수일수록 빠른 랩이에요. 초록이 최고, 빨강이 최저 기록이에요.',
      gotIt: '시작하기',
      keysHint: 'Space 출발/정지 · L 랩 · R 초기화',
      aStart: '측정 시작', aStop: '정지, {t}', aLap: '랩 {n}, {t}', aReset: '초기화',
      speakMS: '{m}분 {s}초', speakS: '{s}초',
    },
    en: {
      appTitle: 'Track Stopwatch',
      trackDesc: 'Oval running track. The yellow runner shows total time; numbered runners show each lap.',
      start: 'Start', stop: 'Stop', resume: 'Resume', lap: 'Lap', reset: 'Reset',
      lapN: 'Lap {n}',
      lapsDone: '{n} laps done',
      legend1: 'One lap = {len} · Yellow = total time',
      legend2: 'Numbered runners = lap times (+N = extra laps)',
      secN: '{n} s', minN: '{n} min', secShort: '{n}s',
      lapsLabel: 'Lap times',
      emptyLaps: 'Tap Start and the runner takes off',
      best: 'Best', worst: 'Worst', avg: 'Avg', total: 'Total',
      lapCount: '{n} laps',
      history: 'History', settings: 'Settings', share: 'Share', close: 'Close',
      exportCsv: 'Save CSV', delete: 'Delete', clearAll: 'Delete all history',
      confirmClear: 'Delete all saved sessions? This cannot be undone.',
      noHistory: 'No saved sessions yet.\nSessions are kept here when you reset.',
      undo: 'Undo', resetDone: 'Reset. Saved to history',
      deleted: 'Session deleted',
      copied: 'Copied to clipboard', copyFail: 'Could not copy',
      lapLen: 'One lap of the track', theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
      language: 'Language', langAuto: 'Auto',
      sound: 'Sound', soundDesc: 'On laps and each full lap',
      vibrate: 'Vibration', vibrateDesc: 'When tapping buttons',
      keepAwake: 'Keep screen on', keepAwakeDesc: 'While timing',
      about: 'Version {v} · No personal data is collected; everything stays on this device.',
      onboardTitle: 'Read the time from the track',
      onboard1: 'The yellow runner circles the track once a minute. Its position tells you the seconds at a glance.',
      onboard2: 'Tap Lap and that lap’s runner stops at its time on the track while a new runner sets off.',
      onboard3: 'Runners standing closer to the start line ran faster laps. Green is your best, red your worst.',
      gotIt: 'Get started',
      keysHint: 'Space start/stop · L lap · R reset',
      aStart: 'Started', aStop: 'Stopped, {t}', aLap: 'Lap {n}, {t}', aReset: 'Reset',
      speakMS: '{m} min {s} s', speakS: '{s} s',
    },
  };

  function resolve(pref) {
    if (pref === 'ko' || pref === 'en') return pref;
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }

  function make(lang) {
    const d = S[lang] || S.ko;
    return (key, vars) => {
      const str = d[key] != null ? d[key] : (S.ko[key] != null ? S.ko[key] : key);
      return str.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
    };
  }

  root.SWI18n = { S, resolve, make };
})(typeof self !== 'undefined' ? self : this);
