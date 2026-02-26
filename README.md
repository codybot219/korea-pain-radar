# Korea Pain Radar (OpenClaw-friendly)

한국 커뮤니티/공개 게시판에서 pain signal(불편, 실패, 비용 부담, 반복 업무)을 수집하고,
시장성 있는 아이템 1개를 자동 선정해 Discord로 보고하는 도구입니다.

## What it does

1. **Collect**: RSS + 공개 HTML 게시판에서 제목/링크/요약 수집
2. **Analyze**: pain keyword, 긴급도, 결제/비용 신호 점수화
3. **Select**: 카테고리별 시장성 점수 계산 후 top 1 아이템 선정
4. **Report**: Discord webhook/cron을 통해 자동 보고

## Project structure

- `config/sources.json` - 수집 소스 정의
- `src/collect.js` - 수집 파이프라인
- `src/analyze.js` - pain 분석 및 아이템 선정
- `src/report-discord.js` - Discord 전송
- `src/discover-sources.js` - 신규 소스 자동 탐지/검증
- `src/source-auto-update.js` - 소스 자동 업데이트 엔진
- `src/run-once.js` - source-update → collect → analyze → report 원샷 실행
- `data/` - 산출물 저장

## Quick start

```bash
npm install
cp .env.example .env
# .env에 DISCORD_WEBHOOK_URL 설정
npm run once
```

드라이런:

```bash
npm run once -- --dry-run
```

개별 실행:

```bash
npm run collect
npm run analyze
npm run report
```

리포트만 생성 + 자동 git push:

```bash
npm run once:no-report:push
```

소스 자동 탐지:

```bash
npm run sources:discover
npm run sources:discover:write
npm run sources:auto-update:force
```

## Source types

### 1) RSS source

```json
{
  "id": "your-rss-source",
  "name": "Your Community RSS",
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "enabled": true,
  "maxItems": 80,
  "tags": ["community"],
  "weight": 1.0
}
```

### 2) HTML list source

```json
{
  "id": "your-html-source",
  "name": "Your Community Board",
  "type": "html-list",
  "url": "https://example.com/board",
  "itemSelector": "a",
  "includeLinkPattern": "\\/board\\/\\d+",
  "maxItems": 80,
  "enabled": true,
  "tags": ["community"],
  "weight": 1.0
}
```

## Current source pack

현재 기본 소스는 자동 확장 포함 **700+ (현재 723개)** 수준입니다.

주요 영역:
- Ruliweb
- Clien
- Nate Pann
- Ppomppu
- DCInside
- Dogdrip
- Etoland
- MLBPARK
- Inven
- Bobaedream
- SLRClub
- TodayHumor
- theqoo
- Reddit(보조 신호)

즉, 컴퓨터/IT에 한정되지 않고
관계/취업/재무/생활/정치·사회/취미/게임/소비까지 광범위하게 커버합니다.

## Auto source update behavior

- `run-once` 실행 시 소스 자동업데이트 due 여부를 먼저 확인
- 기본값: **24시간마다 1회** 신규 소스 탐지/검증 후 `sources.json` 업데이트
- 기본 discovery 기준: 리젠률 보장을 위해 최소 아이템 수 기준 적용

관련 환경변수:
- `PAIN_RADAR_AUTO_SOURCE_UPDATE` (기본 `1`)
- `PAIN_RADAR_SOURCE_UPDATE_INTERVAL_HOURS` (기본 `24`)
- `PAIN_RADAR_SOURCE_DISCOVERY_MIN_ITEMS` (기본 `12`)
- `PAIN_RADAR_SOURCE_DISCOVERY_MAX_NEW` (기본 `400`)
- `PAIN_RADAR_SOURCE_DISCOVERY_MAX_PROBES` (기본 `1500`)

## Auto push behavior (cron)

- `run-once`에 `--auto-push` 플래그를 주면 실행 후 자동으로 git push를 시도합니다.
- push 대상 파일:
  - `data/ideas/topic-tracker.md`
  - `data/reports/history.md`
- 설정형 활성화: `PAIN_RADAR_AUTO_PUSH=1`

## Output files

- `data/raw-posts.jsonl` - 원본 수집 데이터
- `data/collect-latest.json` - 마지막 수집 요약
- `data/analysis/latest-analysis.json` - 카테고리별 점수
- `data/ideas/latest-idea.json` - 최종 아이템
- `data/ideas/history.jsonl` - 아이디어 히스토리
- `data/ideas/latest-discord.md` - Discord 메시지 초안
- `data/source-discovery-latest.json` - 마지막 소스 탐지/검증 결과
- `data/source-discovery-state.json` - 자동업데이트 상태
- `data/reports/history.jsonl` - cron/수동 실행 리포트 누적 로그
- `data/reports/history.md` - 리포트 누적 마크다운 표

## Compliance policy

- 공개 접근 가능한 소스만 등록하세요.
- robots.txt / 이용약관 / API 정책을 준수하세요.
- 로그인 우회, 차단 우회, 비인가 수집, 과도한 요청은 금지합니다.

## Why this is useful

대형 자동화보다,
**실제 사용자 pain → 시장 아이템 후보**로 이어지는 실무 루프를 빠르게 구축합니다.

- 빠른 검증
- 낮은 운영 복잡도
- 수요 기반 아이디어 축적
