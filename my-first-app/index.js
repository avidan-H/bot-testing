const fs = require('fs');
const jwt = require('jsonwebtoken');
const YAML = require('yaml');
const createScheduler = require('probot-scheduler')
// import openssl from 'openssl';

const organization = 'demisto';
const externalPRLabel = 'Contribution';
// const appID = '38236';
// const pathToPEM = '/Users/ahessing/Downloads/my-first-appp.2019-08-19.private-key.pem';

var rewriteConfig = { 'reviewers': [], 'external_pr_count': 0 }

/**
 * Reads in the reviewers and the external PR count from a config file and selects the next reviewer
 * round-robin style
 * @param {String} pathToConfigFile 
 */
function getReviewers(pathToConfigFile = './.github/config.yml') {
  const configFile = fs.readFileSync(pathToConfigFile, 'utf-8');
  const ymlData = YAML.parse(configFile);
  const reviewers = ymlData.reviewers;
  return reviewers;
  // let prCounter = ymlData.external_pr_count;

  // context.log({ 'ymlData': ymlData })
  // context.log({ 'reviewers': ymlData.reviewers })
  // context.log({ 'prCounter': prCounter })

  // const remainder = prCounter % reviewers.length;
  // const reviewer = reviewers[remainder];
  // return reviewer;
}

/**
 * 
 * @param {Array} reviewers 
 * @param {*} context 
 */
function selectReviewer(reviewers, externalPRs) {
  // context.log({ 'externalPRs': externalPRs });
  let prCounter = 0;
  for(var i = 0; i < externalPRs.length; i++){
    let pr = externalPRs[i];
    for (const labelObject of pr.labels) {
      if (labelObject.name === externalPRLabel) {
        prCounter++;
        break;
      }
    }
  }
  // context.log('externalPRs.length: ' + String(externalPRs.length));
  // context.log('prCounter: ' + String(prCounter));
  const reviewer = reviewers[prCounter % reviewers.length];
  // updateConfig();
  // context.log({ 'reviewer': reviewer });
  return reviewer;
}

/**
 * Return a Date object of the timestamp. If timestamp isn't defined then return oldest date (Jan 1, 1970)
 * @param {String} timestamp 
 */
function toDate(timestamp) {
  if (typeof timestamp !== 'undefined') {
    return Date(timestamp);
  }
  return Date(0);
}

/**
 * Compare dates to determine the last event.
 * @param {String} commitTimestamp 
 * @param {String} commentTimestamp 
 * @param {String} reviewTimestamp 
 */
function getLastEvent(commitTimestamp, commentTimestamp, reviewTimestamp) {
  // convert to date objects
  let commitDate = toDate(commitTimestamp);
  let commentDate = toDate(commentTimestamp);
  let reviewDate = toDate(reviewTimestamp);

  let last = 'commit';
  if (commentDate >= commitDate) {
    last = 'comment';
    if (reviewDate >= commentDate) {
      last = 'review';
    }
  } else {
    if (reviewDate > commitDate) {
      last = 'review';
    }
  }

  return last;
}

/**
 * Update the external PR count in the config file. Should be called after `getReviewer` function
 * @param {String} pathToConfigFile 
 */
function updateConfig(pathToConfigFile = './.github/config.yml') {
  const configFile = fs.readFileSync(pathToConfigFile, 'utf-8');
  const ymlData = YAML.parse(configFile);
  const reviewers = ymlData.reviewers;
  let prCounter = ymlData.external_pr_count;
  rewriteConfig.reviewers = reviewers;
  rewriteConfig.external_pr_count = ++prCounter;
  const newData = YAML.stringify(rewriteConfig);
  // context.log({ 'newData': newData });
  fs.writeFileSync(pathToConfigFile, YAML.stringify(rewriteConfig));
}

/**
 * Get configuration information
 * @param {String} pathToConfigFile 
 */
function getConfigData(pathToConfigFile = './.github/config.yml') {
  const configFile = fs.readFileSync(pathToConfigFile, 'utf-8');
  const ymlData = YAML.parse(configFile);
  const reviewers = ymlData.reviewers;
  const owner = ymlData.owner;
  const repo = ymlData.repo;
  const days = ymlData.days;
  const hours = ymlData.hours;
  const minutes = ymlData.minutes;
  return { owner, repo, reviewers, days, hours, minutes };
}

