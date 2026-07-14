'use strict'

const MAX_OPEN_CLAIMS = 2
const NUDGE_AFTER_DAYS = 5
const RELEASE_AFTER_DAYS = 7
const NUDGE_MARKER = '<!-- claim-bot:nudge -->'

// The command must be alone on its own line. Without this, "I'll /claim this
// next week" would assign the issue.
function parseCommand (body) {
  if (typeof body !== 'string') return null
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase()
    if (line === '/claim') return 'claim'
    if (line === '/unclaim') return 'unclaim'
  }
  return null
}

module.exports = {
  MAX_OPEN_CLAIMS,
  NUDGE_AFTER_DAYS,
  RELEASE_AFTER_DAYS,
  NUDGE_MARKER,
  parseCommand
}
