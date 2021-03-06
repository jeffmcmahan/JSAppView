;(function () {

	'use strict'

	const noop = () => {}

	/////////////////////////////////////////////////////////////// LOG FUNCTIONS //////////////////

	/*
	Convert an Error object into a string to be printed to the console (in XCode most usefully).
	- param err: Error
	- returns: String
	*/
	function serializeError(err) {
		const file = (err.file || '(no file provided)').split(__dirname).join('...')
		const line = err.line || '(no line provided)'
		const column = err.column || '(no column provided)'
		const stack = err.stack ? err.stack.split(__dirname).join('.../') : '(no stack provided)'
        const message = err.message.split(__dirname).join('.../')
		return (
			`${err.constructor.name}: ${message}\n\n`+
			`in ${file} at line ${line}, column ${column}\n\n${stack}`
		)
	}
	
	/*
	Generates an indentation string (x number of spaces) according the given depth.
	- param depth: Number|Void
	- returns: String
	*/
	function indent(depth = 0) {
		let arr = []
		arr.length = depth * 2 + 1
		return arr.join(' ')
	}
	
	/*
	Removes stray spaces from the given string (to produce prettier serializations).
	- param str: String
	- returns: String
	*/
	function cleanUp(str) {
		return str
			.replace(/{\s+}/g, '{}')
			.replace(/\[\s+\]/g, '[]')
			.replace(/,\n(\s*)}/g, '\n$1}')
			.replace(/,\n(\s*)\]/g, '\n$1]')
	}
	
	/*
	Produces a String representation of any primitive value, so that it can be faith-
	fully represented in the XCode terminal.
	- note: Also handles Function and null types (?)
	- param val: String|Boolean|Number|null|undefined|...
	- returns: String
	*/
	function serializePrimitive(val, depth) {	
		// Primitives without constructors
        if (typeof val === 'function') {
            return `Function (${val.name || 'anonymous'})`
        }
        if (val === null) {
            return 'null'
        }
        if (typeof val === 'undefined') {
          return 'undefined'
        }
		
		// Primitives with constructors
		let output = (depth === 0) ? `${val.constructor.name}: ` : ''
        if (val instanceof Error) {
            return output + serializeError(val)
        }
		return output + val.toString()
	}
	
	function isPrimitive(val) {
		return !(typeof val === 'object' && val !== null)
	}
	
	/*
	Creates an XCode-friendly string representation of the given value.
	- param val: Any
	- param depth: Number|Void
	- param seen: Array|Void
	- returns: String
	*/
	function serialize(val, depth = 0, seen = []) {
		if (val instanceof Error) return serializeError(val)
		if (isPrimitive(val)) return serializePrimitive(val, depth)
		
		// Limit depth of representation to 3 levels.
		if (depth >= 3) return (val.constructor)
            ? val.constructor.name
            : ('' + val.toString)

		let output = ''
		if (depth === 0) output += `${val.constructor.name}: `
		depth++
		if (val instanceof Array) {
			seen.push(val)
			output += '[\n'
			val.forEach(innerVal => {
				if (seen.includes(innerVal)) {
					output += `${indent(depth)}(circular)\n`
				} else {
					output += `${indent(depth)}${serialize(innerVal, depth, seen)},\n`
				}
			})
			output += indent(depth - 1) + ']'
		} else { // Objects
			seen.push(val)
			output += '{\n'
			Object.keys(val).forEach(key => {
				if (seen.includes(val[key])) {
					output += `${indent(depth)}${key}: (circular),\n`
				} else {
					output += `${indent(depth)}${key}: ${serialize(val[key], depth, seen)},\n`
				}
			})
			output += indent(depth - 1) + '}'
		}
		return cleanUp(output)
	}
	
	/*
    Print a set of values to the native iOS console.
    - param vals: Array<Mixed>
    */
	function log(vals) {
		vals = vals.map(val => serialize(val)).join('\n\n').split('\n').join('\n  ')
		window.webkit.messageHandlers.PRINT.postMessage(
			`\n<JSAppView>\n\n  ${vals}\n\n</JSAppView>\n`
		)
	}

	// Redefine console methods.
	const __consoleLog = console.log
	const __consoleError = console.error
  
	window.console = {}
	console.log = function (...vals) {
		log(vals)
		__consoleLog(...vals)
	}
	console.error = function (err) {
		log([err])
		__consoleError(err)
	}

	// Listen for onerror events and send them to the console.
	window.onerror = function (messageOrEvent, source, lineno, colno, error) {
		console.error(error)
		return true
	}

	/////////////////////////////////////////////////////////////// TYPE CHECKERS //////////////////

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
        if (/\s/.test(val)) {
            throw new Error(`The basename parameter cannot contain spaces: "${val}".`)
        }
		mustBeNonEmptyString(val)
		if (val.includes('/')) {
			throw new Error(`The basename parameter cannot contain slashes ("/"): "${val}".`)
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

	/////////////////////////////////////////////////////////////// API FUNCTIONS //////////////////

	/*
    Pass the given args to the WKWebView message of the given name, and fire the correct 
    callback back when finished, to resolve/reject the returned Promise.
    - param name: String -- non-empty
    - param args: Object<Arguments>
    - returns: Promise<Any> -- whatever the native function evals
    */
	function systemCall(name, args) {

		// Generate a unique ID for the system call; to keep track of callbacks.
		const uid = Math.random().toString()
		const promise = new Promise((resolve, reject) => {
			
			// Create a callback function stored with the unique ID as key.
			window.JSAppView.__callbacks[uid] = function (result) {

				// Don't let the callbacks object grow indefinitely.
				delete window.JSAppView.__callbacks[uid]
				delete window.JSAppView.__progress[uid]

				// Check to result type and content to see how to 
				if (result instanceof Error) {
					reject(result)
                } else if (result === 'void-a0331d36011d813b') {
                    resolve() // Don't resolve anything when we see the "void-a0331..." string.
				} else {
					if (typeof result === 'string') {
						result = result.split('\\`').join('`').split('\\${').join('${')
					}
					resolve(result)
				}
			}
			
			// Pass a message to Swift, to run native code and provide the UID, so
			// that swift can pass the result to correct JS callback function (see above).
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
 
    /*
    Get a file stat from iOS.
    - param basename: String
    - returns: Promise<Object>
    */
    function stat(basename) {
        argsCount('exists', 1, arguments)
        isBasename(basename)
        // Todo: Define ctime
        // Alter date formats to match nodejs API?
        return systemCall('JSAppViewFileSystem_stat', arguments)
    }

	/*
    Check whether /Documents/<basename> exists.
    - param basename: String
    - returns: Promise<Boolean>
    */
	function exists(basename) {
		argsCount('exists', 1, arguments)
		isBasename(basename)
		return systemCall('JSAppViewFileSystem_exists', arguments)
	}

	/*
    From base64, to percent-encoding, to text.
    - param str: String
	- returns: String
	- note: This is used (via eval()) by JSAppViewFileSystem.swift to pass back
			the result of reading a file.
    */
   window.base64_to_unicode = function (str) {
		try {
			return decodeURIComponent(escape(window.atob(str)))
		} catch (err) {
			console.log(err)
			return err
		}
	}

	/*
    Read /Documents/<basename> with the given encoding.
    - param basename: String
    - param encoding: String --- either 'utf8' or 'base64'
	- returns: Promise<String>
    */
	function readFile(basename, encoding='utf8') {
		argsCount('readFile', 2, arguments)
		// isBasename(basename)
		if (!['utf8', 'base64'].includes(encoding)) {
            throw new Error(
                'readFile only supports utf8 and base64 encodings. To get binary data, you can refer to '+
                'the file directly by its basename (as a src attribute, for instance).'
		    )
        }
		return systemCall('JSAppViewFileSystem_readFile', arguments)
	}
  
    /*
    From text, to percent-encoding, to base64.
    - param str: String
	- returns: String
    */
    window.unicode_to_base64 = function (str) {
        try {
            return window.btoa(unescape(encodeURIComponent(str)))
        } catch (err) {
            console.log(err)
            return err
        }
    }

	/*
    Write the given data to /Documents/<basename>.
    - param basename: String
    - param data: String
    - returns: Promise<Void>
    */
	function writeFile(basename, data) {
		argsCount('writeFile', 2, arguments)
		isBasename(basename)
		if (typeof data !== 'string') {
            throw new Error('writeFile data param must be of type string.')
		}
		// Safely encode the string as base64.
        arguments[1] = window.unicode_to_base64(data)
		return systemCall('JSAppViewFileSystem_writeFile', arguments)
	}

	/*
    Read the contents of the /Documents/ directory.
    - param basename: String
    - returns: Promise<Array<String>>
    */
	function readdir(dirpath) {
		argsCount('readdir', 1, arguments)
		if (typeof dirpath !== 'string') {
            throw new Error('readdir path must be a string')
        }
		return systemCall('JSAppViewFileSystem_readdir', arguments)
	}

	/*
    Delete a single file.
    - param basename: String
    - returns: Promise<Void>
    */
	function unlink(basename) {
		argsCount('unlink', 1, arguments)
		isBasename(basename)
		return systemCall('JSAppViewFileSystem_unlink', arguments)
	}

	/*
    Download a single file.
    - param url: String
    - param basename: String
    - returns: Promise<String> - 'success'
    */
	function downloadToFile(url, basename) {
		argsCount('downloadToFile', 2, arguments)
		isURL(url)
		isBasename(basename)
        return new Promise((resolve, reject) => {
            systemCall('JSAppViewFileSystem_downloadToFile', arguments).then(result => {
				if (result.status instanceof Error) {
					return reject(result.status)
				}
				resolve('success')
			}).catch(reject)
        })
	}

	/*
    Download a group of files.
    - param urls: Array<String>
    - returns: Promise<Array<Object>>
    */
	function downloadFiles(urls) {
		argsCount('downloadFiles', 1, arguments)
		urls.every(isURL)
		return systemCall('JSAppViewFileSystem_downloadFiles', urls)
	}
  
    /*
    Backgrounds the app and opens the given URL in Safari.
    - param url: String
    - returns: Promise<Void>
    */
    function openUrlInSafari(url) {
        argsCount('OpenUrlInSafari', 1, arguments)
        isURL(url)
        return systemCall('JSAppViewOpenUrlInSafari', arguments)
    }

	/*
    Generates a path string.
    - param strings: Array<String>
    - returns: String
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

	/*
    Retrieves the basename from the given path string.
    - param path: String
    - param ext: String|void
    - returns String
    */
	function basename(path, ext) {
		if (typeof path !== 'string') {
            throw new TypeError('path must be a string')
        }
		if (arguments.length > 1 && typeof ext !== 'string') {
			throw new TypeError('ext must be a string')
		}
		const base = path.split('/').pop()
		if (ext && base.slice(-ext.length) === ext) {
			return base.slice(0, -ext.length)
		}
		return base
	}

	/*
    Retrieves the extension from the given path string.
    - param path: String
    - returns: String
    */
	function extname(path) {
		if (typeof path !== 'string') {
            throw new TypeError('path must be a string')
        }
		const base = basename(path)
		if (!~base.indexOf('.')) {
            return ''
        }
		return '.' + base.split('.').pop()
	}

	/*
    Retrieves the directory name from the given path string.
    - param path: String
    - returns: String
    */
	function dirname(path) {
		if (typeof path !== 'string') {
            throw new TypeError('path must be a string')
        }
		return path.split('/').slice(0,-1).pop()
	}

	/*
    Determines whether the given path is absolute, in the context of our app,
    which means, it must begin with the full path to Documents/.
    - param path: String
    - returns: String
    */
	function isAbsolute(path) {
		if (typeof path !== 'string') {
            throw new TypeError('path must be a string')
        }
		return path.indexOf(__dirname) === 0
	}

	/*
    Passes a string to the native SQLite query execution function.
    - param sql: String
    - returns: Promise<*>
    */
	function sqlite(sql) {
		if (typeof sql !== 'string') {
            throw new Error('Non-string passed as SQL query.')
        }
		if (arguments.length !== 1) {
            throw new Error(`sqlite requires exactly 1 arguments. ${arguments.length} were passed.`)
        }
		return systemCall('JSAppViewSQLite_query', arguments)
	}
  
    window.assert = condition => {
        if (!condition) {
            console.log('Assertion failed.')
            throw new Error('Assertion failed.')
        }
    }
  
    window.assert.equal = (a, b) => {
        if (a !== b) {
            console.log('Strict equality assertion failed.', a, b)
            throw new Error('Strict equality assertion failed.')
        }
    }

	// Mimic the Node.js API surface.
	const path = {join, basename, extname, dirname, isAbsolute}
	const fs = {exists, stat, readFile, writeFile, readdir, unlink, downloadToFile, downloadFiles}

	// Expose globals.
	// n.b.: window.__dirname gets defined by JSAppView.swift
	window.__filename = path.join(window.__dirname, './www.js/index.html')
	window.JSAppView = {__callbacks:[], __progress:[], openUrlInSafari}
	window.sqlite = sqlite
	window.fs = fs
	window.path = path
    
  
    // THIS IS THE WAY FORWARD
//    fs.readFile('www.js/index.html', 'base64').then(data => {
//
//        //
//
//        document.write(atob(data))
//        setTimeout(() => throw new Error('!'), 5000)
//    }).catch(console.log)

})();