/**
 * Get configuration information
 * @param {String} pathToConfigFile 
 */

/**
 * 
 * @param {Integer} days 
 * @param {Integer} hours 
 * @param {Integer} minutes 
 */
function timeSpanInMilliseconds(days = 0, hours = 0, minutes = 0) {
  let mxms = minutes * 60 * 1000;
  let hxms = hours * 60 * 60 * 1000;
  let dxms = days * 24 * 60 * 60 * 1000;
  let totalMilliseconds = mxms + hxms + dxms;
  return totalMilliseconds;
}

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // Your code here
  app.log('Is this working?')
  app.log('Probably not')
  app.log('Yay, the app was loaded!')


  createScheduler(app);
  app.on('schedule.repository', async context => {
    // this event is triggered on an interval, which is 1 hr by default
    const { owner, repo, days, hours, minutes } = getConfigData();
    // const timestamp = this.since(days).toISOString().replace(/\.\d{3}\w$/, '')
    let timestamp = new Date(Date.now() - timeSpanInMilliseconds(days, hours, minutes));
    timestamp = timestamp.toISOString().replace(/\.\d{3}\w$/, '');

    // query = `repo:${owner}/${repo} is:open updated:<${timestamp} ${query}`
    const query = `repo:${owner}/${repo} is:open updated:<${timestamp} is:pr`;

    const params = { q: query, sort: 'updated', order: 'desc' }

    // this.logger.info(params, 'searching %s/%s for stale issues', owner, repo)
    context.log(params, 'searching %s/%s for stale issues', owner, repo)
    // return this.github.search.issues(params)
    const staleIssuesPayload = await context.github.search.issues(params);
    context.log({ 'stalePRsPayload': staleIssuesPayload })
    if (staleIssuesPayload.data.total_count > 0) {
      let staleIssues = staleIssuesPayload.data.items;

      for (const issue of staleIssues) {
        // let number = issue.number;
        // context.log('number: ', number)
        context.log({ 'issue': issue })
        const contextIssue = context.issue({ number: issue.number })
        const prPayload = await context.github.pullRequests.get({ ...contextIssue });
        const sha = prPayload.data.head.sha;

        // Get commit timestamp
        const commitPayload = await context.github.repos.getCommit({ ...contextIssue, sha });
        context.log({ 'prPayload': prPayload });
        context.log({ 'commitPayload': commitPayload })
        const commitAuthorLogin = commitPayload.data.author.login;
        const lastCommitDate = commitPayload.data.commit.author.date;
        
        // Get review submission time. If no review submitted - set review submission time to 1970
        const reviewsSubmissionsPayload = await context.github.pullRequests.listReviews({ ...contextIssue });
        context.log({ 'reviewsSubmissionsPayload': reviewsSubmissionsPayload })
        const reviewsSubmissions = reviewsSubmissionsPayload.data;
        let reviewSubmissionDate = new Date(0);
        context.log('reviewSubmissionDate: ', reviewSubmissionDate);
        if (Array.isArray(reviewsSubmissions) && reviewsSubmissions.length >= 1) {
          reviewSubmissionDate = reviewsSubmissions[reviewsSubmissions.length - 1].submitted_at;
          context.log('updated reviewSubmissionDate: ', reviewSubmissionDate)
        }

        // get last comment timestamp
        const commentsPayload = await context.github.issues.listComments({ ...contextIssue });
        context.log({ 'commentsPayload': commentsPayload });
        let comments = commentsPayload.data;
        comments = comments.filter(comment => !(comment.user.login.endsWith('[bot]')));
        context.log({ 'comments': comments });
        let lastCommentTimestamp = new Date(0);
        if (Array.isArray(comments) && comments.length >= 1) {
          lastCommentTimestamp = comments[comments.length - 1].submitted_at;
          context.log('updated lastCommentTimestamp: ', lastCommentTimestamp)
        }

        // const lastCommentDate = BLAH;
        // const lastCommentUser = BLAH;
        break;
      }
    }
  })

  app.on('*', async context => {
    // const config = await context.config('config.yml');
    const { owner, repo, days, hours, minutes } = getConfigData();
    // const timestamp = this.since(days).toISOString().replace(/\.\d{3}\w$/, '')
    let timestamp = new Date(Date.now() - timeSpanInMilliseconds(days, hours, minutes));
    timestamp = timestamp.toISOString().replace(/\.\d{3}\w$/, '');

    // query = `repo:${owner}/${repo} is:open updated:<${timestamp} ${query}`
    const query = `repo:${owner}/${repo} is:open updated:<${timestamp} is:pr`;

    const params = { q: query, sort: 'updated', order: 'desc' }

    // this.logger.info(params, 'searching %s/%s for stale issues', owner, repo)
    context.log(params, 'searching %s/%s for stale issues', owner, repo)
    // return this.github.search.issues(params)
    const staleIssuesPayload = await context.github.search.issues(params);
    context.log({ 'stalePRsPayload': staleIssuesPayload })
    if (staleIssuesPayload.data.total_count > 0) {
      let staleIssues = staleIssuesPayload.data.items;

      for (const issue of staleIssues) {
        // let number = issue.number;
        // context.log('number: ', number)
        context.log({ 'issue': issue })
        const contextIssue = context.issue({ pull_number: issue.number, number: issue.number })
        const prPayload = await context.github.pullRequests.get({ ...contextIssue });
        const sha = prPayload.data.head.sha;

        // get a list of requested reviewers for the PR
        let requestedReviewers = prPayload.data.requested_reviewers.map(requestedReviewer => requestedReviewer.login);

        // Get commit timestamp
        const commitPayload = await context.github.repos.getCommit({ ...contextIssue, commit_sha: sha });
        context.log({ 'prPayload': prPayload });
        context.log({ 'commitPayload': commitPayload })
        const commitAuthorLogin = commitPayload.data.author.login;
        const lastCommitDate = commitPayload.data.commit.author.date;
        
        // Get review submission time. If no review submitted - set review submission time to 1970
        const reviewsSubmissionsPayload = await context.github.pullRequests.listReviews({ ...contextIssue });
        context.log({ 'reviewsSubmissionsPayload': reviewsSubmissionsPayload })
        const reviewsSubmissions = reviewsSubmissionsPayload.data;
        let reviewSubmissionDate = new Date(0);
        context.log('reviewSubmissionDate: ', reviewSubmissionDate);
        let reviewStatus;
        if (Array.isArray(reviewsSubmissions) && reviewsSubmissions.length >= 1) {
          let lastReviewSubmission = reviewsSubmissions[reviewsSubmissions.length - 1];
          reviewSubmissionDate = lastReviewSubmission.submitted_at;
          reviewStatus = lastReviewSubmission.state;
          context.log('updated reviewSubmissionDate: ', reviewSubmissionDate)
        }

        // get last comment timestamp
        const commentsPayload = await context.github.issues.listComments({ ...contextIssue });
        context.log({ 'commentsPayload': commentsPayload });
        let comments = commentsPayload.data;
        comments = comments.filter(comment => !(comment.user.login.endsWith('[bot]')));
        context.log({ 'comments': comments });
        let lastCommentTimestamp = new Date(0);
        let commenter;
        if (Array.isArray(comments) && comments.length >= 1) {
          let lastComment = comments[comments.length - 1];
          lastCommentTimestamp = lastComment.updated_at;
          context.log('updated lastCommentTimestamp: ', lastCommentTimestamp)
          commenter = lastComment.user.login;
        }

        // The lastEvent decides who needs a reminder
        let lastEvent = getLastEvent(lastCommitDate, lastCommentTimestamp, reviewSubmissionDate);
        let reviewersWithPrefix = requestedReviewers.map(reviewer => '@' + reviewer + ' ');
        let msg;
        if (lastEvent === 'commit') {
          // then the assumption is that the requested reviewer(s) need a reminder
          msg = reviewersWithPrefix.join('') + 'A lengthy period of time has transpired - please take a look at this PR.';
        } else if (lastEvent === 'review') {
          // then the assumption is that the person who opened the PR needs a reminder
          msg = '@' + commitAuthorLogin;
          if (reviewStatus !== 'APPROVED') {
            msg += ' A lengthy period of time has transpired since the PR was reviewed. Please address the reviewer\'s comments and push your committed changes.';
          } else {
            msg += ' The PR was approved but doesn\'t seem to have been merged. Please verify that there aren\'t any requested changes still pending preventing your changes being merged.';
          }
        } else { // lastEvent === 'comment'
          // determine who the last commenter was - assume that whichever party was not the commenter needs a reminder
          if (commenter !== commitAuthorLogin) {
            let staleMessage = 'This PR is starting to get a little stale and possibly even a little moldy and smelly.';
            // The last comment wasn't made by the PR opener (and is probably one of the requested reviewers) assume that the PR opener needs a nudge
            msg = '@' + commitAuthorLogin + ' ' + staleMessage + ' Are there any changes you wanted to make since @' + commenter + '\'s last comment?';
          } else {
            // Else assume the person who opened the response is waiting on the response of one of the reviewers
            msg = reviewersWithPrefix.join('') + staleMessage + ' What\'s new since @' + commenter + '\'s last comment?';
          } 
        }
        let nudgeComment = context.issue({ body: msg });
        let nudgePayload = await context.github.issues.createComment(nudgeComment);
        break;
      }
    }
  })


  app.on('issues.opened', async context => {
    // context.log({ event: context.event, action: context.payload })
    // const issueComment = context.issue({ body: 'Thanks for opening this issue!' })
    // return context.github.issues.createComment(issueComment)

    // const installations = context.github.apps.listInstallations;
    // context.log('installations: ', installations);
  })

  app.on('pull_request.opened', async context => {
    // const config = await context.config('config.yml')
    // context.log({ 'config': config.reviewers })

    // const configFile = fs.readFileSync('../.github/config.yml', 'utf-8');
    // const ymlData = YAML.parse(configFile);
    // const reviewers = ymlData.reviewers;
    // let prCounter = ymlData.external_pr_count;

    // context.log({ 'ymlData': ymlData })
    // context.log({ 'reviewers': ymlData.reviewers })
    // context.log({ 'prCounter': prCounter })

    // const remainder = prCounter % reviewers.length;
    // const reviewer = reviewers[remainder];
    // context.log({ 'reviewer': reviewer }) ;
    // rewriteConfig.reviewers = reviewers;
    // rewriteConfig.external_pr_count = ++prCounter;
    // const newData = YAML.stringify(rewriteConfig);
    // context.log({ 'newData': newData });
    // fs.writeFileSync('../.github/config.yml', YAML.stringify(rewriteConfig));

    // context.log({ event: context.event, action: context.payload })
    // const pullComment = context.issue({ body: ('How Wonderful! You\'ve just now created a Pull Request in this repository - !We Love That!\n' + String.raw`¯\_(ツ)_/¯`)})
    // context.log({ 'pullComment': pullComment })
    // const makeComment = await context.github.issues.createComment(pullComment)
    // context.log({ 'makeComment': makeComment })
    // // return context.github.issues.createComment(pullComment)

    const pr = context.payload.pull_request; 
    const isFork = pr.head.repo.fork;
    context.log({ 'isFork': isFork })
    if (isFork) {
      const issue = context.issue({ number: pr.number })
      const addExternalLabel = await context.github.issues.addLabels({ ...issue, labels: [externalPRLabel] })
      context.log({ 'addExternalLabel': addExternalLabel })

      const potentialReviewers = getReviewers();
      const externalPRsPayload = await context.github.pullRequests.list({ ...issue, state: 'open' });
      const externalPRs = externalPRsPayload.data;
      const reviewer = selectReviewer(potentialReviewers, externalPRs);

      const reviewRequest = await context.github.pullRequests.createReviewRequest({ ...issue, reviewers: [reviewer] })
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


        // // if external PR approved, create new branch from content master named the same as the external PR branch
        // const branchName = 'refs/heads/' + pr.head.ref;
        // const commitSHA = pr.base.sha;
        // const newBranch = github.gitdata.createRef({ ...issue, ref: branchName, sha: commitSHA })

        // context.log({ 'newBranch': newBranch })

      
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
        // const changeBaseBranch = await github.pullRequests.update({ ...issue, base: ('new_base_' + pr.head.ref) })

        // context.log({ 'changeBaseBranch': changeBaseBranch })

        const installations = await github.apps.listInstallations()

        context.log({ 'installations': installations })

        // const installationToken = await github.apps.createInstallationToken()

        // merge

        // const merge = await github.pullRequests.merge({ ...issue, merge_method: 'squash' })

        // context.log({ 'merge': merge })

        // open new pr from new branch to master
      }
    }
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
