# JSAppView
JSAppView is a swift class that extends iOS's WKWebView class to offer persistent storage via a node.js-like API, and to offer easy inclusion of local files within the web view (as in: `<img src="bg.png">`).

## Javascript API
On the main WKWebView javascript thread (i.e., in your web app), you can access `window.JSAppView_fs`, `window.JSAppView_path`, and `window.JSAppView_sqlite`. However, tools like Webpack and Browserify can alias these variables to make things look and feel more like node.js. Here's an example webpack.config.js file:

```js
module.exports = {
  entry: './src/index.js',
  output: {
    path: __dirname,
    filename: './build/bundle.js'
  },
  externals: {
    fs: 'JSAppView_fs',
    path: 'JSAppView_path',
    sqlite: 'JSAppView_sqlite'
  }
}
```

Using the above in combination with webpack, `fs`, `path`, and `sqlite` can be used with `require` calls as follows:

```js
const fs = require('fs')
const path = require('path')
const sqlite = require('sqlite')

// Do stuff.
```

### File System
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

### About `fs.downloadFiles`
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

    @IBOutlet var appview: JSAppView! // Change type from WKWebView to JSAppView
    
    override func loadView() {
        super.loadView()
        appview = JSAppView(viewController: self)
        self.view = appview
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        appview.ready() // Tell the JSAppView that we're ready to run the app.
    }
}
```
