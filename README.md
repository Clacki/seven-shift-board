# Seven Work Manager

매장의 월간 근무 일정, 실제 근무 변경, 직원별 근무 집계를 로컬에서 관리하는 데스크톱 앱입니다. Tauri v2, React, TypeScript, SQLite로 구성되어 있으며 데이터는 사용자의 PC에 저장됩니다.

## 주요 기능

### 월간 근무표

- 일요일부터 토요일까지 7열로 구성된 월간 달력
- 이전·다음 달 날짜, 오늘, 주말, 한국 공휴일 표시
- 직원별 기준색을 활용한 연한 카드 배경과 왼쪽 accent border
- 카드에서 직원명과 근무 시간을 두 줄로 표시
- 근무 카드를 클릭해 실제 담당자와 시간을 수정
- 추가 근무 등록 및 실제 근무 기록 삭제 시 기본 일정 복원

### 근무 상태

기본 근무와 최종 근무를 비교해 상태를 화면에 파생합니다. 상태는 DB에 별도로 저장하지 않으며, 하나의 근무에 여러 상태가 함께 표시될 수 있습니다.

- 추가
- 대타
- 조기출근 / 지각
- 조기퇴근 / 연장

예를 들어 기본 근무가 `형철 22:00-08:00`이고 실제 근무가 `선빈 23:00-09:00`이면 `대타`, `지각`, `연장`이 함께 표시됩니다. 야간 근무는 종료 시간이 시작 시간보다 이르면 다음 날 종료로 해석하므로 `22:00-08:00`은 10시간으로 계산됩니다.

### 근무 집계

- 월별 직원별 총 근무 횟수와 총 근무시간 집계
- 직원 선택 시 날짜별 상세 근무와 상태 badge 표시
- 활성 직원 중 근무가 없는 직원도 집계에 표시
- 비활성 직원은 해당 월에 근무 이력이 있을 때만 표시

### 직원 및 기본 근무 관리

- 직원 추가, 이름 수정, 활성/비활성 관리
- 직원별 표시 색상 선택과 추천 팔레트 제공
- 사용 중이지 않은 추천 색상을 우선 배정하는 신규 직원 기본색
- 기본 근무 추가, 수정, 활성/비활성 관리

## 한국 공휴일

한국천문연구원 특일정보 OpenAPI를 이용해 공휴일을 조회합니다. UI는 외부 API 응답 형식을 직접 알지 않으며, React → Tauri command → Rust holiday service 순서로 조회합니다.

- 날짜 헤더 오른쪽에 공휴일명을 표시
- 공휴일 날짜 셀에 아주 연한 rose 계열 tint 적용
- 직원 색상과 근무 상태 badge와는 별도의 날짜 metadata로 처리
- API 결과에서 공식 `isHoliday=Y` 항목만 사용
- 대체공휴일·임시공휴일은 API가 휴일로 제공하면 자동 반영

### 캐시와 장애 처리

공휴일은 SQLite에 연도 단위로 캐시합니다.

- 과거 연도: 캐시가 있으면 재사용
- 현재·미래 연도: 30일 TTL 이후 갱신
- API 실패 시: 기존 캐시를 반환하고, 캐시가 없으면 빈 목록으로 달력을 계속 표시
- 같은 연도에 대한 반복 요청은 캐시와 재시도 cooldown으로 줄임

## 시작하기

### 요구 사항

- Node.js 및 pnpm
- Rust toolchain
- Tauri v2의 플랫폼별 개발 환경

### 설치와 실행

```bash
pnpm install
```

공휴일을 표시하려면 `.env.example`을 복사해 `.env`를 만들고 API 키를 설정합니다.

```env
KASI_HOLIDAY_API_KEY=
```

실제 키는 Git에 커밋하지 않습니다. `.env`는 ignore 대상이며, `VITE_` 접두사를 사용하지 않아 프런트엔드 번들에 키가 포함되지 않습니다.

```bash
pnpm tauri dev
```

키는 Rust 프로세스 시작 시 읽으므로 `.env`를 변경한 뒤 앱을 다시 실행하세요. URL-encoded 또는 raw 형태의 service key 모두 이중 인코딩 없이 처리합니다.

## 데이터 저장

앱 데이터는 Tauri app data 디렉터리의 로컬 SQLite 데이터베이스 `seven-work-manager.db`에 저장됩니다. 직원, 기본 근무, 실제 근무, 공휴일 캐시를 안전한 migration으로 관리합니다.

## 프로젝트 구조

```text
src/
  components/        화면 컴포넌트와 탭 UI
  lib/               색상, 근무 상태, 날짜 등 공통 로직
src-tauri/
  src/               SQLite, 근무 계산, 공휴일 provider와 Tauri commands
  icons/             Windows 및 앱 번들 아이콘
public/
  icon.png           앱 아이콘과 favicon의 원본 이미지
```

근무 상태 판정은 `src/lib/shiftDisplay.ts`에서 한 번만 수행하며 월간 근무표와 근무 집계가 같은 결과를 사용합니다.

## 검증 명령

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
node --experimental-strip-types --test tests/*.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
```

Windows 설치 파일을 만들려면 다음 명령을 사용합니다.

```bash
pnpm tauri build
```

생성물은 일반적으로 `src-tauri/target/release/bundle/msi`와 `src-tauri/target/release/bundle/nsis`에서 확인할 수 있습니다. `public/icon.png`를 기준으로 생성된 Tauri 아이콘 세트가 Windows 실행 파일, 설치 파일, 시작 메뉴 및 바로가기 아이콘에 사용됩니다.

공휴일 provider의 실제 네트워크 호출을 확인하려면 키를 설정한 뒤 다음 ignored 테스트를 선택적으로 실행할 수 있습니다.

```bash
cargo test --manifest-path src-tauri/Cargo.toml live_provider_round_trip -- --ignored
```

## 공휴일 API 출처

[공공데이터포털 한국천문연구원 특일 정보 OpenAPI](https://www.data.go.kr/data/15012690/openapi.do)를 사용합니다.

---

Developed by 김광욱
