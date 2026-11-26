# Android(Google Play) 출시 가이드

## 추천 방식: TWA (Trusted Web Activity) — PWABuilder 사용

| | TWA (PWABuilder) | Capacitor |
|---|---|---|
| 필요한 도구 | 웹 브라우저만 (빌드는 PWABuilder 서버에서) | Node.js, JDK 17, Android Studio/SDK |
| 코드 | 지금 웹 코드 그대로 | 웹 코드 + 네이티브 플러그인 |
| 업데이트 | 웹사이트만 고치면 앱에 바로 반영 | 매번 새 빌드 업로드 |
| 측정 중 상시 알림(잠금화면에 시간 표시) | **불가** | 가능 (Foreground Service 플러그인) |

**결론:** 1.0은 TWA로 빠르게 출시하고, 리뷰에서 "잠금화면 알림" 요구가 많으면 Capacitor로 전환한다.
현재 앱은 종료·백그라운드 후에도 시간이 정확히 이어지므로(벽시계 기준 저장) 알림 없이도 기록은 유실되지 않는다.

## 1. 웹사이트 공개 (GitHub Pages)
1. GitHub 저장소 → **Settings → Pages** → Source: `main` / `(root)` → Save
2. 몇 분 뒤 `https://helious84.github.io/stopwatch/` 접속 확인
3. 크롬 개발자도구 → Lighthouse → PWA 항목 통과 확인

## 2. APK/AAB 만들기 (PWABuilder)
1. https://www.pwabuilder.com 에 위 주소 입력 → **Package for stores → Android**
2. Package ID 예: `io.github.helious84.stopwatch`, 앱 이름 `달리는 스탑워치`
3. 서명 키: "새로 만들기" 선택 → 받은 zip 안의 **signing.keystore와 비밀번호를 안전한 곳에 백업** (잃어버리면 앱 업데이트 불가)
4. zip 안의 `assetlinks.json` 을 **도메인 최상위** `/.well-known/assetlinks.json` 에 올려야 주소창 없이 실행된다.
   - `helious84.github.io/stopwatch` 는 하위 경로이므로, `helious84/helious84.github.io` 저장소를 만들어 `.well-known/assetlinks.json` 을 넣는다.
   - Play Console의 "앱 서명 키" SHA-256 지문도 assetlinks.json 에 추가해야 한다(Play 앱 서명 사용 시).

## 3. Play Console 등록
1. 개발자 계정 등록(1회 25달러). 개인 계정은 출시 전 **비공개 테스트(테스터 12명, 14일)** 요건이 있다.
2. 앱 만들기 → AAB 업로드(내부 테스트 → 비공개 테스트 → 프로덕션)
3. 스토어 등록정보: `docs/STORE_LISTING.md`
4. 개인정보처리방침 URL: `docs/PRIVACY.md` 를 GitHub Pages로 공개한 주소
5. 데이터 보안 섹션: **수집 데이터 없음, 공유 데이터 없음**
6. 콘텐츠 등급 설문, 타겟 연령(전체), 광고 없음 체크

## 4. 출시 때마다
- `sw.js` 의 `CACHE` 버전과 `js/app.js` 의 `APP_VERSION` 을 함께 올린다 (안 올리면 사용자 기기에 옛 파일이 남는다).
- `tests/index.html` 전부 통과, `docs/TEST_CHECKLIST.md` 확인.
