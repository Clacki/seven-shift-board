# Seven Work Manager

로컬 PC에서 매장 직원의 주간 근무표, 실제 근무 기록, 월별 정산을 관리하는 데스크톱 애플리케이션입니다. 데이터는 SQLite에만 저장되며, Tauri v2 · React · TypeScript로 구성되어 있습니다.

## 주요 기능

- 월간 달력에서 기본 근무표와 실제 근무 기록을 함께 관리
- 직원별 기본 근무 템플릿, 활성 여부, 표시 색상 관리
- 실제 근무의 시간 변경·대타·추가 근무 기록 및 기본 일정 복원
- 야간 근무를 포함한 근무시간 계산과 겹치는 근무 경고
- 직원별 월간 정산: 정규·대타·추가 근무를 구분해 횟수와 시간을 집계
- 정산 내용을 요일과 함께 클립보드로 복사
- 공휴일 표시: 공공데이터포털 특일 정보 API를 사용하며 연도별 SQLite 캐시 지원
- 전체 데이터(SQLite)를 안전하게 내보내는 백업 기능

## 데이터와 백업

직원, 근무 템플릿, 실제 근무 기록, 앱 설정, 공휴일 캐시는 OS별 Tauri 앱 데이터 디렉터리의 `seven-work-manager.db`에 저장됩니다.

설정 화면의 **백업 파일 내보내기**는 데이터베이스 스냅샷을 선택한 `.db` 파일로 저장합니다. 저장 대상에 이미 파일이 있으면 덮어쓰지 않으며, 무결성 확인을 마친 완전한 백업만 저장합니다.

## 시작하기

### 요구 사항

- Node.js 20 이상 및 npm 또는 pnpm
- Rust stable toolchain
- [Tauri v2 플랫폼별 사전 요구 사항](https://v2.tauri.app/start/prerequisites/)

### 설치 및 개발 실행

```bash
npm install
npm run tauri dev
```

pnpm을 사용하는 경우에는 `npm` 대신 `pnpm`을 사용하면 됩니다.

### 공휴일 API 설정(선택)

공휴일을 불러오려면 `.env.example`을 복사해 프로젝트 루트에 `.env`를 만들고 키를 입력합니다.

```env
KASI_HOLIDAY_API_KEY=
```

키는 Git에 커밋하지 마세요. `.env`는 무시 대상이며, 키는 프런트엔드 번들에 포함되지 않고 Rust 프로세스에서만 사용됩니다. 키를 변경한 뒤에는 개발 앱을 다시 실행해야 합니다.

## 검증 명령

```bash
npm run lint
npm run build
node --experimental-strip-types --test tests/*.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
```

Windows 설치 파일을 만들려면 다음을 실행합니다.

```bash
npm run tauri build
```

생성된 번들은 보통 `src-tauri/target/release/bundle/` 아래에서 확인할 수 있습니다.

공휴일 공급자를 실제 키로 확인해야 할 때만 다음 ignored 테스트를 실행합니다.

```bash
cargo test --manifest-path src-tauri/Cargo.toml live_provider_round_trip -- --ignored
```

## 프로젝트 구조

```text
src/
  components/  React 화면 컴포넌트
  lib/         근무 분류·정산·달력·공휴일 등 공통 로직
src-tauri/
  src/         SQLite, Tauri command, 백업 및 공휴일 공급자
tests/         Node 기반 프런트엔드 단위 테스트
```

## 공휴일 API 출처

[공공데이터포털 한국천문연구원 특일 정보 OpenAPI](https://www.data.go.kr/data/15012690/openapi.do)를 사용합니다.
