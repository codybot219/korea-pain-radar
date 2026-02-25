const fs = require('node:fs')
const path = require('node:path')
const { ROOT, DATA_DIR, readJson, writeJson, loadEnvFile } = require('./utils')
const { fetchHtmlList } = require('./lib/html-list')
const { fetchRss } = require('./lib/rss')

const SOURCES_PATH = path.join(ROOT, 'config', 'sources.json')
const DISCOVERY_REPORT_PATH = path.join(DATA_DIR, 'source-discovery-latest.json')

const DISCOVERY_SEEDS = {
  clien: ['https://www.clien.net/service/board/park'],
  pann: ['https://pann.nate.com/talk'],
  ppomppu: ['https://www.ppomppu.co.kr/zboard/zboard.php?id=freeboard'],
  dogdrip: ['https://www.dogdrip.net/dogdrip'],
  dcinside: [
    'https://gall.dcinside.com/board/lists?id=dcbest',
    'https://gall.dcinside.com/board/lists?id=programming',
    'https://gall.dcinside.com/board/lists?id=stock',
    'https://gall.dcinside.com/board/lists?id=employment',
  ],
}

const REDDIT_DISCOVERY_LIST = [
  'korea',
  'hanguk',
  'koreatravel',
  'korean',
  'living_in_korea',
  'teachinginkorea',
  'koreanadvice',
  'startup',
  'Entrepreneur',
  'smallbusiness',
  'kpophelp',
  'kpopthoughts',
  'PersonalFinance',
  'jobs',
  'cscareerquestions',
  'sideproject',
  'EntrepreneurRideAlong',
  'freelance',
  'digitalnomad',
  'productivity',
]

function asNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback
  const raw = String(value).trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

function getFlagValue(flagName) {
  const match = process.argv.find((arg) => arg.startsWith(`${flagName}=`))
  if (!match) return null
  return match.slice(flagName.length + 1)
}

async function fetchText(url, { userAgent, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`http-${res.status}`)
    }

    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function collectMatches(html, regex, normalize) {
  const set = new Set()
  const source = String(html || '')
  let match = null
  while ((match = regex.exec(source)) != null) {
    const value = normalize ? normalize(match) : match[1]
    if (!value) continue
    set.add(String(value).trim())
  }
  return [...set]
}

function defaultWeightForSource(source) {
  const id = String(source.id || '').toLowerCase()
  if (/consult|kin|qna|question|employment|job|advice/.test(id)) return 1.0
  if (/issue|politics|dcbest|story|girlgroup|duck/.test(id)) return 0.5
  if (/stock|finance|tax|loan|card/.test(id)) return 0.82
  if (/startup|entrepreneur|smallbusiness|personalfinance|jobs|freelance|digitalnomad|productivity/.test(id))
    return 0.42
  if (/reddit-/.test(id)) return 0.68
  return 0.62
}

function buildClienSource(slug) {
  const clean = String(slug || '').trim().toLowerCase()
  if (!clean) return null
  return {
    id: `clien-${clean}`,
    name: `Clien ${clean}`,
    type: 'html-list',
    url: `https://www.clien.net/service/board/${clean}`,
    itemSelector: 'a',
    includeLinkPattern: `\\/service\\/board\\/${clean}\\/\\d+`,
    maxItems: 24,
    enabled: true,
    tags: ['kr-community', 'autodiscovered', 'clien'],
    weight: defaultWeightForSource({ id: `clien-${clean}` }),
  }
}

function buildPannSource(categoryId) {
  const clean = String(categoryId || '').trim().toLowerCase()
  if (!/^c\d+$/.test(clean)) return null
  return {
    id: `pann-${clean}`,
    name: `Nate Pann ${clean}`,
    type: 'html-list',
    url: `https://pann.nate.com/talk/${clean}`,
    itemSelector: 'a',
    includeLinkPattern: '\\/talk\\/\\d+',
    excludeLinkPattern: '\\/reply\\/',
    maxItems: 32,
    enabled: true,
    tags: ['kr-community', 'autodiscovered', 'pann'],
    weight: defaultWeightForSource({ id: `pann-${clean}` }),
  }
}

function buildPpomppuSource(boardId) {
  const clean = String(boardId || '').trim()
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return null
  return {
    id: `ppomppu-${clean}`,
    name: `Ppomppu ${clean}`,
    type: 'html-list',
    url: `https://www.ppomppu.co.kr/zboard/zboard.php?id=${clean}`,
    itemSelector: 'a',
    includeLinkPattern: `view\\.php\\?id=${clean}[^\\n\\r\\"']*no=\\d+`,
    maxItems: 28,
    enabled: true,
    tags: ['kr-community', 'autodiscovered', 'ppomppu'],
    weight: defaultWeightForSource({ id: `ppomppu-${clean}` }),
  }
}

