var promise = require('sync-p')
var all = require('sync-p/all')
var fetchJs = require('fetch-js')
var path = require('./lib/path')
var map = require('./lib/map')

module.exports = function (options) {
  options = options || {}
  var modules = {}
  var waiting = {}
  var anons = []

  function req (deps, cb, fail) {
    if (typeof deps === 'string') {
      if (deps in modules) return modules[deps]
      throw new Error('Module not loaded: ' + deps)
    }
    return all(map(deps || [], fetch)).then(evaluate)['catch'](fail)

    function evaluate (deps) {
      if (typeof cb !== 'function') return cb
      var m = { exports: {} }
      var ret = cb.apply(null, map(deps, function (dep) {
        if (dep === 'exports') return m.exports
        if (dep === 'module') return m
        return dep
      }))
      return typeof ret === 'undefined' ? m.exports : ret
    }
  }

  function def (name, deps, cb, fail) {
    if (typeof name !== 'string') return anons.push(arguments)
    if (!cb) {
      cb = deps
      deps = false
    }
    if (!deps) deps = (cb && cb.length > 1) ? ['require', 'exports', 'module'] : []
    waiting[name] = reqLocal(deps, cb).then(register)
    return waiting[name]['catch'](fail)

    function reqLocal (deps, cb) {
      return typeof deps === 'string'
        ? req(path(name, deps, true))
        : req(map(deps, localize), cb)
    }

    function register (m) {
      modules[name] = m
      delete waiting[name]
      return m
    }

    function localize (dep) {
      return dep === 'require' ? reqLocal : path(name, dep, true)
    }
  }

  function fetch (name) {
    if (typeof name !== 'string') return name
    if (name === 'exports' || name === 'module') return name
    if (waiting[name] || name in modules) return waiting[name] || modules[name]
    return promise(function (resolve, reject) {
      setTimeout(function lookup () {
        if (waiting[name] || name in modules) return resolve(waiting[name] || modules[name])
        fetchJs(path(options.base, name), function (err) {
          if (err) return reject(err)
          if (waiting[name] || name in modules) return resolve(waiting[name] || modules[name])
          if (anons.length) {
            var args = anons.pop()
            return resolve(def(name, args[0], args[1]))
          }
          return resolve(def(name))
        })
      }, 0)
    })
  }

  return { require: req, define: def }
}
