const { XMLParser } = require('fast-xml-parser')
const { stripHtml, normalizeIso } = require('../utils')

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: true,
  removeNSPrefix: true,
})

function normalizeCharset(input) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return 'utf-8'
  if (raw === 'ks_c_5601-1987') return 'euc-kr'
  if (raw === 'ks_c_5601-1989') return 'euc-kr'
  if (raw === 'x-windows-949' || raw === 'cp949' || raw === 'ms949') return 'euc-kr'
  return raw
}

function detectCharset(buffer, contentType = '') {
  const headerMatch = String(contentType || '').match(/charset=([^;]+)/i)
  if (headerMatch?.[1]) return normalizeCharset(headerMatch[1])

  const head = buffer.slice(0, 240).toString('ascii')
  const xmlMatch = head.match(/encoding=["']([^"']+)["']/i)
  if (xmlMatch?.[1]) return normalizeCharset(xmlMatch[1])

  return 'utf-8'
}

function decodeXml(buffer, charset) {
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    try {
      return new TextDecoder('utf-8').decode(buffer)
    } catch {
      return Buffer.from(buffer).toString('utf8')
    }
  }
}

function toArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function firstText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    if (typeof value['#text'] === 'string') return value['#text']
    if (typeof value.text === 'string') return value.text
    if (typeof value.__cdata === 'string') return value.__cdata
  }
  return ''
}

function normalizeLink(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    if (typeof value.href === 'string') return value.href.trim()
    if (typeof value['@_href'] === 'string') return value['@_href'].trim()
  }
  return ''
}

function normalizeRssItem(item) {
  const title = firstText(item.title)
  const link = normalizeLink(item.link)
  const summary = firstText(item.description || item.summary || item.content || item['content:encoded'])
  const publishedAt =
    normalizeIso(item.pubDate) ||
    normalizeIso(item.published) ||
    normalizeIso(item.updated) ||
    normalizeIso(item.dcDate) ||
    null

  return {
    title: stripHtml(title),
    link,
    summary: stripHtml(summary),
    publishedAt,
  }
}

function normalizeAtomEntry(entry) {
  const title = firstText(entry.title)
  const links = toArray(entry.link)
  const primaryLink = links
    .map((link) => normalizeLink(link))
    .find(Boolean)

  const summary = firstText(entry.summary || entry.content)
  const publishedAt =
    normalizeIso(entry.updated) ||
    normalizeIso(entry.published) ||
    normalizeIso(entry.created) ||
    null

  return {
    title: stripHtml(title),
    link: primaryLink || '',
    summary: stripHtml(summary),
    publishedAt,
  }
}

function parseFeed(xml) {
  const doc = parser.parse(xml)
  const rssItems = toArray(doc?.rss?.channel?.item).map(normalizeRssItem)
  const atomItems = toArray(doc?.feed?.entry).map(normalizeAtomEntry)
  const items = [...rssItems, ...atomItems].filter((item) => item.title || item.link)
  return items
}

async function fetchRss(url, { userAgent, timeoutMs = 12000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': userAgent || 'PainRadarKR/0.1',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`http-${res.status}`)
    }

    const body = Buffer.from(await res.arrayBuffer())
    const charset = detectCharset(body, res.headers.get('content-type') || '')
    const xml = decodeXml(body, charset)
    const items = parseFeed(xml)
    return { ok: true, url, items }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, url, items: [], error: reason }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  fetchRss,
}
