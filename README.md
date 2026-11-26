# 달리는 스탑워치

선수가 트랙을 달리며 시간을 보여주는 스탑워치. 노란 선수가 한 바퀴 돌면 1분이고, 랩을 누를 때마다 그 랩의 선수가 자기 기록 위치에 멈춰 서서 기록을 한눈에 비교할 수 있다.

## 실행
- 파일 더블클릭: `index.html` (오프라인 설치 기능 제외 전부 동작)
- 로컬 서버: `python -m http.server 8765` → http://localhost:8765
- 테스트: 서버 실행 후 http://localhost:8765/tests/

## 구조
| 파일 | 역할 |
|---|---|
| `index.html`, `css/app.css` | 화면 |
| `js/core.js` | 시간 계산·저장·복원·통계·내보내기 (DOM 의존 없음, 테스트 대상) |
| `js/track.js` | 트랙 SVG와 선수 렌더링 |
| `js/i18n.js` | 한국어/영어 문자열 |
| `js/app.js` | 입력, 설정, 기록, 공유, 화면 켜짐 유지 |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (오프라인, 설치) |
| `docs/` | Android 출시 가이드, 개인정보처리방침, 스토어 문구, 테스트 체크리스트 |
| `스탑워치.html`, `달리는-스탑워치.html` | 초기 버전 (보관용) |

출시 절차는 [docs/ANDROID.md](docs/ANDROID.md) 참고.
