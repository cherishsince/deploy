const {dirname} = require('path')
const getBranch = require('./get-branch')
const aliasStatus = require('./alias-status')
const getBranchAlias = require('./get-alias')
const readJSON = require('./read-json')

const CONFIG_KEY = '@primer/deploy'

module.exports = function deploy(options = {}, nowArgs = []) {
  const {dryRun} = options
  const now = dryRun ? nowDryRun : require('./now')

  const nowJson = readJSON('now.json') || {}
  const packageJson = readJSON('package.json') || {}
  const rulesJson = readJSON('rules.json')

  const config = packageJson[CONFIG_KEY] || {}
  const {releaseBranch = 'master'} = config

  const name = nowJson.name || packageJson.name || dirname(process.cwd())
  const branch = getBranch(name)

  log(`deploying "${name}" with now...`)
  return now(nowArgs)
    .then(url => {
      if (url) {
        log(`root deployment: ${url}`)
        return {
          name,
          root: url,
          url
        }
      } else {
        throw new Error(`Unable to get deployment URL from now: ${url}`)
      }
    })
    .then(res => {
      const {url} = res
      const prodAlias = nowJson.alias
      if (branch === releaseBranch && !rulesJson) {
        res.url = prodAlias
        return now([...nowArgs, 'alias', url, prodAlias])
          .then(() => aliasStatus(prodAlias, config.status))
          .then(() => res)
      }
      const branchAlias = getBranchAlias(name, branch)
      if (branchAlias) {
        res.url = res.alias = branchAlias
        return now([...nowArgs, 'alias', url, branchAlias])
          .then(() => aliasStatus(branchAlias, config.status))
          .then(() => {
            if (branch === releaseBranch && rulesJson) {
              const {alias} = res
              if (!prodAlias) {
                log(`no alias field in now.json; skipping rules.json`)
                return res
              } else if (prodAlias === alias) {
                log(`already aliased to production URL: ${alias}; skipping rules.json`)
                return res
              }
              res.url = prodAlias
              return now([...nowArgs, 'alias', '-r', 'rules.json', prodAlias]).then(() =>
                aliasStatus(prodAlias, config.status)
              )
            }
          })
          .then(() => res)
      } else {
        return res
      }
    })
}

function log(message, ...args) {
  console.warn(`[deploy] ${message}`, ...args)
}

function nowDryRun(args) {
  log(`RUN: npx now`, ...args)
  return Promise.resolve('<deployed-url>')
}
