
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
    const pullComment = context.issue({ body: ('How Wonderful! You\'ve just now created a Pull Request in this repository - !We Love That!\n' + String.raw`¯\_(ツ)_/¯`)})
    context.log({ 'pullComment': pullComment })
    const makeComment = await context.github.issues.createComment(pullComment)
    context.log({ 'makeComment': makeComment })
    // return context.github.issues.createComment(pullComment)

    const pr = context.payload.pull_request; 
    const isFork = pr.head.repo.fork;
    context.log({ 'isFork': isFork })
    if (isFork) {
      const issue = context.issue({ number: pr.number })
      const addExternalLabel = await context.github.issues.addLabels({ ...issue, labels: [externalPRLabel] })
      context.log({ 'addExternalLabel': addExternalLabel })
      const reviewRequest = await context.github.pullRequests.createReviewRequest({ ...issue, reviewers: ['avidan-H'] })
      context.log({ 'reviewRequest': reviewRequest })
      return reviewRequest
      // const assignIssue = await context.github.issues.addAssignees({ ...issue, assignees: ['avidan-H'] })
      // context.log({ 'assignIssue': assignIssue })
      // return assignIssue
    }

    // Check Tree for committed files and make sure that all necessary files are present
    // implement github Checks?
    // context.github.checks.create
  })

  // // using this one to test out stuff
  // app.on('pull_request', async context => {
  //   const { github } = context
  //   if (context.payload.action != 'opened') {
  //     const pr = context.payload.pull_request; 
  //     const org = pr.base.repo.owner.login;
  //     const user = pr.user.login;
  //     const repo = pr.base.repo.name;

  //     const files = await context.github.pullRequests.listFiles({ number: pr.number, owner: org, repo: repo })
  //     context.log({ 'files': files })
      
  //     const isFork = pr.head.repo.fork;
  //     context.log({ 'isFork': isFork })
  //     if (isFork) {
  //       const issue = context.issue({ number: pr.number })
  //       return github.issues.addLabels({ ...issue, labels: [externalPRLabel] })
  //     }
  //   }
  // })

  // // assign external PR to individual for review
  // app.on('pull_request.labeled', async context => {
  //   const { github } = context
  //   const pr = context.payload.pull_request;
  //   if ( pr.labels.includes(externalPRLabel) ) {
  //     // Placeholder action
  //     const issue = context.issue({ number: pr.number })
  //     return github.issues.addAssignees({ ...issue, assignees: ['avidan-H'] })

  //     // Get Team Users (content team)

  //     // Tally assigned PRs per user

  //     // Assign PR to user with least assigned PRs
  //   }
  // })

  // create new branch from content master, change base branch of external PR
  app.on('pull_request_review.submitted', async context => {
    const { github } = context
    const pr = context.payload.pull_request;
    const review = context.payload.review;
    let isExternal = false;
    for (const labelObject of pr.labels) {
      if (labelObject.name === externalPRLabel) {
        isExternal = true;
        break;
      }
    }
    // if ( pr.labels.includes(externalPRLabel) ) {
    if ( isExternal ) {
      // if an external PR, check if submitted review was 'approved'
      if (review.state === 'approved') {

        const issue = context.issue({ number: pr.number })
        context.log('about to try and create new ref')


        // if external PR approved, create new branch from content master named the same as the external PR branch
        const branchName = 'refs/heads/' + pr.head.ref;
        const commitSHA = pr.base.sha;
        const newBranch = github.gitdata.createRef({ ...issue, ref: branchName, sha: commitSHA })

        context.log({ 'newBranch': newBranch })

      
        // change base branch of the PR to the newly created branch and merge
        // github.pullRequests.update({
        //   owner: string,
        //   repo: string,
        //   number: number,
        //   title?: string,
        //   body?: string,
        //   state?: "open" | "closed",
        //   base?: string,
        //   maintainer_can_modify?: boolean
        // })
        // const changeBaseBranch = github.pullRequests.update({ ...issue, base: })

        // merge

        // open new pr from new branch to master
      }
    }
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
