const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function appendJsonl(filePath, payload) {
  ensureDir(path.dirname(filePath))
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8')
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return []
  const rows = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const parsed = []
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row))
    } catch {
      // ignore malformed line
    }
  }
  return parsed
}

function sha1(input) {
  return crypto.createHash('sha1').update(String(input || '')).digest('hex')
}

function loadEnvFile(envPath = path.join(ROOT, '.env')) {
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#')) continue
    const idx = raw.indexOf('=')
    if (idx <= 0) continue
    const key = raw.slice(0, idx).trim()
    const value = raw.slice(idx + 1).trim()
    if (!key || process.env[key] != null) continue
    process.env[key] = value
  }
}

function stripHtml(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeIso(value, fallback = null) {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return fallback
  return d.toISOString()
}

module.exports = {
  ROOT,
  DATA_DIR,
  ensureDir,
  readJson,
  writeJson,
  appendJsonl,
  readJsonl,
  sha1,
  loadEnvFile,
  stripHtml,
  normalizeIso,
}
