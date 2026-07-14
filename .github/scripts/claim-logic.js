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

// GET /issues?assignee= returns pull requests mixed in with issues.
// https://docs.github.com/en/rest/issues/issues
function issuesOnly (items) {
  return (items || []).filter((i) => !i.pull_request)
}

function decideClaim ({ assignees, commenter, openClaims, issueNumber }) {
  const current = assignees || []
  if (current.some((a) => a.login === commenter)) {
    return { action: 'noop', reason: 'already-yours' }
  }
  if (current.length > 0) {
    return { action: 'refuse', reason: 'held', holder: current[0].login }
  }
  const others = issuesOnly(openClaims).filter((i) => i.number !== issueNumber)
  if (others.length >= MAX_OPEN_CLAIMS) {
    return { action: 'refuse', reason: 'cap', held: others.map((i) => i.number) }
  }
  return { action: 'assign' }
}

function decideUnclaim ({ assignees, commenter }) {
  if ((assignees || []).some((a) => a.login === commenter)) {
    return { action: 'unassign' }
  }
  return { action: 'refuse', reason: 'not-holder' }
}

// A 201 does not mean the assignment happened: "Assignees are silently
// ignored otherwise." Read the response back and check.
function assignLanded (responseAssignees, login) {
  return Array.isArray(responseAssignees) &&
    responseAssignees.some((a) => a.login === login)
}

const MS_PER_DAY = 86400000

function quietDays (lastActivityIso, nowIso) {
  const from = Date.parse(lastActivityIso)
  const to = Date.parse(nowIso)
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new TypeError(`unparseable timestamp: ${lastActivityIso} .. ${nowIso}`)
  }
  return Math.floor((to - from) / MS_PER_DAY)
}

// Without the push-access skip the bot unassigns Baptiste from his own
// issues on day 8. claim-exempt is the hatch for long-running work (#8).
function sweepSkipReason ({ hasPushAccess, labels }) {
  if (hasPushAccess) return 'collaborator'
  if ((labels || []).some((l) => l.name === 'claim-exempt')) return 'claim-exempt'
  return null
}

function decideSweep ({ assignedAt, assigneeComments, hasOpenLinkedPr, nudgedAt, now }) {
  if (hasOpenLinkedPr) return { action: 'none', reason: 'open-pr', days: 0 }

  const lastActivity = (assigneeComments || []).reduce(
    (latest, c) => (Date.parse(c) > Date.parse(latest) ? c : latest),
    assignedAt
  )
  const days = quietDays(lastActivity, now)

  if (days >= RELEASE_AFTER_DAYS) return { action: 'release', days, lastActivity }

  if (days >= NUDGE_AFTER_DAYS) {
    // A nudge older than the last activity is stale: the assignee has spoken
    // since, so they have earned a fresh nudge before any release.
    if (nudgedAt && Date.parse(nudgedAt) >= Date.parse(lastActivity)) {
      return { action: 'none', reason: 'already-nudged', days }
    }
    return { action: 'nudge', days, lastActivity }
  }

  return { action: 'none', reason: 'fresh', days, lastActivity }
}

module.exports = {
  MAX_OPEN_CLAIMS,
  NUDGE_AFTER_DAYS,
  RELEASE_AFTER_DAYS,
  NUDGE_MARKER,
  parseCommand,
  issuesOnly,
  decideClaim,
  decideUnclaim,
  assignLanded,
  quietDays,
  sweepSkipReason,
  decideSweep
}
