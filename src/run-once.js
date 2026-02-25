const { runCollect } = require('./collect')
const { runAnalyze } = require('./analyze')
const { runReport } = require('./report-discord')

async function runOnce({ noReport = false, dryRun = false } = {}) {
  const collect = await runCollect()
  const { analysis, idea } = await runAnalyze()
  const report = noReport
    ? { ok: true, sent: false, reason: 'report-skipped-by-flag' }
    : await runReport({ dryRun })

  return {
    ok: true,
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
}

if (require.main === module) {
  const noReport = process.argv.includes('--no-report')
  const dryRun = process.argv.includes('--dry-run')

  runOnce({ noReport, dryRun })
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
