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

module.exports = {
  MAX_OPEN_CLAIMS,
  NUDGE_AFTER_DAYS,
  RELEASE_AFTER_DAYS,
  NUDGE_MARKER,
  parseCommand,
  issuesOnly,
  decideClaim,
  decideUnclaim,
  assignLanded
}
