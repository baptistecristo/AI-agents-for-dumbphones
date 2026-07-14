'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { parseCommand } = require('./claim-logic.js')

test('parseCommand: a bare /claim is a claim', () => {
  assert.equal(parseCommand('/claim'), 'claim')
})

test('parseCommand: a bare /unclaim is an unclaim', () => {
  assert.equal(parseCommand('/unclaim'), 'unclaim')
})

test('parseCommand: surrounding whitespace and case do not matter', () => {
  assert.equal(parseCommand('  /Claim  '), 'claim')
  assert.equal(parseCommand('\n\n/UNCLAIM\n'), 'unclaim')
})

test('parseCommand: the command may sit on its own line among prose', () => {
  assert.equal(parseCommand('I have time this weekend.\n\n/claim\n\nThanks!'), 'claim')
})

test('parseCommand: prose mentioning the command inline does not fire', () => {
  assert.equal(parseCommand("I'll /claim this next week"), null)
  assert.equal(parseCommand('use /claim to take an issue'), null)
})

test('parseCommand: trailing prose on an otherwise-bare line does not fire', () => {
  assert.equal(parseCommand('/claim this issue please'), null)
  assert.equal(parseCommand('/claim #4'), null)
  assert.equal(parseCommand('/unclaim it'), null)
})

test('parseCommand: a quoted or code-fenced command does not fire', () => {
  assert.equal(parseCommand('> /claim'), null)
  assert.equal(parseCommand('`/claim`'), null)
})

test('parseCommand: unrelated bodies are null', () => {
  assert.equal(parseCommand('looks good to me'), null)
  assert.equal(parseCommand(''), null)
})

test('parseCommand: non-string input is null, never a throw', () => {
  assert.equal(parseCommand(undefined), null)
  assert.equal(parseCommand(null), null)
  assert.equal(parseCommand(42), null)
})

test('parseCommand: the first command wins when both appear', () => {
  assert.equal(parseCommand('/unclaim\n/claim'), 'unclaim')
})

const {
  issuesOnly,
  decideClaim,
  decideUnclaim,
  assignLanded
} = require('./claim-logic.js')

test('issuesOnly: drops pull requests from an issues listing', () => {
  const items = [
    { number: 1 },
    { number: 2, pull_request: { url: 'https://api.github.com/...' } },
    { number: 3 }
  ]
  assert.deepEqual(issuesOnly(items).map((i) => i.number), [1, 3])
})

test('decideClaim: an unassigned issue under the cap is assigned', () => {
  const out = decideClaim({ assignees: [], commenter: 'faizmullaa', openClaims: [], issueNumber: 4 })
  assert.deepEqual(out, { action: 'assign' })
})

test('decideClaim: claiming what you already hold is a no-op', () => {
  const out = decideClaim({
    assignees: [{ login: 'faizmullaa' }],
    commenter: 'faizmullaa',
    openClaims: [{ number: 4 }],
    issueNumber: 4
  })
  assert.equal(out.action, 'noop')
  assert.equal(out.reason, 'already-yours')
})

test('decideClaim: an issue held by someone else is refused, naming the holder', () => {
  const out = decideClaim({
    assignees: [{ login: 'tarun2684' }],
    commenter: 'faizmullaa',
    openClaims: [],
    issueNumber: 8
  })
  assert.equal(out.action, 'refuse')
  assert.equal(out.reason, 'held')
  assert.equal(out.holder, 'tarun2684')
})

test('decideClaim: at the cap, refused and the held issues are reported', () => {
  const out = decideClaim({
    assignees: [],
    commenter: 'faizmullaa',
    openClaims: [{ number: 2 }, { number: 3 }],
    issueNumber: 4
  })
  assert.equal(out.action, 'refuse')
  assert.equal(out.reason, 'cap')
  assert.deepEqual(out.held, [2, 3])
})

test('decideClaim: one below the cap still assigns', () => {
  const out = decideClaim({
    assignees: [],
    commenter: 'faizmullaa',
    openClaims: [{ number: 2 }],
    issueNumber: 4
  })
  assert.deepEqual(out, { action: 'assign' })
})

test('decideClaim: the issue being claimed never counts toward its own cap', () => {
  const out = decideClaim({
    assignees: [],
    commenter: 'faizmullaa',
    openClaims: [{ number: 2 }, { number: 4 }],
    issueNumber: 4
  })
  assert.deepEqual(out, { action: 'assign' })
})

test('decideUnclaim: the holder can release', () => {
  const out = decideUnclaim({ assignees: [{ login: 'faizmullaa' }], commenter: 'faizmullaa' })
  assert.deepEqual(out, { action: 'unassign' })
})

test('decideUnclaim: a non-holder cannot release', () => {
  const out = decideUnclaim({ assignees: [{ login: 'tarun2684' }], commenter: 'faizmullaa' })
  assert.equal(out.action, 'refuse')
  assert.equal(out.reason, 'not-holder')
})

test('decideUnclaim: releasing an unassigned issue is refused', () => {
  const out = decideUnclaim({ assignees: [], commenter: 'faizmullaa' })
  assert.equal(out.action, 'refuse')
})

// GitHub returns 201 and silently drops an ineligible assignee.
// See https://docs.github.com/en/rest/issues/assignees
test('assignLanded: true only when the login is actually in the response', () => {
  assert.equal(assignLanded([{ login: 'faizmullaa' }], 'faizmullaa'), true)
  assert.equal(assignLanded([{ login: 'someone-else' }], 'faizmullaa'), false)
  assert.equal(assignLanded([], 'faizmullaa'), false)
  assert.equal(assignLanded(undefined, 'faizmullaa'), false)
})
