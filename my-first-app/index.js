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

  app.on('pull_request', async context => {
    context.log({ event: context.event, action: context.payload })
    const pullComment = context.issue({ body: 'How Wonderful! You\'ve just now created a Pull Request in this repository - !We Love That!\n¯\_(ツ)_/¯'})
    return context.github.pullRequests.createComment(pullComment)
    // const prNumber = context.payload.number
    // context.github.pullRequests.listFiles()
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
