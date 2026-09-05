# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)


## 한국 공휴일

한국천문연구원 특일정보의 공휴일 조회 API를 Rust에서 호출합니다.
공식 명세: https://www.data.go.kr/data/15012690/openapi.do

### 로컬 키 설정

- 개발: 프로젝트 루트의 .env.example을 .env로 복사하고 KASI_HOLIDAY_API_KEY 값을 설정합니다.
- 설치 앱: 프로세스 환경변수 KASI_HOLIDAY_API_KEY 또는 Tauri app_config_dir의 .env 파일을 사용합니다.
- 우선순위: 환경변수 → 앱 설정 디렉터리 .env → 개발 빌드에서만 프로젝트 루트 .env.
- 키는 실행 시 Rust에서 읽습니다. 키 수정 후 앱을 재시작하세요. 키를 빌드 산출물에 포함하거나 VITE_ 변수로 노출하지 않습니다.
- 일반 키와 percent-encoded 키를 모두 지원하며, percent decoding 한 번 후 query encoder로 한 번 인코딩합니다. 원래 키의 + 문자는 보존합니다.
- .env 및 .env.*는 gitignore 대상이며, .env.example만 예외입니다. 키가 담긴 파일은 배포 리소스에 넣지 마세요.

### 캐시와 장애 처리

- holiday_cache: year / date / name. 같은 날짜의 서로 다른 공휴일명을 보존합니다.
- holiday_cache_years: year / fetched_at / last_attempt_at. 성공한 빈 응답과 미조회 연도를 구분합니다. 시간은 Unix seconds입니다.
- 두 테이블은 기존 DB 초기화 트랜잭션 안에서 CREATE TABLE IF NOT EXISTS로 추가됩니다. 기존 근무/직원 데이터는 유지됩니다.
- 과거 연도는 성공한 캐시를 재사용합니다. 현재/미래 연도는 30일 TTL, 실패 재시도 간격은 1시간입니다.
- 연도 단위 요청(page size 100)과 필요한 경우에만 pagination을 사용합니다. 불완전/오류 응답은 캐시를 교체하지 않습니다.
- 공휴일 응답의 isHoliday=Y 항목만 표시합니다. 임시/대체공휴일도 이름이 아닌 공식 필드로 처리합니다.
- 네트워크 실패 시 이전 캐시, 캐시가 없으면 빈 목록을 반환합니다. URL/키/원문 네트워크 오류는 UI나 로그로 전달하지 않습니다.
- 날짜 메타데이터 전용이며 근무 상태/집계/급여 계산에는 영향을 주지 않습니다.

### 검증

- node --experimental-strip-types --test tests/*.test.mjs
- cargo test --manifest-path src-tauri/Cargo.toml
- 실제 키로 Rust provider와 캐시 왕복 확인(명시 실행 시에만 외부 요청):
  cargo test --manifest-path src-tauri/Cargo.toml live_provider_round_trip -- --ignored

실제 API 테스트는 임시 메모리 SQLite만 사용하고 실제 근무 DB는 수정하지 않습니다.
