# JSAppView
JSAppView is a swift class that extends iOS's WKWebView class to offer clean persistent storage APIs, easy inclusion of local files in the DOM (as in: `<img src="bg.png">`), and a smoother development experience in general.

## Console
Logging data with `console.log` or `console.error` will print output in both the browser console and in XCode. Circular and redundant objects and arrays are handled effectively, and types are stated explicitly for primitive values in the XCode console. For example:

```
console.log('Hello world!')
```

Produces the following in the native console:

```
<JSAppView>

  String: Hello world!

</JSAppView>
```

Care has been taken to ensure that the web view provides ample error data to `window.onerror` without requiring `crossorigin` script includes and CORS headers. This makes it possible to debug HTML5 apps without constant recourse to the Safari Web Inspector.

## Javascript API
On the main WKWebView javascript thread (i.e., in your web app), you can access `window.JSAppView_fs`, `window.JSAppView_path`, and `window.JSAppView_sqlite`. However, tools like Webpack and Browserify can alias these variables to make things look and feel more like node.js. Here's an example webpack.config.js file:

```js
module.exports = {
  entry: './src/index.js',
  output: {
    path: __dirname,
    filename: './build/bundle.js'
  },
  target: 'node',       // Tell webpack to assume the environment is node.
  node: {
    __dirname: false,   // Tell webpack not to define this.
    __filename: false,  // Tell webpack not to define this.
  },
  externals: {
    fs: 'JSAppView_fs',
    path: 'JSAppView_path',
    sqlite: 'JSAppView_sqlite'
  }
}
```

Using the above in combination with webpack, `fs`, `path`, and `sqlite` can be used with `require` calls as follows:

NOTICE: Failing to configure the `target` (and `node`) may result in the `__dirname` and `__filename` variables having incorrect values in certain contexts because webpack uses these variables to bundle the code (webpack assumes, incorrectly in our case, that `/` will work as a file system root).

```js
const fs = require('fs')
const path = require('path')
const sqlite = require('sqlite')

// Do stuff.
```

### File System
The file system module mimics the node.js `fs` API, but asynchronous function return promises instead of accepting callbacks. Performance is good - much better than the Cordova file plugin and internal web-server-based implementations, in my experience. A `readdir` call to a directory containing 1,500 files takes 15-18ms; `readFile` resolves data in 1-4ms.

```js
const fs = window.JSAppView_fs

__dirname                                        // 'file://.../Documents'
__filename                                       // 'file://.../Documents/index.html'

fs.exists(basename:String)                       // Promise<Boolean>
fs.readFile(basename:String, encoding:String)    // Promise<String> - File contents
fs.writeFile(basename:String, data:String)       // Promise<String> - Abs path to the file
fs.unlink(basename:String)                       // Promise<String> - Abs path to the file
fs.readdir(dirpath:String)                       // Promise<Array> - dir contents
fs.downloadToFile(url:String, basename:String)   // Promise<Object> - {url, status}
fs.downloadFiles(urls:Array<String>)             // Promise<Array<Object>> with progress API
```

### About `downloadFiles`
`downloadFiles` can fetch large numbers of files efficiently. It's asynchronous all the way down, and has been tested on LAN connections with mass downloads of more than 1,500 files (>1gb in all). The tasks finish in 10-15 seconds, with no visible degradation in the webview's DOM, animation, or general javascript performance.

**Promise:** The `Array<Object>` resolved by `fs.downloadFiles` is of the form:

```js
[
  {url: 'http://...', result: 'success'},
  {url: 'http://...', result: new Error('...')},
  ...
]
```

**Progress:** The `fs.downloadFiles` function offers a course progress-tracking API, which reports the number of downloads done and the total number to be done. (*N.b.:* unless the files are of the same size presenting *done* ÷ *total* to the user as a float or percentage invites a false impression of precision; it may be better to report "13 of 61 files downloaded").

Here's an example using the `.then()`-style:

```js
function updateDOM(done, total) {
  domElement.innerText = `${done} of ${total} downloaded`
}

fs.downloadFiles(urls)
  .progress(updateDOM)
  .then(doSomething)
  .catch(handleErr)
```

And here's the same example using async/await:

```js
try {
  const results = await fs.downloadFiles(urls).progress(updateDOM)
  doSomething(results)
} catch(err) {
  handlerErr(err)
}
```

### Path Module
The path module mimics a subset of the node.js module of the same name, but dispenses with non-POSIX functionality, and with functionality aimed at complex path parsing and generation, since JSAppView keeps everything in a single, flat directory.

```js
const path = window.JSAppView_path

path.join(__dirname, 'log.txt')   // 'file://.../Documents/log.txt'
path.basename(fpath)              // 'log.txt'
path.basename(fpath, '.txt')      // 'log'
path.dirname('/foo/bar/baz')      // '/foo/bar/'
path.extname('log.txt')           // '.txt'
path.isAbsolute(__dirname)        // true
```

### SQLite (@todo)
A single SQLite database is created and made available to your app, via an `.sqlite` member, to which one or more semicolon-separated which SQL statements can be passed. The function returns a promise which resolves results or rejects with errors. Under the hood, this is done via the [SQLite C interface](https://sqlite.org/c3ref/exec.html), without third party libraries, wrappers, helpers, etc.).

```js
const sqlite = window.JSAppView_sqlite

try {
  const results = await sqlite('select * from ...')
  doSomething(results)
} catch (err) {
  console.log(err)
}
```

## Swift 4 + Xcode 9
Add JSAppView files to an Xcode project, along with core web app files. In the main storyboard, create a WKWebView with a subview, and attach it to ViewController.swift. It should look as shown below.

```swift
import WebKit

class ViewController: UIViewController {

   @IBOutlet var appview: JSAppView!
    override func loadView() {
        super.loadView()
        appview = JSAppView(viewController: self)
        appview.ready()
        self.view = appview
    }
}
```
