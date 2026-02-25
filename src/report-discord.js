const path = require('node:path')
const fs = require('node:fs')
const { ROOT, DATA_DIR, readJson, loadEnvFile } = require('./utils')
const { renderDiscordMarkdown } = require('./analyze')

const IDEA_LATEST_PATH = path.join(DATA_DIR, 'ideas', 'latest-idea.json')
const ANALYSIS_LATEST_PATH = path.join(DATA_DIR, 'analysis', 'latest-analysis.json')
const IDEA_MARKDOWN_PATH = path.join(DATA_DIR, 'ideas', 'latest-discord.md')

function splitForDiscord(content, max = 1800) {
  const text = String(content || '').trim()
  if (text.length <= max) return [text]

  const lines = text.split('\n')
  const chunks = []
  let current = ''

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > max) {
      if (current) chunks.push(current)
      current = line
    } else {
      current = next
    }
  }

  if (current) chunks.push(current)
  return chunks
}

async function postWebhook(webhookUrl, content) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`discord-webhook-failed:${res.status} ${body.slice(0, 180)}`)
  }
}

async function runReport({ dryRun = false } = {}) {
  loadEnvFile(path.join(ROOT, '.env'))

  const idea = readJson(IDEA_LATEST_PATH, null)
  const analysis = readJson(ANALYSIS_LATEST_PATH, null)
  if (!idea) throw new Error('latest idea not found. run analyze first')

  let content = ''
  if (fs.existsSync(IDEA_MARKDOWN_PATH)) {
    content = fs.readFileSync(IDEA_MARKDOWN_PATH, 'utf8').trim()
  }
  if (!content) {
    content = renderDiscordMarkdown(idea, {
      windowHours: analysis?.windowHours || 72,
      sampleSize: analysis?.sampleSize || 0,
    })
  }

  const chunks = splitForDiscord(content)
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || ''

  if (dryRun || !webhookUrl) {
    return {
      ok: true,
      sent: false,
      reason: webhookUrl ? 'dry-run' : 'missing-discord-webhook',
      chunks,
    }
  }

  for (const chunk of chunks) {
    await postWebhook(webhookUrl, chunk)
  }

  return {
    ok: true,
    sent: true,
    chunkCount: chunks.length,
    headline: idea.headline,
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  runReport({ dryRun })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.sent && result.chunks?.length) {
        console.log('\n----- preview -----\n')
        console.log(result.chunks.join('\n\n---\n\n'))
      }
    })
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(JSON.stringify({ ok: false, error: reason }))
      process.exit(1)
    })
}

module.exports = {
  runReport,
}
