;(function () {

 'use strict'

 const noop = ()=>{}

  /**
   * Print a set of values to the native iOS console.
   * @param {Array} vals
   */
  function log(vals) {
    vals = vals.map(val => {
      if (typeof val === 'undefined') return 'undefined'
      if (val instanceof Error) return 'Error: ' + val.message + '\n' + JSON.stringify(val, null, 2)
      if (typeof val === 'object') return JSON.stringify(val, null, 2)
      return val.toString()
    })
    window.webkit.messageHandlers.PRINT.postMessage('\n:::\n' + vals.join('\n\n') + '\n:::\n')
  }

  function defineAPI() {

    /**
     * Redefine console.log to capture messages and print to the native console.
     * @note We lose pretty stack traces and so forth, in the native console.
     */ 
    void function logShims() {
      const __consoleLog = console.log
      window.console = {}
      console.log = function (...vals) {
        log(vals)
        __consoleLog(...vals)
      }
      window.onerror = function (messageOrEvent, source, lineno, colno, error) {
        console.log(`Error in ${source || '??'} at line ${lineno}.`, messageOrEvent, error)
      }
    }()
  
    // Throws if passed a non-string or an empty string.
    function mustBeNonEmptyString(val) {
      if (typeof val !== 'string') {
        throw new Error('The basename parameter was a non-string.')
      }
      if (!val.length) {
        throw new Error('The basename parameter was an empty string.')
      }
    }
  
    // Throws if the string is not a valid basename.
    function isBasename(val) {
      mustBeNonEmptyString(val)
      if (val.includes('/')) {
        throw new Error('The basename parameter cannot contain slashes ("/").')
      }
    }
  
    // Throw if the given args length doesn't equal num.
    function argsCount(name, num, args) {
      if (args.length !== num) {
        throw new Error(
          `function ${name} takes ${num} parameters, but was called with ${args.length}.`
        )
      }
    }
  
    // Throw if the given val is not plausibly a URL.
    function isURL(val) {
      if (val.slice(0,7) === 'file://') throw new Error(
        'url parameter should not point to the file system; use: '+
        'JSAppViewFileSystem.readFile(basename).'
      )
      const couldBeRemoteURL = (
        (typeof val === 'string') &&
        ~val.indexOf('://') && // Must have a scheme.
        ~val.indexOf('.')    // Must have domain/IP dot(s).
      )
      if (!couldBeRemoteURL) throw new Error(
        `The url parameter must be an absolute URL including a scheme: "${val}" passed.`
      )
    }
  
    /**
     * Pass the given args to the WKWebView message of the given name,
     * and fire the correct callback back when finished, to resolve
     * or reject the returned Promise.
     * @param {String} name - A non-empty string.
     * @param {Object<Arguments>} args
     * @return {Promise<*>} - Whatever the native function evals
     */
    function systemCall(name, args) {
      const uid = Math.random().toString()
      const promise = new Promise((resolve, reject) => {
        
        // Enable the Promise API
        window.JSAppView.__callbacks[uid] = function (result) {
          delete window.JSAppView.__callbacks[uid]
          delete window.JSAppView.__progress[uid]
          if (result instanceof Error) {
            reject(result)
          } else {
            if (typeof result === 'string') {
              result = result.split('\\`').join('`').split('\\${').join('${')
            }
            resolve(result)
          }
        }
        
        // Issue system call
        window.webkit.messageHandlers[name].postMessage([uid, ...args])
      })
      
      // Enable .progress() API
      window.JSAppView.__progress[uid] = noop
      promise.progress = function (handler) {
        if (typeof handler !== 'function') {
          throw new TypeError('Non-function passed as progress handler.')
        }
        window.JSAppView.__progress[uid] = handler
        return promise
      }
      return promise
    }
  
    /**
     * Check whether /Documents/<basename> exists.
     * @param {String} basename
     * @return {Promise<Boolean>}
     */
    function exists(basename) {
      argsCount('exists', 1, arguments)
      isBasename(basename)
      return systemCall('JSAppViewFileSystem_exists', arguments)
    }
  
    /**
     * Read /Documents/<basename> with the given encoding.
     * @param {String} basename
     * @param {String} encoding - utf8 or base64 only
     * @return {Promise<String}
     */
    function readFile(basename, encoding='utf8') {
      argsCount('readFile', 2, arguments)
      isBasename(basename)
      if (!['utf8', 'base64'].includes(encoding)) throw new Error(
        'readFile only supports utf8 and base64 encodings. To get binary data, you can refer to '+
        'the file directly by its basename (as a src attribute, for instance).'
      )
      return systemCall('JSAppViewFileSystem_readFile', arguments)
    }
  
    /**
     * Write the given data to /Documents/<basename>.
     * @param {String} basename
     * @param {String} data
     * @return {Promise<void>}
     */
    function writeFile(basename, data='') {
      argsCount('writeFile', 2, arguments)
      isBasename(basename)
      if (typeof data !== 'string') throw new Error('writeFile data param must be of type string.')
      return systemCall('JSAppViewFileSystem_writeFile', arguments)
    }
  
    /**
     * Read the contents of the /Documents/ directory.
     * @param {String} basename
     * @return {Promise<Array<String>>}
     */
    function readdir(dirpath) {
      argsCount('readdir', 1, arguments)
      if (typeof dirpath !== 'string') throw new Error('readdir path must be a string')
      return systemCall('JSAppViewFileSystem_readdir', arguments)
    }
  
    /**
     * Delete a single file.
     * @param {String} basename
     * @return {Promise<void>}
     */
    function unlink(basename) {
      argsCount('unlink', 1, arguments)
      isBasename(basename)
      return systemCall('JSAppViewFileSystem_unlink', arguments)
    }
  
    /**
     * Download a single file.
     * @param {String} url
     * @param {String} basename
     * @return {Promise<void>}
     */
    function downloadToFile(url, basename) {
      argsCount('downloadToFile', 2, arguments)
      isURL(url)
      isBasename(basename)
      return systemCall('JSAppViewFileSystem_downloadToFile', arguments)
    }
  
    /**
     * Download a group of files.
     * @param {Array<String>} urls
     * @return {Promise<Array<Object>>}
     */
    function downloadFiles(urls) {
      argsCount('downloadFiles', 1, arguments)
      urls.every(isURL)
      return systemCall('JSAppViewFileSystem_downloadFiles', urls)
    }
  
    /**
     * Generates a path string.
     * @param {Array<String>} ...strings 
     * @return {String}
     */
    function join(...strings) {
      if (strings.some(str => typeof str !== 'string')) {
        throw new TypeError('path.join accepts strings only')
      }
      let segments = []
      strings.forEach(str => segments = segments.concat(str.split('/')))
      segments = segments.filter(s=>s).filter(s=> s !== '.')
      while(~segments.indexOf('..')) {
        segments.splice(segments.indexOf('..') - 1, 2)
      }
      return segments.join('/').replace(/\/+/g, '/')
    }
  
    /**
     * Retrieves the basename from the given path string.
     * @param {String} path
     * @param {String|} ext
     * @return {String}
     */
    function basename(path, ext) {
      if (typeof path !== 'string') throw new TypeError('path must be a string')
      if (arguments.length > 1 && typeof ext !== 'string') {
        throw new TypeError('ext must be a string')
      }
      const base = path.split('/').pop()
      if (ext && base.slice(-ext.length) === ext) {
        return base.slice(0, -ext.length)
      }
      return base
    }
  
    /**
     * Retrieves the extension from the given path string.
     * @param {String} path
     * @return {String}
     */
    function extname(path) {
      if (typeof path !== 'string') throw new TypeError('path must be a string')
      const base = basename(path)
      if (!~base.indexOf('.')) return ''
      return '.' + base.split('.').pop()
    }
  
    /**
     * Retrieves the directory name from the given path string.
     * @param {String} path
     * @return {String}
     */
    function dirname(path) {
      if (typeof path !== 'string') throw new TypeError('path must be a string')
      return path.split('/').slice(0,-1).pop()
    }
  
    /**
     * Determines whether the given path is absolute, in the context of our app,
     * which means, it must begin with the full path to Documents/.
     * @param {String} path
     * @return {String}
     */
    function isAbsolute(path) {
      if (typeof path !== 'string') throw new TypeError('path must be a string')
      return path.indexOf(__dirname) === 0
    }
  
    /**
     * Passes a string to the native SQLite query execution function.
     * @param {String} sql
     * @return {Promise<?>}
     */
    function sqlite(sql) {
      if (typeof sql !== 'string') throw new Error(
        'Non-string passed as SQL query.'
      )
      if (arguments.length !== 1) throw new Error(
        `sqlite requires exactly 1 arguments. ${arguments.length} were passed.`
      )
      return systemCall('JSAppViewSQLite_query', arguments)
    }

    const path = {join, basename, extname, dirname, isAbsolute}
    const fs = {exists, readFile, writeFile, readdir, unlink, downloadToFile, downloadFiles}

    // Expose globals.
    // @note __dirname was already exposed by JSAppView.swift.
    window.__filename = path.join(window.__dirname, 'index.html')
    window.JSAppView = {__callbacks:[], __progress:[]}
    window.JSAppView_sqlite = sqlite
    window.JSAppView_fs = fs
    window.JSAppView_path = path
  }

  // Wrap it in a try/catch to prevent window.onerror from swallowing it.
  try {
    defineAPI()
    console.log('JSAppView libraries ready.')
  } catch(err) {
    console.log('JSAppView libraries failed execute.')
    log(err)
  }
})();
