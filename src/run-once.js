const path = require('node:path')

const { runCollect } = require('./collect')
const { runAnalyze } = require('./analyze')
const { runReport } = require('./report-discord')
const { runSourceAutoUpdate } = require('./source-auto-update')
const { DATA_DIR, appendJsonl, readJsonl, ensureDir } = require('./utils')

const REPORT_HISTORY_JSONL_PATH = path.join(DATA_DIR, 'reports', 'history.jsonl')
const REPORT_HISTORY_MD_PATH = path.join(DATA_DIR, 'reports', 'history.md')

function escapeMdCell(value) {
  return String(value == null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br/>')
    .trim()
}

function toKstTimestamp(iso) {
  const d = new Date(iso || Date.now())
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

function summarizeCollectErrors(collectStats = []) {
  const stats = Array.isArray(collectStats) ? collectStats : []
  const errors = stats.filter((entry) => entry && entry.ok === false)
  const blocked = errors.filter((entry) => /403|http-403/i.test(String(entry.error || '')))

  return {
    errorCount: errors.length,
    blockedCount: blocked.length,
    errorSources: errors.slice(0, 8).map((entry) => entry.sourceId || entry.sourceName || 'unknown'),
  }
}

function renderReportHistoryMarkdown(rows, maxRows = 500) {
  const history = Array.isArray(rows) ? rows : []
  const recent = history.slice(-Math.max(1, maxRows))

  const lines = []
  lines.push('# Korea Pain Radar Report Log')
  lines.push('')
  lines.push(`- Last Updated: ${toKstTimestamp(new Date().toISOString())}`)
  lines.push(`- Total Runs: ${history.length}`)
  lines.push('')

  lines.push(`## 실행 이력 (최근 ${recent.length}건)`) 
  lines.push('')
  lines.push('| 시각(KST) | 수집(inserted/source) | 분석(sample/signal) | 카테고리 | 아이디어 | 점수 | 차단/오류 |')
  lines.push('|---|---|---|---|---|---:|---|')

  if (!recent.length) {
    lines.push('| - | - | - | - | - | 0 | - |')
  } else {
    for (const row of recent) {
      const collectPart = `${Number(row.inserted || 0)}/${Number(row.sourceCount || 0)}`
      const analyzePart = `${Number(row.sampleSize || 0)}/${Number(row.signalSize || 0)}`
      const blocked = Number(row.blockedCount || 0)
      const errors = Number(row.errorCount || 0)
      const sources = Array.isArray(row.errorSources) && row.errorSources.length
        ? row.errorSources.slice(0, 3).join(', ')
        : '-'
      const errorPart = `403 ${blocked}건 / 오류 ${errors}건 (${sources})`

      lines.push(
        `| ${escapeMdCell(toKstTimestamp(row.at))} | ${escapeMdCell(collectPart)} | ${escapeMdCell(analyzePart)} | ${escapeMdCell(row.categoryLabel || '-') } | ${escapeMdCell(row.headline || '-')} | ${Number(row.marketScore || 0).toFixed(2)} | ${escapeMdCell(errorPart)} |`,
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}

function persistReportHistory({
  at,
  collect,
  analysis,
  idea,
  sourceUpdate,
  report,
}) {
  const collectErrors = summarizeCollectErrors(collect?.stats)

  const entry = {
    at: at || new Date().toISOString(),
    inserted: Number(collect?.inserted || 0),
    sourceCount: Number(collect?.sourceCount || 0),
    sampleSize: Number(analysis?.sampleSize || 0),
    signalSize: Number(analysis?.signalSize || 0),
    categoryId: idea?.categoryId || '',
    categoryLabel: idea?.categoryLabel || analysis?.categories?.[0]?.categoryLabel || '',
    headline: idea?.headline || '',
    marketScore: Number(idea?.marketScore || 0),
    blockedCount: collectErrors.blockedCount,
    errorCount: collectErrors.errorCount,
    errorSources: collectErrors.errorSources,
    sourceUpdate: {
      skipped: Boolean(sourceUpdate?.skipped),
      reason: sourceUpdate?.reason || null,
      addedCount: Number(sourceUpdate?.addedCount || 0),
      afterCount: Number(sourceUpdate?.afterCount || 0),
    },
    report: {
      sent: Boolean(report?.sent),
      reason: report?.reason || null,
    },
  }

  appendJsonl(REPORT_HISTORY_JSONL_PATH, entry)

  const rows = readJsonl(REPORT_HISTORY_JSONL_PATH)
  const markdown = renderReportHistoryMarkdown(rows)
  ensureDir(path.dirname(REPORT_HISTORY_MD_PATH))
  require('node:fs').writeFileSync(REPORT_HISTORY_MD_PATH, `${markdown}\n`, 'utf8')
}

async function runOnce({
  noReport = false,
  dryRun = false,
  skipSourceUpdate = false,
  forceSourceUpdate = false,
} = {}) {
  const sourceUpdate = skipSourceUpdate
    ? { ok: true, skipped: true, reason: 'source-auto-update-skipped-by-flag' }
    : await runSourceAutoUpdate({ force: forceSourceUpdate })

  const collect = await runCollect()
  const { analysis, idea } = await runAnalyze()
  const report = noReport
    ? { ok: true, sent: false, reason: 'report-skipped-by-flag' }
    : await runReport({ dryRun })

  const summary = {
    ok: true,
    sourceUpdate: {
      skipped: Boolean(sourceUpdate.skipped),
      reason: sourceUpdate.reason || null,
      addedCount: Number(sourceUpdate.addedCount || 0),
      beforeCount: Number(sourceUpdate.beforeCount || collect.sourceCount),
      afterCount: Number(sourceUpdate.afterCount || collect.sourceCount),
      checkedCandidates: Number(sourceUpdate.checkedCandidates || 0),
    },
    collect: {
      inserted: collect.inserted,
      sourceCount: collect.sourceCount,
    },
    analyze: {
      sampleSize: analysis.sampleSize,
      signalSize: analysis.signalSize,
      topCategory: idea.categoryLabel || analysis.categories[0]?.categoryLabel || null,
      marketScore: idea.marketScore,
      headline: idea.headline,
    },
    report,
  }

  try {
    persistReportHistory({
      at: new Date().toISOString(),
      collect,
      analysis,
      idea,
      sourceUpdate,
      report,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    summary.reportHistoryWarning = `history-write-failed:${reason}`
  }

  return summary
}

if (require.main === module) {
  const noReport = process.argv.includes('--no-report')
  const dryRun = process.argv.includes('--dry-run')
  const skipSourceUpdate = process.argv.includes('--skip-source-update')
  const forceSourceUpdate = process.argv.includes('--force-source-update')

  runOnce({ noReport, dryRun, skipSourceUpdate, forceSourceUpdate })
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
  runOnce,
}
