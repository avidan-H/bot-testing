const fs = require('fs');
const jwt = require('jsonwebtoken');
const YAML = require('yaml');
const createScheduler = require('probot-scheduler')
// import openssl from 'openssl';

const organization = 'demisto';
const externalPRLabel = 'Contribution';
// const appID = '38236';
// const pathToPEM = '/Users/ahessing/Downloads/my-first-appp.2019-08-19.private-key.pem';

/**
 * Reads in potential reviewer list from config file
 * @param {String} pathToConfigFile 
 */
function getReviewers(pathToConfigFile = './.github/config.yml') {
  const configFile = fs.readFileSync(pathToConfigFile, 'utf-8');
  const ymlData = YAML.parse(configFile);
  const reviewers = ymlData.reviewers;
  return reviewers;
}

/**
 * Selects reviewer in a round-robin style
 * @param {Array} reviewers 
 * @param {Array} externalPRs 
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
    return Date.parse(timestamp);
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

  console.log('commitDate: ', commitDate);
  console.log('commentDate: ', commentDate);
  console.log('reviewDate: ', reviewDate);

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
  const botName = ymlData.bot_name;
  return { owner, repo, reviewers, days, hours, minutes, botName };
}

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
  app.log('Yay, the app was loaded!')


  createScheduler(app, { interval: 10 * 60 * 1000 }); // every ten minutes
  app.on('schedule.repository', async context => {
    // const config = await context.config('config.yml');
    const { owner, repo, days, hours, minutes, botName } = getConfigData();
    let timestamp = new Date(Date.now() - timeSpanInMilliseconds(days, hours, minutes));
    timestamp = timestamp.toISOString().replace(/\.\d{3}\w$/, '');

    const query = `repo:${owner}/${repo} is:open updated:<${timestamp} is:pr`;

    const params = { q: query, sort: 'updated', order: 'desc' }

    context.log(params, 'searching %s/%s for stale issues', owner, repo)
    const staleIssuesPayload = await context.github.search.issuesAndPullRequests(params);
    context.log({ 'stalePRsPayload': staleIssuesPayload })
    if (staleIssuesPayload.data.total_count > 0) {
      let staleIssues = staleIssuesPayload.data.items;

      for (const issue of staleIssues) {
        // context.log({ 'issue': issue })
        context.log.info('looking at PR with issue number #', issue.number);
        const contextPR = context.issue({ pull_number: issue.number })
        delete contextPR.number; // deprecated, uses pull_number instead
        const contextIssue = context.issue({ issue_number: issue.number })
        delete contextIssue.number; // deprecated, uses issue_number instead
        const prPayload = await context.github.pullRequests.get({ ...contextPR });
        const sha = prPayload.data.head.sha;

        // get a list of requested reviewers for the PR
        let requestedReviewers = prPayload.data.requested_reviewers.map(requestedReviewer => requestedReviewer.login);

        // Get commit timestamp
        const commitPayload = await context.github.repos.getCommit({ ...contextIssue, ref: sha });
        // context.log({ 'prPayload': prPayload });
        // context.log({ 'commitPayload': commitPayload })
        const commitAuthorLogin = commitPayload.data.author.login;
        const lastCommitDate = commitPayload.data.commit.author.date;
        
        // Get review submission time. If no review submitted - set review submission time to 1970
        const reviewsSubmissionsPayload = await context.github.pullRequests.listReviews({ ...contextPR });
        // context.log({ 'reviewsSubmissionsPayload': reviewsSubmissionsPayload })
        const reviewsSubmissions = reviewsSubmissionsPayload.data;
        let reviewSubmissionDate = new Date(0);
        // context.log('reviewSubmissionDate: ', reviewSubmissionDate);
        let reviewStatus;
        if (Array.isArray(reviewsSubmissions) && reviewsSubmissions.length >= 1) {
          let lastReviewSubmission = reviewsSubmissions[reviewsSubmissions.length - 1];
          reviewSubmissionDate = lastReviewSubmission.submitted_at;
          reviewStatus = lastReviewSubmission.state;
          context.log('updated reviewSubmissionDate: ', reviewSubmissionDate)
        }

        // get last comment timestamp
        const commentsPayload = await context.github.issues.listComments({ ...contextIssue });
        // context.log({ 'commentsPayload': commentsPayload });
        let comments = commentsPayload.data;
        // get all comments excluding our bot's welcome message that starts with "Thank" and our bot's message to include relevant files that starts with "Hey"
        comments = comments.filter( comment => !((comment.body.startsWith('Thank') || comment.body.startsWith('Hey')) && comment.user.login.endsWith('[bot]')));
        // context.log({ 'comments': comments });
        let lastCommentTimestamp = new Date(0);
        let lastComment;
        let commenter;
        if (Array.isArray(comments) && comments.length >= 1) {
          lastComment = comments[comments.length - 1];
          lastCommentTimestamp = lastComment.updated_at;
          context.log('updated lastCommentTimestamp: ', lastCommentTimestamp)
          commenter = lastComment.user.login;
          context.log.info('commenter: ', commenter);
        }


        // The lastEvent decides who needs a reminder
        let msg;
        let reviewersWithPrefix = requestedReviewers.map(reviewer => '@' + reviewer + ' ');
        context.log.info('lastCommitDate: ', lastCommitDate, '\nlastCommentTimestamp: ', lastCommentTimestamp, '\nreviewSubmissionDate: ', reviewSubmissionDate);
        let lastEvent = getLastEvent(lastCommitDate, lastCommentTimestamp, reviewSubmissionDate);
        context.log.info('lastEvent: ', lastEvent);
        if (lastEvent === 'commit') {
          // then the assumption is that the requested reviewer(s) need a reminder
          msg = reviewersWithPrefix.join('') + 'A lengthy period of time has transpired - please take a look at this PR.';
        } else if (lastEvent === 'review') {
          // then the assumption is that the person who opened the PR needs a reminder
          msg = '@' + commitAuthorLogin;
          context.log.info('reviewStatus: ', reviewStatus);
          if (reviewStatus !== 'APPROVED') {
            if (reviewStatus === 'PENDING') {
              msg = reviewersWithPrefix.join('') + 'It would be awfully nice if you would review @' + commitAuthorLogin + '\'s magnanimous contribution.';
            } else {
              msg += ' A lengthy period of time has transpired since the PR was reviewed. Please address the reviewer\'s comments and push your committed changes.';
            }
          } else {
            msg += ' The PR was approved but doesn\'t seem to have been merged. Please verify that there aren\'t any outstanding requested changes.';
          }
        } else { // lastEvent === 'comment'
          // Actions if the last comment was made by the bot itself
          const botLogin = botName + '[bot]';
          context.log.info('botLogin: ', botLogin, '\ncommenter: ', commenter);
          if (commenter === botLogin) {
            // PR already has nudging comment from our bot
            msg = reviewersWithPrefix.join('') + 'These reminders don\'t seem to be working and the issue is getting pretty stale - consider whether this PR is still relevant or should be closed.';
            if (lastComment.body === msg) {
              // PR already has comment from our bot to consider closing the issue
              context.log.info('Skip: PR already has comment from our bot to consider closing the issue');
              continue;
            }
            // otherwise send message to consider closing the issue
            let nudgeComment = context.issue({ issue_number: issue.number, body: msg });
            delete nudgeComment.number;
            let nudgePayload = await context.github.issues.createComment(nudgeComment);
            continue;
          }
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
        context.log.info('about to send "', msg, '" to issue #', issue.number);
        let nudgeComment = context.issue({ issue_number: issue.number, body: msg });
        delete nudgeComment.number;
        let nudgePayload = await context.github.issues.createComment(nudgeComment);
        // break;
      }
    }
  })

  // app.on('*', async context => {
  // })

  app.on('issues.opened', async context => {
    // context.log({ event: context.event, action: context.payload })
    // const issueComment = context.issue({ body: 'Thanks for opening this issue!' })
    // return context.github.issues.createComment(issueComment)

    // const installations = context.github.apps.listInstallations;
    // context.log('installations: ', installations);
  })

  app.on('pull_request.opened', async context => {
    const pr = context.payload.pull_request; 
    const isFork = pr.head.repo.fork;
    context.log({ 'isFork': isFork })
    if (isFork) {
      let issue = context.issue({ issue_number: pr.number, pull_number: pr.number });

      // Get Potential Reviewers
      const potentialReviewers = getReviewers();
      const externalPRsPayload = await context.github.pullRequests.list({ ...issue });
      const externalPRs = externalPRsPayload.data;
      const reviewer = selectReviewer(potentialReviewers, externalPRs);
      context.log('reviewer: ', reviewer);

      // Add welcome comment to external PR
      const welcomeMessage = 'Thank you for your contribution. Your generosity and caring are unrivaled! Rest assured - our content wizard @' + reviewer + ' will very shortly look over your proposed changes.';
      issue.body = welcomeMessage;
      delete issue.number;
      const makeComment = await context.github.issues.createComment(issue);

      // Add Label
      // const issue = context.issue({ pull_number: pr.number })
      const addExternalLabel = await context.github.issues.addLabels({ ...issue, labels: [externalPRLabel] })
      context.log({ 'addExternalLabel': addExternalLabel })

      // Check pull request and make sure that all necessary files are present
      const prFilesPayload = await context.github.pulls.listFiles({ ...issue });
      context.log({ 'prFilesPayload': prFilesPayload});
      const prFiles = prFilesPayload.data;
      const files = prFiles.map(fileObject => fileObject.filename);
      const fileNames = files.join('\n');
      console.log('fileNames: ', fileNames);

      const pullRequester = pr.head.user.login;
      console.log('pullRequester: ', pullRequester);
      var pyCodeReg = /content\/Integrations\/(.*)\/\1\.py/;
      const moddedCode = pyCodeReg.exec(fileNames);
      console.log('moddedCode: ', moddedCode);
      var ymlReg = /content\/Integrations\/(.*)\/\1\.yml/;
      const moddedYml = ymlReg.exec(ymlReg);
      let requires = new Array();
      let dirName;
      let changed;
      let pathPrefix = 'content\/Integrations\/';
      if (moddedCode) {
        changed = 'python';
        dirName = moddedCode[1];
        console.log('dirName: ', dirName);
        var pyCodeTest = new RegExp(pathPrefix + dirName + '\/' + dirName + '_test\.py');
        if (!(pyCodeTest.test(fileNames))) {
          requires.push('unit test');
        }
        var isChangelog = new RegExp(pathPrefix + dirName + '\/' + 'CHANGELOG.md');
        if (!(isChangelog.test(fileNames))) {
          requires.push('changelog')
        }
      } else if (moddedYml) {
        changed = 'yml';
        dirName = moddedYml[1];
        var isChangelog = new RegExp(pathPrefix + dirName + '\/' + 'CHANGELOG.md');
        if (!(isChangelog.test(fileNames))) {
          requires.push('changelog')
        }
      }
      if (typeof changed !== 'undefined' && requires.length !== 0) { // create the relevant comment
        console.log('changed: ', changed);
        console.log('requires: ', requires);
        let theIssue = context.issue({ issue_number: pr.number, pull_number: pr.number });
        let unittestMessage = ' It is very likely that the reviewer will want you to add a unittest for your code changes in the `' + dirName + '/' + dirName + '_test.py` file - please refer to the documentation https://github.com/demisto/content/tree/master/docs/tests/unit-testing for more details.'
        let changelogMessage = ' Because of your changes you will also need to update the `' + dirName + '/' + 'CHANGELOG.md` file - please refer to the documentation https://github.com/demisto/content/tree/master/docs/release_notes for more details.'
        let warning = 'Hey @' + pullRequester + ', it appears you made changes to the ' + changed + ' file in the ' + dirName + ' integration directory.';
        if (requires.includes('unit test')) {
          warning += unittestMessage;
        }
        if (requires.includes('changelog')) {
          warning += changelogMessage;
        }
        theIssue.body = warning;
        delete theIssue.number;
        const warningComment = await context.github.issues.createComment(theIssue);
        context.log({ 'warningComment': warningComment });
      }

      // Assign Reviewer
      const reviewRequest = await context.github.pullRequests.createReviewRequest({ ...issue, reviewers: [reviewer] })
      context.log({ 'reviewRequest': reviewRequest })
      // return reviewRequest
    }
  })

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
