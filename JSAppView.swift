import WebKit
let fs = JSAppViewFileSystem()
let sqlite = JSAppViewSQLite(docsDir: fs.path)

// Determine the build environment.
var env: String {
    var _env = ""
    #if RELEASE
        _env = "release"
    #elseif DEBUG
        _env = "debug"
    #else
        _env = "not specified"
    #endif
    return _env
}

class JSAppView : WKWebView {

    var userContentController: WKUserContentController!
    
    let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as! String
    
    required init(coder decoder: NSCoder) {
        super.init(coder: decoder)!
    }
    
    init(viewController: ViewController) {
        self.userContentController = WKUserContentController()
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.userContentController = userContentController
        super.init(frame: viewController.view.bounds, configuration: config)
        self.scrollView.isScrollEnabled = false
        userContentController.add(viewController, name: "PRINT")
        userContentController.add(viewController, name: "JSAppViewOpenUrlInSafari")
        
        // File system message handlers:
        userContentController.add(viewController, name: "JSAppViewFileSystem_downloadToFile")
        userContentController.add(viewController, name: "JSAppViewFileSystem_downloadFiles")
        userContentController.add(viewController, name: "JSAppViewFileSystem_writeFile")
        userContentController.add(viewController, name: "JSAppViewFileSystem_readFile")
        userContentController.add(viewController, name: "JSAppViewFileSystem_readdir")
        userContentController.add(viewController, name: "JSAppViewFileSystem_exists")
        userContentController.add(viewController, name: "JSAppViewFileSystem_stat")
        userContentController.add(viewController, name: "JSAppViewFileSystem_unlink")
        
        // SQLite message handler:
        userContentController.add(viewController, name: "JSAppViewSQLite_query")
        
        self.copyResourcesToDocuments()
    }
    
    /**
     Determines whether the given basename points to an HTML5 file - html, css, js,
     images, fonts, (evntually video and audio).
     - parameter fname: String
     - returns: Bool
    */
    private func isWebFile(fname: String) -> Bool {
        
        if (fname == "img") {
            return true
        }
        
        let pat = "[.]((html?)|(js)|(css)|(jpe?g)|(gif)|(png)|(svg)|(woff2?)|(ttf))$"
        let regex = try! NSRegularExpression(pattern: pat, options: [.caseInsensitive])
        let matches = regex.matches(in: fname, options: [], range: NSRange(location: 0, length: fname.count))
        return matches.count > 0
    }
    
    /**
     Copy bundle contents (index.html especially) to the app's /Documents directory,
     so that the WKWebView can read all other contents of the directory without
     restrictions.
    */
    private func copyResourcesToDocuments() -> Void {
        let resourcesPath = Bundle.main.resourcePath!
        let resources = try! FileManager.default.contentsOfDirectory(atPath: resourcesPath)
        do {
            for item in resources {
                if !self.isWebFile(fname: item) {continue}
                let resourceItemPath = Bundle.main.resourcePath! + "/" + item
                let docsItemPath = String((fs.path).dropFirst(7)) + item
                
                // Remove an existing copy of this file.
                try? FileManager.default.removeItem(atPath: docsItemPath)
                try? FileManager.default.copyItem(atPath: resourceItemPath, toPath: docsItemPath)
                
                if (item == "JSAppView.js") {
                    let fileURL = Bundle.main.url(forResource: item, withExtension: nil)
                    let data = try Data(contentsOf: fileURL!)
                    fs.jslib = String(data: data, encoding: .utf8)!
                }
            }
            
        } catch {
            print(String(describing: error))
        }
    }
    
    /**
     Defines the JS API within the WKWebView by executing JSAppView.js, and then
     loads index.html.
    */
    public func ready() -> Void {
        let buildInfo = "window.__build={version:'\(self.appVersion)', env:'\(env)'};"
        let dirnameDef = "window.__dirname='\(fs.path)';"
        self.js(code: buildInfo + dirnameDef + fs.jslib)
        
        // Method 1:
        // self.loadFileURL(fs.baseURL, allowingReadAccessTo: fs.documentsURL)
        // ... Throws sandbox error.
        
        // Method 2:
        // do {
        //     let data = try Data(contentsOf: fs.indexHtmlURL)
        //     let htmlPage = String(data: data, encoding: .utf8)!
        //     self.loadHTMLString(htmlPage, baseURL: fs.baseURL)
        // } catch {
        //    print(String(describing: error))
        // }
        // Does not permit local file inclusion (on actual devices).
        
        // Method 3:
        self.load(URLRequest(url: fs.baseURL)) // Fingers crossed. Apple is the worst.
    }
    
