const path = require('node:path')
const { DATA_DIR, readJson, writeJson, loadEnvFile } = require('./utils')
const { discoverSources } = require('./discover-sources')

const STATE_PATH = path.join(DATA_DIR, 'source-discovery-state.json')

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

async function runSourceAutoUpdate(options = {}) {
  loadEnvFile()

  const force = Boolean(options.force)
  const enabled = parseBoolean(
    process.env.PAIN_RADAR_AUTO_SOURCE_UPDATE,
    true,
  )

  if (!enabled && !force) {
    return {
      ok: true,
      skipped: true,
      reason: 'source-auto-update-disabled',
    }
  }

  const intervalHours = asNumber(process.env.PAIN_RADAR_SOURCE_UPDATE_INTERVAL_HOURS, 24)
  const intervalMs = intervalHours * 3600000

  const state = readJson(STATE_PATH, {}) || {}
  const lastRunAt = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0
  const now = Date.now()

  if (!force && Number.isFinite(lastRunAt) && lastRunAt > 0 && now - lastRunAt < intervalMs) {
    const nextDueAt = new Date(lastRunAt + intervalMs).toISOString()
    return {
      ok: true,
      skipped: true,
      reason: 'source-auto-update-not-due',
      lastRunAt: state.lastRunAt,
      nextDueAt,
    }
  }

  const timeoutMs = asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_TIMEOUT_MS, 12000)
  const minItems = asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MIN_ITEMS, 12)
  const maxNewSources = asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MAX_NEW, 400)
  const maxProbes = asNumber(process.env.PAIN_RADAR_SOURCE_DISCOVERY_MAX_PROBES, 1500)

  const result = await discoverSources({
    write: true,
    timeoutMs,
    minItems,
    maxNewSources,
    maxProbes,
  })

  const nextState = {
    lastRunAt: new Date().toISOString(),
    lastResult: {
      beforeCount: result.beforeCount,
      afterCount: result.afterCount,
      addedCount: result.addedCount,
      checkedCandidates: result.checkedCandidates,
      unknownCandidateCount: result.unknownCandidateCount,
    },
  }

  writeJson(STATE_PATH, nextState)

  return {
    ok: true,
    skipped: false,
    ...result,
  }
}

if (require.main === module) {
  const force = parseBoolean(getFlagValue('--force'), process.argv.includes('--force'))

  runSourceAutoUpdate({ force })
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
  runSourceAutoUpdate,
}
