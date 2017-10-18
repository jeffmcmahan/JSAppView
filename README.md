# JSAppView
## Javascript API
On the main WKWebView javascript thread (i.e., in your web app), you can access the API at `window.JSAppView`. It has two properties: `fs`, which is the file system API and `sqlite` which is the database API.

### File System
```js
const {fs} = window.JSAppView

fs.root                                          // String - 'file://.../Documents
fs.getFileURL(basename:String)                   // String - 'file://.../Documents/<basename>'
fs.exists(basename:String)                       // Promise<Boolean>
fs.readFile(basename:String, encoding:String)    // Promise<String>
fs.writeFile(basename:String, data:String)       // Promise<void>
fs.readdir()                                     // Promise<Array> - /Documents contents
fs.unlink(basename:String)                       // Promise<void>
fs.downloadToFile(url:String, basename:String)   // Promise<void>
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

### SQLite
Has not been written yet.

## Swift 4 + Xcode 9

Add JSAppView.swift, JSAppViewFileSystem.swift and JSAppView.js to your project. Add index.html and other core web app files to the project. All will be copied into the app's Documents directory and run from there. In the main storyboard, create a WKWebView with a subview, and attach it to ViewController.swift. It should look as shown below (as a starting point). 

```swift
import WebKit

class ViewController: UIViewController {

    @IBOutlet var appview: JSAppView! // JSAppView extends WKWebView
    
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
