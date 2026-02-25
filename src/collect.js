const path = require('node:path')
const {
  ROOT,
  DATA_DIR,
  readJson,
  readJsonl,
  appendJsonl,
  writeJson,
  sha1,
  loadEnvFile,
} = require('./utils')
const { fetchRss } = require('./lib/rss')
const { fetchHtmlList } = require('./lib/html-list')

const SOURCES_PATH = path.join(ROOT, 'config', 'sources.json')
const RAW_POSTS_PATH = path.join(DATA_DIR, 'raw-posts.jsonl')
const COLLECT_LATEST_PATH = path.join(DATA_DIR, 'collect-latest.json')

function asNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function loadSources() {
  const payload = readJson(SOURCES_PATH, { sources: [] })
  return Array.isArray(payload.sources)
    ? payload.sources.filter((source) => source && source.enabled !== false)
    : []
}

function buildPost(source, item, fetchedAt) {
  const canonical = `${source.id}|${item.link || item.title}|${item.publishedAt || ''}`
  const id = sha1(canonical)
  const title = String(item.title || '').trim()
  const summary = String(item.summary || '').trim()
  const text = [title, summary].filter(Boolean).join(' | ')

  return {
    id,
    sourceId: source.id,
    sourceName: source.name || source.id,
    sourceUrl: source.url,
    link: item.link || '',
    title,
    summary,
    text,
    tags: Array.isArray(source.tags) ? source.tags : [],
    publishedAt: item.publishedAt || fetchedAt,
    fetchedAt,
  }
}

async function runCollect() {
  loadEnvFile()

  const timeoutMs = asNumber(process.env.PAIN_RADAR_TIMEOUT_MS, 12000)
  const maxItemsPerSource = asNumber(process.env.PAIN_RADAR_MAX_ITEMS_PER_SOURCE, 80)
  const userAgent =
    process.env.PAIN_RADAR_USER_AGENT ||
    'PainRadarKR/0.1 (+https://github.com/codybot219/korea-pain-radar)'

  const sources = loadSources()
  const existing = readJsonl(RAW_POSTS_PATH)
  const seenIds = new Set(existing.map((post) => String(post.id || '')))

  const fetchedAt = new Date().toISOString()
  const stats = []
  let inserted = 0

  for (const source of sources) {
    const type = String(source.type || 'rss').toLowerCase()

    let result = null
    if (type === 'rss') {
      result = await fetchRss(source.url, { timeoutMs, userAgent })
    } else if (type === 'html-list') {
      result = await fetchHtmlList(source, { timeoutMs, userAgent })
    } else {
      stats.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        error: `unsupported-source-type:${source.type}`,
        total: 0,
        inserted: 0,
      })
      continue
    }

    if (!result.ok) {
      stats.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        error: result.error,
        total: 0,
        inserted: 0,
      })
      continue
    }

    let sourceInserted = 0
    const perSourceMax = asNumber(source.maxItems, maxItemsPerSource)
    const sample = result.items.slice(0, perSourceMax)

    for (const item of sample) {
      const post = buildPost(source, item, fetchedAt)
      if (!post.title && !post.link) continue
      if (seenIds.has(post.id)) continue
      seenIds.add(post.id)
      appendJsonl(RAW_POSTS_PATH, post)
      inserted += 1
      sourceInserted += 1
    }

    stats.push({
      sourceId: source.id,
      sourceName: source.name,
      ok: true,
      total: sample.length,
      inserted: sourceInserted,
      error: null,
    })
  }

  const summary = {
    ok: true,
    at: fetchedAt,
    sourceCount: sources.length,
    inserted,
    stats,
  }

  writeJson(COLLECT_LATEST_PATH, summary)
  return summary
}

if (require.main === module) {
  runCollect()
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
  runCollect,
}
