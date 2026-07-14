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
