const cheerio = require('cheerio')
const { stripHtml, normalizeIso } = require('../utils')

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

  const head = buffer.slice(0, 320).toString('ascii')
  const htmlMeta = head.match(/charset\s*=\s*([a-zA-Z0-9\-_]+)/i)
  if (htmlMeta?.[1]) return normalizeCharset(htmlMeta[1])

  return 'utf-8'
}

function decodeBody(buffer, charset) {
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

function normalizeText(value) {
  return stripHtml(String(value || '')).replace(/\s+/g, ' ').trim()
}

function isLowValueTitle(title) {
  const text = String(title || '').trim()
  if (!text) return true
  if (/^\d+$/.test(text)) return true
  if (/^(댓글|추천|조회|좋아요|reply|comments?)$/i.test(text)) return true
  if (!/[가-힣a-zA-Z]/.test(text) && text.length < 6) return true
  return false
}

function firstAttr(el, attr) {
  if (!el || !attr) return ''
  const value = el.attr(attr)
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeUrl(href, baseUrl) {
  const raw = String(href || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  try {
    return new URL(raw, baseUrl).toString()
  } catch {
    return raw
  }
}

function compilePattern(pattern) {
  if (!pattern) return null
  if (pattern instanceof RegExp) return pattern
  if (typeof pattern === 'string') return new RegExp(pattern)
  return null
}

function pickTitleNode($item, source) {
  if (source.titleSelector) {
    const node = $item.find(source.titleSelector).first()
    if (node.length) return node
  }
  const firstLink = $item.find('a').first()
  if (firstLink.length) return firstLink
  return $item
}

function extractBySelector(html, source) {
  const $ = cheerio.load(html)
  const items = []
  const itemSelector = source.itemSelector || 'a'
  const includeLinkPattern = compilePattern(source.includeLinkPattern)
  const excludeLinkPattern = compilePattern(source.excludeLinkPattern)
  const excludeTitlePattern = compilePattern(source.excludeTitlePattern)

  $(itemSelector).each((_, el) => {
    const $item = $(el)
    const titleNode = pickTitleNode($item, source)

    const title = normalizeText(titleNode.text() || $item.text())

    const linkRaw =
      source.linkSelector
        ? firstAttr($item.find(source.linkSelector).first(), 'href')
        : firstAttr(titleNode, 'href') || firstAttr($item, 'href')

    const link = normalizeUrl(linkRaw, source.url)

    if (!title && !link) return
    if (isLowValueTitle(title)) return
    if (includeLinkPattern && !includeLinkPattern.test(link)) return
    if (excludeLinkPattern && excludeLinkPattern.test(link)) return
    if (excludeTitlePattern && excludeTitlePattern.test(title)) return

    const summary = source.summarySelector
      ? normalizeText($item.find(source.summarySelector).first().text())
      : ''

    const dateRaw = source.dateSelector
      ? normalizeText($item.find(source.dateSelector).first().text())
      : ''

    const publishedAt = normalizeIso(dateRaw)

    items.push({
      title,
      link,
      summary,
      publishedAt,
    })
  })

  const unique = []
  const seen = new Set()
  for (const item of items) {
    const key = `${item.link}|${item.title}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }

  return unique
}

async function fetchHtmlList(source, { userAgent, timeoutMs = 12000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(source.url, {
      method: 'GET',
      headers: {
        'user-agent': userAgent || 'PainRadarKR/0.1',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`http-${res.status}`)
    }

    const body = Buffer.from(await res.arrayBuffer())
    const charset = detectCharset(body, res.headers.get('content-type') || '')
    const html = decodeBody(body, charset)
    const items = extractBySelector(html, source)

    return {
      ok: true,
      url: source.url,
      items,
      charset,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      url: source.url,
      items: [],
      error: reason,
    }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  fetchHtmlList,
}
