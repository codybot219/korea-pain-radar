# Korea Pain Radar (OpenClaw-friendly)

한국 커뮤니티/국내 공개 피드에서 pain signal(불편·실패·비용부담·반복노동)을 수집하고,
시장성 높은 아이템 1개를 자동으로 뽑아 Discord로 보고하는 툴입니다.

## What it does

1. **Collect**: 공개 RSS 피드에서 글 제목/요약/링크 수집
2. **Analyze**: pain keyword, 긴급도, 결제 신호 기반 점수화
3. **Select**: 카테고리별 시장성 점수 계산 후 top 1 아이템 선정
4. **Report**: Discord webhook으로 요약 리포트 발송

## Project structure

- `config/sources.json` - 크롤링 소스 목록
- `src/collect.js` - 수집 파이프라인
- `src/analyze.js` - pain 분석 및 아이템 선정
- `src/report-discord.js` - Discord 전송
- `src/run-once.js` - collect → analyze → report one-shot
- `data/` - 수집/분석 산출물

## Quick start

```bash
npm install
cp .env.example .env
# .env에 DISCORD_WEBHOOK_URL 설정
npm run once
```

보고만 미리보기:

```bash
npm run once -- --dry-run
```

수집/분석/리포트 개별 실행:

```bash
npm run collect
npm run analyze
npm run report
```

## Output files

- `data/raw-posts.jsonl` - 원본 수집 데이터
- `data/collect-latest.json` - 마지막 수집 요약
- `data/analysis/latest-analysis.json` - 카테고리별 점수
- `data/ideas/latest-idea.json` - 최종 선정 아이템
- `data/ideas/latest-discord.md` - Discord 메시지 미리보기

## Source policy

- `sources.json`에 **공개 접근 가능한 피드만** 등록하세요.
- 각 사이트 **robots.txt / 이용약관 / API 정책**을 반드시 준수하세요.
- 로그인 우회, 차단 우회, 과도한 요청은 금지합니다.

## Example sources

기본 샘플은 공개 RSS 기반입니다. 필요하면 직접 교체하세요.

```json
{
  "id": "your-source",
  "name": "Your Community",
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "enabled": true,
  "tags": ["community"]
}
```

## OpenClaw operation pattern (recommended)

이 툴은 OpenClaw 환경에서 다음처럼 돌리기 좋습니다:

- 주기 실행: 2~4시간마다 `npm run once`
- Discord 보고: webhook 기반 즉시 전송
- 추후 확장: OpenClaw cron `agentTurn`에서 `exec`로 호출 후 채널 announce

## Why this is useful

AgentHQ처럼 큰 자동화보다,
**실제 시장 문제를 계속 수집하고 아이템을 좁혀주는 실무형 루프**에 집중했습니다.

- 빠른 검증
- 낮은 운영 복잡도
- 실제 수요 기반 아이디어 축적
