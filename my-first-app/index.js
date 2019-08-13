
const organization = 'demisto';
const externalPRLabel = 'External-PR'

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // Your code here
  app.log('Is this working?')
  app.log('Probably not')
  app.log('Yay, the app was loaded!')

  app.on('issues.opened', async context => {
    context.log({ event: context.event, action: context.payload })
    const issueComment = context.issue({ body: 'Thanks for opening this issue!' })
    return context.github.issues.createComment(issueComment)
  })

  app.on('pull_request.opened', async context => {
    context.log({ event: context.event, action: context.payload })
    const pullComment = context.issue({ body: 'How Wonderful! You\'ve just now created a Pull Request in this repository - !We Love That!\n¯\\_(ツ)_/¯'})
    context.log({ 'pullComment': pullComment })
    // const files = context.github.pullRequests.listFiles()
    // context.log({ 'pr_files': files })
    return context.github.issues.createComment(pullComment)
    // const prNumber = context.payload.number
    // context.github.pullRequests.listFiles()
  })

  app.on('pull_request', async context => {
    const { github } = context
    if (context.payload.action != 'opened') {
      const pr = context.payload.pull_request; 
      // if(!pr || pr.state !== "open") return;
      const org = pr.base.repo.owner.login;
      const user = pr.user.login;
      const repo = pr.base.repo.name;

      const files = await context.github.pullRequests.listFiles({ number: pr.number, owner: org, repo: repo })
      context.log({ 'files': files })
      // context.log({ event: context.event, action: context.payload })
      // const prNumber = context.payload.pull_request.number
      // const username = context.payload.pull_request.user.login
      // const repoName = context.payload.repository.name
      // const files = context.github.pullRequests.listFiles({ number: prNumber, owner: username, repo: repoName })
      // context.log({ 'pr_files': files })
      // const org = context.payload.
      // const username = context.payload.pull_request.user.login
      // const a = await context.github.orgs.listForUser({ username: user })
      // const a = context.github.orgs.listMemberships()
      // context.log({ 'a': a })
      // // context.log({ 'context': context })
      // // const issueComment = context.github.issues.cr
      const repository = context.payload.repository;
      const isFork = repository.fork;

      const issue = context.issue({ number: pr.number })
      return github.issues.addLabels({ ...issue, labels: [externalPRLabel] })
      // const members = await context.github.orgs.listMembers({ org: organization })
      // context.log({ 'members': members })
      // const isMember = await context.github.orgs.checkMembership({ org: organization, username: user })
      // context.log({ 'isMember': isMember })
      // const membership = await context.github.orgs.
      // context.log({ 'membership': membership })
    }
    // return context.github.issues.createComment(pullComment)
    // const prNumber = context.payload.number
    // context.github.pullRequests.listFiles()
  })

  app.on('pull_request.labeled', async context => {
    const { github } = context
    const pr = context.payload.pull_request;
    if ( pr.labels.includes(externalPRLabel) ) {

    }
  })

  // create new branch from content master, change base branch of external PR
  app.on('pull_request_review.submitted', async context => {
    const { github } = context
    const pr = context.payload.pull_request;
    const review = context.payload.review;
    if ( pr.labels.includes(externalPRLabel) ) {
      // if an external PR, check if submitted review was 'approved'
      if (review.state === 'approved') {


        // if external PR approved, create new branch from content master named the same as the external PR branch

      
        // change base branch of the PR to the newly created branch

      }
    }
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