function buildDogdripSource(slug) {
  const clean = String(slug || '').trim().toLowerCase()
  if (!/^[a-z0-9_]+$/.test(clean)) return null
  if (clean === 'suggests') return null
  return {
    id: `dogdrip-${clean}`,
    name: `Dogdrip ${clean}`,
    type: 'html-list',
    url: `https://www.dogdrip.net/${clean}`,
    itemSelector: 'a',
    includeLinkPattern: `\\/${clean}\\/\\d+`,
    maxItems: 24,
    enabled: true,
    tags: ['kr-community', 'autodiscovered', 'dogdrip'],
    weight: defaultWeightForSource({ id: `dogdrip-${clean}` }),
  }
}

function buildDcinsideSource(galleryId) {
  const clean = String(galleryId || '').trim()
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return null
  return {
    id: `dcinside-${clean}`,
    name: `DCInside ${clean}`,
    type: 'html-list',
    url: `https://gall.dcinside.com/board/lists?id=${clean}`,
    itemSelector: 'a',
    includeLinkPattern: `\\/board\\/view\\/\\?id=${clean}&no=\\d+`,
    maxItems: 28,
    enabled: true,
    tags: ['kr-community', 'autodiscovered', 'dcinside'],
    weight: defaultWeightForSource({ id: `dcinside-${clean}` }),
  }
}

function buildRedditSource(subreddit) {
  const clean = String(subreddit || '').trim()
  if (!/^[A-Za-z0-9_]+$/.test(clean)) return null
  const id = `reddit-${clean.toLowerCase()}`
  return {
    id,
    name: `Reddit r/${clean} (old)`,
    type: 'rss',
    url: `https://old.reddit.com/r/${clean}/.rss`,
    enabled: true,
    maxItems: 24,
    tags: ['global', 'autodiscovered', 'reddit'],
    weight: defaultWeightForSource({ id }),
  }
}

function normalizeAndValidate(source) {
  if (!source || !source.id || !source.url || !source.type) return null
  if (!['rss', 'html-list'].includes(String(source.type).toLowerCase())) return null
  return source
}

async function probeCandidate(source, options) {
  const type = String(source.type || '').toLowerCase()
  const minItems = asNumber(options.minItems, 5)
  const timeoutMs = asNumber(options.timeoutMs, 12000)

  if (type === 'rss') {
    const result = await fetchRss(source.url, { timeoutMs, userAgent: options.userAgent })
    if (!result.ok) return { ok: false, error: result.error || 'rss-fetch-failed', items: 0 }
    const items = Array.isArray(result.items) ? result.items.length : 0
    if (items < 1) return { ok: false, error: 'rss-empty', items }
    return { ok: true, items }
  }

  if (type === 'html-list') {
    const result = await fetchHtmlList(source, { timeoutMs, userAgent: options.userAgent })
    if (!result.ok) return { ok: false, error: result.error || 'html-fetch-failed', items: 0 }
    const items = Array.isArray(result.items) ? result.items.length : 0
    if (items < minItems) return { ok: false, error: `insufficient-items:${items}`, items }
    return { ok: true, items }
  }

  return { ok: false, error: `unsupported-type:${type}`, items: 0 }
}

