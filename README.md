# Korea Pain Radar (OpenClaw-friendly)

한국 커뮤니티/공개 게시판에서 pain signal(불편, 실패, 비용 부담, 반복 노동)을 수집하고,
시장성 있는 아이템 1개를 자동 선정해 Discord로 리포트하는 도구입니다.

## What it does

1. **Collect**: RSS + 공개 HTML 게시판에서 제목/링크/요약 수집
2. **Analyze**: pain keyword, 긴급도, 결제/비용 신호 점수화
3. **Select**: 카테고리별 시장성 점수 계산 후 top 1 아이템 선정
4. **Report**: Discord webhook으로 자동 발송

## Project structure

- `config/sources.json` - 수집 소스 정의
- `src/collect.js` - 수집 파이프라인
- `src/analyze.js` - pain 분석 및 아이템 선정
- `src/report-discord.js` - Discord 전송
- `src/run-once.js` - collect → analyze → report 원샷 실행
- `data/` - 산출물 저장

## Quick start

```bash
npm install
cp .env.example .env
# .env에 DISCORD_WEBHOOK_URL 설정
npm run once
```

드라이런(미리보기):

```bash
npm run once -- --dry-run
```

개별 실행:

```bash
npm run collect
npm run analyze
npm run report
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

## Default source pack (v0.4)

현재 기본 소스는 **180개**입니다.

- Ruliweb (질문/고민/커뮤니티)
- Clien (메인 + 다수 소모임/보드)
- Nate Pann (메인 + 다수 카테고리)
- Ppomppu (자유/이슈/상담/뉴스/쿠폰/생활 등 다중 보드)
- DCInside (개발/취업/주식 + 다수 영역 갤러리)
- Dogdrip (IT/재테크/요리/게임/일반/기타 보드)
- Old Reddit (Korea 관련 + startup/business + work/productivity)

즉, 컴퓨터/IT 영역에 한정되지 않고
관계/커리어/재무/생활/트렌드/취미 영역까지 크게 확장되어 있습니다.

추가로 `weight` 필드로 소스별 반영 강도를 조절할 수 있습니다.
예: 고의도 질문·상담 소스는 높게, 트렌드/노이즈 소스는 낮게.

## Output files

- `data/raw-posts.jsonl` - 원본 수집 데이터
- `data/collect-latest.json` - 마지막 수집 요약
- `data/analysis/latest-analysis.json` - 카테고리별 점수
- `data/ideas/latest-idea.json` - 최종 아이템
- `data/ideas/history.jsonl` - 아이디어 히스토리
- `data/ideas/latest-discord.md` - Discord 메시지 미리보기

## Compliance policy

- 공개 접근 가능한 소스만 등록하세요.
- robots.txt / 이용약관 / API 정책을 준수하세요.
- 로그인 우회, 차단 우회, 비인가 수집, 과도한 요청은 금지합니다.

## OpenClaw operation pattern (recommended)

- 2~4시간마다 `npm run once`
- Discord webhook으로 리포트 즉시 전송
- 필요 시 OpenClaw cron에서 주기 실행

## Why this is useful

대형 자동화보다,
**실제 사용자 pain → 시장 아이템 후보**로 이어지는 실무 루프를 빠르게 구축합니다.

- 빠른 검증
- 낮은 운영 복잡도
- 수요 기반 아이디어 축적
