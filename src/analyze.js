const path = require('node:path')
const {
  ROOT,
  DATA_DIR,
  readJsonl,
  writeJson,
  appendJsonl,
  loadEnvFile,
} = require('./utils')

const RAW_POSTS_PATH = path.join(DATA_DIR, 'raw-posts.jsonl')
const ANALYSIS_LATEST_PATH = path.join(DATA_DIR, 'analysis', 'latest-analysis.json')
const IDEA_LATEST_PATH = path.join(DATA_DIR, 'ideas', 'latest-idea.json')
const IDEA_HISTORY_PATH = path.join(DATA_DIR, 'ideas', 'history.jsonl')
const IDEA_MARKDOWN_PATH = path.join(DATA_DIR, 'ideas', 'latest-discord.md')

const PAIN_LEXICON = [
  { label: '도움요청', re: /도와주|도움|문의|질문드려|알려주|해결.?안/gi },
  { label: '도움요청(EN)', re: /\bhelp\b|any advice|how do i|how can i|looking for advice/gi },
  { label: '불편', re: /불편|번거롭|불편함|고생/gi },
  { label: '시간소모', re: /시간.?낭비|시간.?오래|시간.?많이|느리|지연/gi },
  { label: '복잡', re: /복잡|헷갈|어렵|난해|too complex|confusing/gi },
  { label: '실패', re: /안되|안 돼|실패|오류|버그|고장|렉|버퍼링|끊김|not working|doesn'?t work|error|failed|issue/gi },
  { label: '스트레스', re: /짜증|스트레스|빡세|빡침|답답|두렵|무섭|frustrat|stress|anxious/gi },
  { label: '건강걱정', re: /아프|통증|병원|수술|증후군|장애|부상|pain|hospital|surgery/gi },
  { label: '비용부담', re: /비싸|가격|비용|돈.?아깝|부담금|보험료|expensive|cost|price|budget/gi },
  { label: '반복노동', re: /반복|수작업|노가다|복붙|수동|manual|repetitive/gi },
]

const URGENCY_LEXICON = [
  /급하|당장|빨리|즉시|도와주세요/gi,
  /마감|데드라인|일정.?촉박/gi,
  /오늘.?안에|이번.?주|이번.?달|며칠.?고생/gi,
  /urgent|asap|right away|deadline|running out of time/gi,
]

const PAY_SIGNAL_LEXICON = [
  /유료|결제|구독/gi,
  /비용|가격|예산|단가/gi,
  /돈.?주고|월\s*\d+|만원|원\s*지불/gi,
  /paid|subscription|pricing|willing to pay|budget/gi,
]

const CATEGORY_RULES = [
  {
    id: 'workflow-automation',
    label: '반복업무 자동화',
    keywords: ['엑셀', '복붙', '반복', '수작업', '정리', '보고서', '업무', '자동화', '매크로', 'automation', 'manual', 'spreadsheet'],
  },
  {
    id: 'tech-support-assistant',
    label: '일상 기술문제 해결',
    keywords: ['계정', '로그인', '버퍼링', '렉', '오류', '안되', '저장', '매칭', '설정', '패치', 'account', 'login', 'error', 'bug', 'issue', 'not working'],
  },
  {
    id: 'career-anxiety-tooling',
    label: '커리어/직장 불안 해결',
    keywords: ['이직', '경력', '취업', '출근', '직장', '면접', '선배님', '커리어', 'career', 'job', 'interview', 'resume', 'work anxiety'],
  },
  {
    id: 'healthcare-life-admin',
    label: '생활행정/헬스케어 불편',
    keywords: ['병원', '통증', '수술', '증후군', '보험', '부담금', '장애', '진료', '약', 'hospital', 'clinic', 'pain', 'surgery', 'medical'],
  },
  {
    id: 'finance-insurance-guidance',
    label: '보험/재무 의사결정 보조',
    keywords: ['보험', '부담금', '보험금', '동일증권', '환율', '주식', '금리', '지출', 'insurance', 'invest', 'stock', 'price', 'cost', 'budget'],
  },
  {
    id: 'creator-content-ops',
    label: '콘텐츠 제작/운영 자동화',
    keywords: ['영상', '편집', '썸네일', '업로드', '릴스', '쇼츠', '블로그', '콘텐츠', '크리에이터', 'content', 'creator', 'youtube', 'thumbnail'],
  },
  {
    id: 'smallbiz-operations',
    label: '소상공인 운영 효율',
    keywords: ['매장', '사장', '재고', '발주', '예약', '주문', '손님', '사입', '매출', 'restaurant', 'store', 'inventory', 'booking', 'order'],
  },
  {
    id: 'expat-life-korea',
    label: '외국인 한국생활 문제 해결',
    keywords: ['visa', 'housing', 'landlord', 'korea', 'foreigner', 'immigration', 'arc', 'korean class'],
  }
]

const PLAYBOOK = {
  'workflow-automation': {
    title: '국내 중소팀 반복업무 자동화 코파일럿',
    targetUsers: '운영/백오피스 담당자, 소규모 팀 리더',
    mvp: [
      '엑셀/CSV 업로드 후 반복 패턴 자동 추론',
      '자주 하는 정리/변환 작업을 원클릭 플레이북으로 저장',
      '카카오/슬랙/디스코드로 일일 요약 자동 발송',
    ],
    goToMarket: '커뮤니티 내 실무자 그룹 + 템플릿 공유형 프리미엄 모델',
  },
  'tech-support-assistant': {
    title: '일상 디지털 문제 해결 코파일럿',
    targetUsers: '게임/앱 사용 중 오류를 자주 겪는 일반 사용자',
    mvp: [
      '증상 문장 입력 → 가능한 원인/해결 순서 추천',
      '기기/플랫폼별 해결 시나리오 자동 분기',
      '재현 로그 기반 커뮤니티 지식베이스 자동 업데이트',
    ],
    goToMarket: '커뮤니티 플러그인(질문글 자동 답변 제안)부터 시작',
  },
  'career-anxiety-tooling': {
    title: '이직·출근 불안 완화 루틴 매니저',
    targetUsers: '직장인/이직 준비자',
    mvp: [
      '상황별 체크리스트(출근 불안, 면접 준비, 경력 정리)',
      '하루 단위 실행 루틴 + 멘탈 상태 기록',
      '경력/이력서 자동 구조화 템플릿',
    ],
    goToMarket: '직장인 커뮤니티 베타 + 코칭 파트너십 결합',
  },
  'healthcare-life-admin': {
    title: '증상·보험·진료 준비 통합 어시스턴트',
    targetUsers: '만성 통증/수술/보험 청구를 관리해야 하는 일반인',
    mvp: [
      '증상 타임라인 + 병원 질문 리스트 자동 생성',
      '보험 청구/장애 신청 준비 서류 체크리스트',
      '가족 돌봄 상황용 일정/복약 알림',
    ],
    goToMarket: '환자 커뮤니티 + 보험청구 실무 블로그 채널 중심',
  },
  'finance-insurance-guidance': {
    title: '보험·재무 의사결정 비교 도우미',
    targetUsers: '보험 리모델링/재무 의사결정이 어려운 사용자',
    mvp: [
      '상품 조건 입력 시 핵심 비교 포인트 자동 추출',
      '부담금/보장 공백 위험 시나리오 시뮬레이션',
      '커뮤니티 Q&A 기반 질문 템플릿 자동 추천',
    ],
    goToMarket: '보험·재테크 커뮤니티와 공동 콘텐츠 배포',
  },
  'expat-life-korea': {
    title: '외국인 한국생활 문제 해결 허브',
    targetUsers: '한국 거주 외국인/유학생/예정자',
    mvp: [
      '비자·주거·은행·통신 이슈 해결 가이드 자동 추천',
      '서류/절차 체크리스트 생성',
      '지역·언어별 커뮤니티 QA 추천',
    ],
    goToMarket: 'expat 커뮤니티 + 유학/정착 채널과 파트너십',
  },
  'creator-content-ops': {
    title: '1인 크리에이터 콘텐츠 운영 자동화 툴',
    targetUsers: '유튜브/블로그/인스타 운영자',
    mvp: [
      '콘텐츠 아이디어 큐와 제작 체크리스트 자동화',
      '게시 전 썸네일/제목 A/B 후보 자동 생성',
      '채널별 업로드 일정/성과 리포트 자동 집계',
    ],
    goToMarket: '크리에이터 커뮤니티 체험판 + 팀 기능 유료화',
  },
  'smallbiz-operations': {
    title: '소상공인 운영 어시스턴트 (재고·예약·알림)',
    targetUsers: '동네 매장 사장님/매니저',
    mvp: [
      '재고 변동·발주 타이밍 알림',
      '예약/주문 통합 현황판',
      '매일 마감 리포트 자동 생성',
    ],
    goToMarket: '업종별 템플릿(카페/미용/학원)부터 시작',
  },
}

function asNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function countMatches(text, regex) {
  const matches = text.match(regex)
  return matches ? matches.length : 0
}

function classifyPost(post) {
  const text = `${post.title || ''} ${post.summary || ''} ${post.text || ''}`.toLowerCase()

  const painHits = {}
  let painScore = 0
  for (const lex of PAIN_LEXICON) {
    const count = countMatches(text, lex.re)
    if (!count) continue
    painHits[lex.label] = count
    painScore += count
  }

  let urgencyScore = 0
  for (const re of URGENCY_LEXICON) urgencyScore += countMatches(text, re)

  let paySignalScore = 0
  for (const re of PAY_SIGNAL_LEXICON) paySignalScore += countMatches(text, re)

  const categories = []
  for (const category of CATEGORY_RULES) {
    const keywordHits = category.keywords.reduce((acc, keyword) => {
      return text.includes(keyword.toLowerCase()) ? acc + 1 : acc
    }, 0)
    if (keywordHits > 0) categories.push({ categoryId: category.id, categoryLabel: category.label, keywordHits })
  }

  if (!categories.length) {
    if (/병원|통증|수술|증후군|보험|부담금|장애|hospital|medical|surgery/.test(text)) {
      categories.push({ categoryId: 'healthcare-life-admin', categoryLabel: '생활행정/헬스케어 불편', keywordHits: 1 })
    } else if (/이직|출근|경력|취업|면접|직장|career|job|interview|work/.test(text)) {
      categories.push({ categoryId: 'career-anxiety-tooling', categoryLabel: '커리어/직장 불안 해결', keywordHits: 1 })
    } else if (/계정|버퍼링|렉|오류|안되|매칭|저장|설정|패치|error|issue|not working|login/.test(text)) {
      categories.push({ categoryId: 'tech-support-assistant', categoryLabel: '일상 기술문제 해결', keywordHits: 1 })
    } else if (/보험|환율|주식|용돈|비용|가격|부담|insurance|stock|cost|price|budget/.test(text)) {
      categories.push({ categoryId: 'finance-insurance-guidance', categoryLabel: '보험/재무 의사결정 보조', keywordHits: 1 })
    } else if (/visa|housing|immigration|foreigner|expat|arc/.test(text)) {
      categories.push({ categoryId: 'expat-life-korea', categoryLabel: '외국인 한국생활 문제 해결', keywordHits: 1 })
    }
  }

  const publishedAtMs = post.publishedAt ? new Date(post.publishedAt).getTime() : Date.now()
  const ageHours = Number.isFinite(publishedAtMs) ? Math.max(0, (Date.now() - publishedAtMs) / 3600000) : 999
  const recencyBoost = ageHours <= 24 ? 1.35 : ageHours <= 72 ? 1.15 : 1

  const signalScore = (painScore * 2 + urgencyScore * 1.4 + paySignalScore * 1.8) * recencyBoost

  return {
    painScore,
    urgencyScore,
    paySignalScore,
    painHits,
    categories,
    signalScore: Number(signalScore.toFixed(2)),
    ageHours: Number(ageHours.toFixed(1)),
  }
}

function buildCategorySummary(signals) {
  const grouped = new Map()

  for (const signal of signals) {
    const categories = signal.meta.categories.length
      ? signal.meta.categories
      : [{ categoryId: 'uncategorized', categoryLabel: '기타/탐색' }]

    for (const category of categories) {
      const current = grouped.get(category.categoryId) || {
        categoryId: category.categoryId,
        categoryLabel: category.categoryLabel,
        mentions: 0,
        totalSignalScore: 0,
        totalPain: 0,
        totalUrgency: 0,
        totalPaySignals: 0,
        uniqueSources: new Set(),
        painHitMap: new Map(),
        evidence: [],
      }

      current.mentions += 1
      current.totalSignalScore += signal.meta.signalScore
      current.totalPain += signal.meta.painScore
      current.totalUrgency += signal.meta.urgencyScore
      current.totalPaySignals += signal.meta.paySignalScore
      current.uniqueSources.add(signal.post.sourceId)

      for (const [label, count] of Object.entries(signal.meta.painHits)) {
        current.painHitMap.set(label, (current.painHitMap.get(label) || 0) + count)
      }

      current.evidence.push({
        sourceName: signal.post.sourceName,
        sourceId: signal.post.sourceId,
        title: signal.post.title,
        link: signal.post.link,
        publishedAt: signal.post.publishedAt,
        signalScore: signal.meta.signalScore,
        painScore: signal.meta.painScore,
        paySignalScore: signal.meta.paySignalScore,
      })

      grouped.set(category.categoryId, current)
    }
  }

  return [...grouped.values()]
    .map((item) => {
      const avgSignal = item.mentions > 0 ? item.totalSignalScore / item.mentions : 0
      const sourceDiversity = item.uniqueSources.size
      const marketScore =
        item.mentions * 2 +
        avgSignal * 1.8 +
        item.totalPaySignals * 1.5 +
        sourceDiversity * 1.2 +
        item.totalUrgency * 0.8

      const topPainTerms = [...item.painHitMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([label, count]) => `${label}(${count})`)

      const evidence = item.evidence
        .sort((a, b) => b.signalScore - a.signalScore)
        .slice(0, 5)

      return {
        categoryId: item.categoryId,
        categoryLabel: item.categoryLabel,
        mentions: item.mentions,
        avgSignalScore: Number(avgSignal.toFixed(2)),
        totalPaySignals: item.totalPaySignals,
        totalUrgency: item.totalUrgency,
        sourceDiversity,
        marketScore: Number(marketScore.toFixed(2)),
        topPainTerms,
        evidence,
      }
    })
    .sort((a, b) => b.marketScore - a.marketScore)
}

function makeIdea(topCategory) {
  const playbook = PLAYBOOK[topCategory.categoryId] || {
    title: `${topCategory.categoryLabel} 해결 SaaS`,
    targetUsers: '문제를 반복적으로 겪는 국내 온라인 사용자/실무자',
    mvp: [
      '문제 발생 패턴 자동 수집 및 분류',
      '우선순위 높은 이슈를 해결하는 워크플로우 자동화',
      '성과를 숫자로 보여주는 리포트/알림',
    ],
    goToMarket: '커뮤니티 기반 베타 사용자 모집 후 문제-해결 템플릿 확장',
  }

  return {
    ideaId: `idea-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    headline: playbook.title,
    categoryId: topCategory.categoryId,
    categoryLabel: topCategory.categoryLabel,
    marketScore: topCategory.marketScore,
    targetUsers: playbook.targetUsers,
    whyNow: [
      `최근 ${topCategory.mentions}건의 반복 불만 시그널이 관측됨`,
      `서로 다른 소스 ${topCategory.sourceDiversity}곳에서 동시 발생`,
      `결제/비용 관련 시그널 ${topCategory.totalPaySignals}건 포착`,
    ],
    painSummary: topCategory.topPainTerms,
    mvp: playbook.mvp,
    goToMarket: playbook.goToMarket,
    evidence: topCategory.evidence,
  }
}

function renderDiscordMarkdown(idea, analysisMeta) {
  const lines = []
  lines.push('🚨 **Korea Pain Radar: 오늘의 시장 아이템**')
  lines.push(`- **아이템:** ${idea.headline}`)
  lines.push(`- **카테고리:** ${idea.categoryLabel}`)
  lines.push(`- **Market Score:** ${idea.marketScore}`)
  lines.push(`- **분석 윈도우:** 최근 ${analysisMeta.windowHours}시간 / 샘플 ${analysisMeta.sampleSize}건`)
  lines.push('')

  lines.push('**왜 지금?**')
  for (const reason of idea.whyNow) lines.push(`- ${reason}`)
  lines.push('')

  lines.push('**핵심 Pain 키워드**')
  for (const term of idea.painSummary) lines.push(`- ${term}`)
  lines.push('')

  lines.push('**MVP 제안 (1~2주)**')
  for (const item of idea.mvp) lines.push(`- ${item}`)
  lines.push('')

  lines.push('**GTM 초안**')
  lines.push(`- ${idea.goToMarket}`)
  lines.push('')

  lines.push('**근거 시그널 (상위 5)**')
  for (const e of idea.evidence) {
    const safeLink = e.link ? `<${e.link}>` : '(link 없음)'
    lines.push(
      `- [${e.sourceName}] ${e.title} | pain=${e.painScore}, pay=${e.paySignalScore} | ${safeLink}`,
    )
  }

  return lines.join('\n')
}

async function runAnalyze() {
  loadEnvFile()

  const windowHours = asNumber(process.env.PAIN_RADAR_WINDOW_HOURS, 72)
  const posts = readJsonl(RAW_POSTS_PATH)

  const cutoff = Date.now() - windowHours * 3600000
  const scopedPosts = posts.filter((post) => {
    const ts = post.publishedAt ? new Date(post.publishedAt).getTime() : 0
    return Number.isFinite(ts) && ts >= cutoff
  })

  const signals = scopedPosts
    .map((post) => ({ post, meta: classifyPost(post) }))
    .filter((entry) => entry.meta.signalScore > 0)

  const categories = buildCategorySummary(signals)
  const rankedBusinessCategories = categories.filter((entry) => entry.categoryId !== 'uncategorized')
  const topCategory = rankedBusinessCategories[0] || categories[0] || null

  const analysis = {
    ok: true,
    analyzedAt: new Date().toISOString(),
    windowHours,
    totalStoredPosts: posts.length,
    sampleSize: scopedPosts.length,
    signalSize: signals.length,
    categories,
  }

  writeJson(ANALYSIS_LATEST_PATH, analysis)

  if (!topCategory) {
    const emptyIdea = {
      ideaId: `idea-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      headline: '시그널 부족: 소스 확대 필요',
      categoryLabel: '탐색 단계',
      marketScore: 0,
      targetUsers: 'n/a',
      whyNow: ['현재 분석 기간 내 pain 시그널이 충분하지 않음'],
      painSummary: [],
      mvp: ['소스 확대 후 재분석'],
      goToMarket: 'n/a',
      evidence: [],
    }

    writeJson(IDEA_LATEST_PATH, emptyIdea)
    appendJsonl(IDEA_HISTORY_PATH, emptyIdea)
    require('node:fs').writeFileSync(IDEA_MARKDOWN_PATH, renderDiscordMarkdown(emptyIdea, analysis), 'utf8')

    return { analysis, idea: emptyIdea }
  }

  const idea = makeIdea(topCategory)
  writeJson(IDEA_LATEST_PATH, idea)
  appendJsonl(IDEA_HISTORY_PATH, idea)
  require('node:fs').writeFileSync(IDEA_MARKDOWN_PATH, renderDiscordMarkdown(idea, analysis), 'utf8')

  return { analysis, idea }
}

if (require.main === module) {
  runAnalyze()
    .then(({ analysis, idea }) => {
      console.log(
        JSON.stringify(
          {
            ok: true,
            analyzedAt: analysis.analyzedAt,
            sampleSize: analysis.sampleSize,
            signalSize: analysis.signalSize,
            topCategory: idea.categoryLabel || analysis.categories[0]?.categoryLabel || null,
            headline: idea.headline,
            marketScore: idea.marketScore,
          },
          null,
          2,
        ),
      )
    })
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(JSON.stringify({ ok: false, error: reason }))
      process.exit(1)
    })
}

module.exports = {
  runAnalyze,
  renderDiscordMarkdown,
}
