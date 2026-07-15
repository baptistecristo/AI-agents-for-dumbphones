'use strict'

const {
  parseCommand, issuesOnly, decideClaim, decideUnclaim, assignLanded
} = require('./claim-logic.js')
const { messages } = require('./claim-messages.js')

module.exports = async function run ({ github, context, core }) {
  const { owner, repo } = context.repo
  const issue = context.payload.issue
  const commenter = context.payload.comment.user.login

  // Read the body as a JS string. Never let it near a shell.
  const command = parseCommand(context.payload.comment.body)
  if (!command) {
    core.info('no command in comment, nothing to do')
    return
  }
  core.info(`${commenter} sent /${command} on #${issue.number}`)

  const say = (body) =>
    github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body })

  // Re-read the issue: the payload is a snapshot and may be stale.
  const { data: fresh } = await github.rest.issues.get({
    owner, repo, issue_number: issue.number
  })
  if (fresh.state !== 'open') {
    core.info('issue is closed, ignoring')
    return
  }

  if (command === 'unclaim') {
    const out = decideUnclaim({ assignees: fresh.assignees, commenter })
    if (out.action === 'refuse') {
      await say(messages.notHolder(commenter, issue.number))
      return
    }
    await github.rest.issues.removeAssignees({
      owner, repo, issue_number: issue.number, assignees: [commenter]
    })
    await say(messages.unclaimed(issue.number))
    return
  }

  const { data: assigned } = await github.rest.issues.listForRepo({
    owner, repo, assignee: commenter, state: 'open', per_page: 100
  })
  const openClaims = issuesOnly(assigned)

  const out = decideClaim({
    assignees: fresh.assignees, commenter, openClaims, issueNumber: issue.number
  })

  if (out.action === 'noop') {
    await say(messages.alreadyYours(commenter))
    return
  }
  if (out.action === 'refuse' && out.reason === 'held') {
    await say(messages.held(commenter, issue.number, out.holder))
    return
  }
  if (out.action === 'refuse' && out.reason === 'cap') {
    await say(messages.capReached(commenter, out.held))
    return
  }

  const { data: after } = await github.rest.issues.addAssignees({
    owner, repo, issue_number: issue.number, assignees: [commenter]
  })

  // A 201 does not mean it landed. Never tell someone they hold an issue
  // they do not.
  if (!assignLanded(after.assignees, commenter)) {
    core.warning(`assign of ${commenter} to #${issue.number} was silently dropped`)
    await say(messages.assignFailed(commenter))
    return
  }
  await say(messages.claimed(commenter))
}