    /**
     Fires a javascript callback in the WKWebView javascript thread, always
     from the main thread.
     - parameter id: String - a callback ID generated by the JS API
     - parameter js: String - JS code to be executed (usu. a string or 'new Error(...)').
     - note: window.JSAppView.__callbacks is an object with the id string as a key.
         Its value is a function, which will be called by the code we evaluate (see below).
    */
    public func jsCallback(id: String, js: String) -> Void {
        let code = "window.JSAppView.__callbacks[\(id)](\(js))"
        self.js(code: code)
    }
    
    /**
     Executes the given javascript code on the main thread.
     - parameter code: String
    */
    public func js(code: String) -> Void {
        DispatchQueue.main.async {
            self.evaluateJavaScript(code, completionHandler: { result, error in
                if error != nil { print("JS Error: \(String(describing: error))") }
            })
        }
    }
}

extension ViewController : WKScriptMessageHandler {
    /**
     Responds the to messages according their names.
     - parameter userContentController: WKUserContentController
     - parameter message: WKScriptMessage
    */
    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.name == "PRINT") {
            print(message.body as! String)
        }
        
        if (message.name == "JSAppViewOpenUrlInSafari") {
            let args = message.body as! Array<String>
            let id = args[0]
            let url = URL(string: args[1])!
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: convertToUIApplicationOpenExternalURLOptionsKeyDictionary([:]) as [String : Any], completionHandler: nil)
                self.appview.jsCallback(id: id, js: "") // Resolve js Promise<Void>
            } else {
                self.appview.jsCallback(id: id, js: "new Error('Invalid link.')")
            }
        }
        
        if (message.name == "JSAppViewFileSystem_downloadToFile") {
            let args = message.body as! Array<String>
            let id = args[0]
            let url = args[1]
            let fname = args[2]
            fs.downloadToFile(webview: self.appview, id: id, urlString: url, fname: fname)
        }
        if (message.name == "JSAppViewFileSystem_downloadFiles") {
            let args = message.body as! Array<String>
            let id = args[0]
            let urls = args[1...]
            fs.downloadFiles(webview: self.appview, id: id, urls: urls)
        }
        if (message.name == "JSAppViewFileSystem_readFile") {
            let args = message.body as! Array<String>
            let id = args[0]
            let fname = args[1]
            let encoding = args[2]
            let result = fs.readFile(fname: fname, encoding: encoding)
            self.appview.jsCallback(id: id, js: result)
        }
        if (message.name == "JSAppViewFileSystem_writeFile") {
            let args = message.body as! Array<String>
            let id = args[0]
            let fname = args[1]
            let data = args[2]            
            let result = fs.writeFile(fname: fname, data: data)
            self.appview.jsCallback(id: id, js: result)
        }
        if (message.name == "JSAppViewFileSystem_readdir") {
            let args = message.body as! Array<String>
            let id = args[0]
            let path = args[1]
            let result = fs.readdir(dirPath: path)
            self.appview.jsCallback(id: id, js: result)
        }
        if (message.name == "JSAppViewFileSystem_exists") {
            let args = message.body as! Array<String>
            let id = args[0]
            let fname = args[1]
            let result = fs.exists(fname: fname)
            self.appview.jsCallback(id: id, js: result)
        }
        if (message.name == "JSAppViewFileSystem_stat") {
            let args = message.body as! Array<String>
            let id = args[0]
            let fname = args[1]
            let result = fs.stat(fname: fname)
            self.appview.jsCallback(id: id, js: result)
        }
        if (message.name == "JSAppViewFileSystem_unlink") {
            let args = message.body as! Array<String>
            let id = args[0]
            let fname = args[1]
            let result = fs.unlink(fname: fname)
            self.appview.jsCallback(id: id, js: result)
        }
        if (message.name == "JSAppViewSQLite_query") {
            let args = message.body as! Array<String>
            let id = args[0]
            let sql = args[1]
            let result = sqlite.query(sql: sql)
            self.appview.jsCallback(id: id, js: result)
        }
    }
}

// Helper function inserted by Swift 4.2 migrator.
fileprivate func convertToUIApplicationOpenExternalURLOptionsKeyDictionary(_ input: [String: Any]) -> [UIApplication.OpenExternalURLOptionsKey: Any] {
    return Dictionary(uniqueKeysWithValues: input.map { key, value in (UIApplication.OpenExternalURLOptionsKey(string: key), value)})
}
