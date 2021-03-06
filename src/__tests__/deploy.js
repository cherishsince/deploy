const mockedEnv = require('mocked-env')
const readJSON = require('../read-json')
const deploy = require('../deploy')
const now = require('../now')
const aliasStatus = require('../alias-status')

jest.mock('../now')
jest.mock('../read-json')
jest.mock('../alias-status')

now.mockImplementation(() => Promise.resolve('<mocked url>'))
aliasStatus.mockImplementation(() => Promise.resolve({}))

describe('deploy()', () => {
  let restoreEnv = () => {}
  afterEach(() => {
    restoreEnv()
    aliasStatus.mockReset()
    now.mockReset()
    readJSON.mockReset()
  })

  it('calls now() once when GITHUB_REF is unset', () => {
    mockFiles({
      'package.json': {name: 'foo'},
      'now.json': {},
      'rules.json': null
    })

    const root = 'foo-123.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: ''})

    return deploy().then(res => {
      expect(now).toHaveBeenCalledTimes(1)
      expect(now).toHaveBeenCalledWith([])
      expect(res).toEqual({name: 'foo', root, url: root})
    })
  })

  it('deploys to a branch alias on branches other than master', () => {
    mockFiles({
      'package.json': {name: 'foo'},
      'now.json': {},
      'rules.json': null
    })

    const root = 'foo-123.now.sh'
    const alias = 'foo-bar.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: 'refs/heads/bar'})

    return deploy().then(res => {
      expect(now).toHaveBeenCalledTimes(2)
      expect(now).toHaveBeenNthCalledWith(1, [])
      expect(now).toHaveBeenNthCalledWith(2, ['alias', root, alias])
      expect(res).toEqual({name: 'foo', root, alias, url: alias})
    })
  })

  it('deploys to the "alias" field from now.json on the master branch', () => {
    const name = 'hello'
    const alias = 'hello.world'
    mockFiles({
      'package.json': {name},
      'now.json': {alias},
      'rules.json': null
    })

    const root = 'hello-123.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: 'refs/heads/master'})

    return deploy().then(res => {
      expect(now).toHaveBeenCalledTimes(2)
      expect(now).toHaveBeenNthCalledWith(1, [])
      expect(now).toHaveBeenNthCalledWith(2, ['alias', root, alias])
      expect(res).toEqual({name, root, url: alias})
    })
  })

  it('calls now() two times when there is a rules.json, not on master', () => {
    const prodAlias = 'foo.now.sh'
    mockFiles({
      'package.json': {name: 'foo'},
      'now.json': {alias: prodAlias},
      // exists
      'rules.json': {}
    })

    const root = 'foo-123.now.sh'
    const alias = 'foo-bar.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: 'refs/heads/bar'})

    return deploy().then(res => {
      expect(now).toHaveBeenCalledTimes(2)
      expect(now).toHaveBeenNthCalledWith(1, [])
      expect(now).toHaveBeenNthCalledWith(2, ['alias', root, alias])
      expect(res).toEqual({name: 'foo', root, alias, url: alias})
    })
  })

  it('calls now() three times when there is a rules.json, on master', () => {
    const prodAlias = 'primer.style'
    mockFiles({
      'package.json': {name: 'primer-style'},
      'now.json': {alias: prodAlias},
      // exists
      'rules.json': {}
    })

    const root = 'primer-style-123.now.sh'
    const alias = 'primer-style.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: 'refs/heads/master'})

    return deploy().then(res => {
      expect(now).toHaveBeenCalledTimes(3)
      expect(now).toHaveBeenNthCalledWith(1, [])
      expect(now).toHaveBeenNthCalledWith(2, ['alias', root, alias])
      expect(now).toHaveBeenNthCalledWith(3, ['alias', '-r', 'rules.json', prodAlias])
      expect(res).toEqual({name: 'primer-style', root, alias, url: prodAlias})
    })
  })

  it('appends arguments to the now cli call', () => {
    mockFiles({
      'package.json': {name: '@primer/css'},
      'now.json': {alias: 'primer-css.now.sh'},
      'rules.json': null
    })

    const root = 'primer-css-abc123.now.sh'
    const alias = 'primer-css-v12.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: 'refs/heads/v12'})

    return deploy({}, ['docs']).then(res => {
      expect(now).toHaveBeenCalledTimes(2)
      expect(now).toHaveBeenNthCalledWith(1, ['docs'])
      expect(now).toHaveBeenNthCalledWith(2, ['docs', 'alias', root, alias])
      expect(res).toEqual({name: '@primer/css', root, alias, url: alias})
    })
  })

  it('respects the @primer/config "releaseBranch" key in package.json', () => {
    const alias = 'derp.style'
    mockFiles({
      'package.json': {
        name: 'derp',
        '@primer/deploy': {
          releaseBranch: 'release'
        }
      },
      'now.json': {alias},
      'rules.json': null
    })

    const root = 'derp-abc123.now.sh'
    mockResolve(now, root)
    mockEnv({GITHUB_REF: 'refs/heads/release'})

    return deploy().then(res => {
      expect(now).toHaveBeenCalledTimes(2)
      expect(now).toHaveBeenNthCalledWith(1, [])
      expect(now).toHaveBeenNthCalledWith(2, ['alias', root, alias])
      expect(res).toEqual({name: 'derp', root, url: alias})
    })
  })

  it('passes the "status" key to aliasStatus() calls', () => {
    const statusOptions = {context: 'hello'}
    mockFiles({
      'package.json': {
        name: 'hi',
        '@primer/deploy': {
          status: statusOptions
        }
      }
    })

    mockResolve(now, 'derp-123.now.sh')
    mockEnv({GITHUB_REF: 'refs/heads/derp'})

    return deploy().then(() => {
      expect(aliasStatus).toHaveBeenCalledWith('hi-derp.now.sh', statusOptions)
    })
  })

  function mockEnv(env) {
    restoreEnv = mockedEnv(env)
  }

  function mockFiles(files) {
    readJSON.mockImplementation(path => {
      if (path in files) {
        return files[path]
      }
    })
  }

  function mockResolve(fn, value) {
    fn.mockImplementation(() => Promise.resolve(value))
  }
})