async function discoverCandidateSources(options = {}) {
  const timeoutMs = asNumber(options.timeoutMs, 12000)
  const userAgent = options.userAgent || 'PainRadarKR/0.1 (+https://github.com/codybot219/korea-pain-radar)'

  const candidates = []
  const errors = []

  const seedFetch = async (platform, urls) => {
    const merged = []
    for (const url of urls) {
      try {
        const html = await fetchText(url, { userAgent, timeoutMs })
        merged.push(html)
      } catch (error) {
        errors.push({ platform, url, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return merged.join('\n')
  }

  const clienHtml = await seedFetch('clien', DISCOVERY_SEEDS.clien)
  const clienSlugs = collectMatches(clienHtml, /\/service\/board\/([a-z0-9_]+)/gi)
  for (const slug of clienSlugs) {
    const source = normalizeAndValidate(buildClienSource(slug))
    if (source) candidates.push(source)
  }

  const pannHtml = await seedFetch('pann', DISCOVERY_SEEDS.pann)
  const pannCategories = collectMatches(pannHtml, /\/talk\/(c\d+)/gi, (m) => String(m[1] || '').toLowerCase())
  for (const cat of pannCategories) {
    const source = normalizeAndValidate(buildPannSource(cat))
    if (source) candidates.push(source)
  }

  const ppomHtml = await seedFetch('ppomppu', DISCOVERY_SEEDS.ppomppu)
  const ppomIds = collectMatches(ppomHtml, /zboard\.php\?id=([a-zA-Z0-9_]+)/gi)
  for (const id of ppomIds) {
    const source = normalizeAndValidate(buildPpomppuSource(id))
    if (source) candidates.push(source)
  }

  const dogdripHtml = await seedFetch('dogdrip', DISCOVERY_SEEDS.dogdrip)
  const dogdripSlugs = collectMatches(dogdripHtml, /href=["']\/([a-z0-9_]+)["']/gi)
  for (const slug of dogdripSlugs) {
    const source = normalizeAndValidate(buildDogdripSource(slug))
    if (source) candidates.push(source)
  }

  const dcHtml = await seedFetch('dcinside', DISCOVERY_SEEDS.dcinside)
  const dcIds = collectMatches(dcHtml, /[?&]id=([a-zA-Z0-9_]+)/gi)
  for (const id of dcIds) {
    const source = normalizeAndValidate(buildDcinsideSource(id))
    if (source) candidates.push(source)
  }

  for (const subreddit of REDDIT_DISCOVERY_LIST) {
    const source = normalizeAndValidate(buildRedditSource(subreddit))
    if (source) candidates.push(source)
  }

  const deduped = []
  const seen = new Set()
  for (const source of candidates) {
    const key = `${source.id}|${source.url}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(source)
  }

  return { candidates: deduped, discoveryErrors: errors }
}

function loadSourcesConfig() {
  const payload = readJson(SOURCES_PATH, { sources: [] })
  const sources = Array.isArray(payload.sources) ? payload.sources : []
  return { payload, sources }
}

async function discoverSources(options = {}) {
  loadEnvFile()

  const write = Boolean(options.write)
  const timeoutMs = asNumber(options.timeoutMs, asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_TIMEOUT_MS, 12000))
  const minItems = asNumber(options.minItems, asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MIN_ITEMS, 5))
  const maxNewSources = asNumber(options.maxNewSources, asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MAX_NEW, 120))
  const maxProbes = asNumber(options.maxProbes, asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MAX_PROBES, 300))
  const userAgent =
    options.userAgent ||
    process.env.PAIN_RADAR_USER_AGENT ||
    'PainRadarKR/0.1 (+https://github.com/codybot219/korea-pain-radar)'

  const { payload, sources } = loadSourcesConfig()
  const existingIds = new Set(sources.map((source) => String(source.id || '').trim().toLowerCase()))
  const existingUrls = new Set(sources.map((source) => String(source.url || '').trim()))

  const { candidates, discoveryErrors } = await discoverCandidateSources({ timeoutMs, userAgent })

  const unknownCandidates = candidates.filter((candidate) => {
    const id = String(candidate.id || '').trim().toLowerCase()
    const url = String(candidate.url || '').trim()
    if (!id || !url) return false
    if (existingIds.has(id)) return false
    if (existingUrls.has(url)) return false
    return true
  })

  const newSources = []
  const probeResults = []

  for (const candidate of unknownCandidates.slice(0, maxProbes)) {
    const probe = await probeCandidate(candidate, { timeoutMs, minItems, userAgent })
    probeResults.push({ id: candidate.id, ok: probe.ok, items: probe.items, error: probe.error || null })
    if (!probe.ok) continue
    newSources.push(candidate)
    if (newSources.length >= maxNewSources) break
  }

  let written = false
  if (write && newSources.length > 0) {
    payload.sources = [...sources, ...newSources]
    fs.writeFileSync(SOURCES_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    written = true
  }

  const summary = {
    ok: true,
    at: new Date().toISOString(),
    write,
    written,
    beforeCount: sources.length,
    afterCount: sources.length + (written ? newSources.length : 0),
    candidateCount: candidates.length,
    unknownCandidateCount: unknownCandidates.length,
    checkedCandidates: probeResults.length,
    addedCount: newSources.length,
    addedSourceIds: newSources.map((source) => source.id),
    failedCandidates: probeResults.filter((result) => !result.ok).slice(0, 60),
    discoveryErrors,
  }

  writeJson(DISCOVERY_REPORT_PATH, summary)
  return summary
}

if (require.main === module) {
  const write = parseBoolean(getFlagValue('--write'), process.argv.includes('--write'))
  const timeoutMs = asNumber(getFlagValue('--timeout-ms'), asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_TIMEOUT_MS, 12000))
  const minItems = asNumber(getFlagValue('--min-items'), asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MIN_ITEMS, 5))
  const maxNewSources = asNumber(getFlagValue('--max-new'), asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MAX_NEW, 120))
  const maxProbes = asNumber(getFlagValue('--max-probes'), asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MAX_PROBES, 300))

  discoverSources({ write, timeoutMs, minItems, maxNewSources, maxProbes })
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2))
    })
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(JSON.stringify({ ok: false, error: reason }))
      process.exit(1)
    })
}

module.exports = {
  discoverSources,
}
