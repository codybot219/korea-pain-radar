const { runCollect } = require('./collect')
const { runAnalyze } = require('./analyze')
const { runReport } = require('./report-discord')
const { runSourceAutoUpdate } = require('./source-auto-update')

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

  return {
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
