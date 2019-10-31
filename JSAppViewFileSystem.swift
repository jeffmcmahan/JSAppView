import WebKit

class JSAppViewFileSystem {

    var path: String
    var jslib: String
    var documentsURL: URL
    var indexHtmlURL: URL
    var baseURL: URL
    
    init() {
        self.jslib = ""
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first as URL?
        self.path = (docs?.absoluteString)!
        self.documentsURL = URL(fileURLWithPath: self.path, isDirectory: true)
        let indexPath = Bundle.main.path(forResource: "build.index", ofType: "html")
        self.baseURL = URL(string: "build.index.html", relativeTo: docs)!
        self.indexHtmlURL = URL(fileURLWithPath: indexPath!)
    }

    /**
     Read a file on the assumption that it is plain text.
     - parameter filePath: URL
     - returns: String
    */
    private func readFileAsUtf8(filePath: URL) -> String {
        do {
            let data = try String(contentsOf: filePath,  encoding: .utf8)
            return "window.base64_to_unicode('" + data + "')" // Let the browser convert from base64
        } catch(let error) {
            let desc = String(describing: error)
            print(desc)
            return "new Error(`" + desc + "`)"
        }
    }
    
    /**
     Read a file on the assumption that it is a binary file.
     - parameter filePath: URL
     - returns: String - Base64 wrapped in single quotes.
    */
    private func readFileAsBase64(filePath: URL) -> String {
        do {
            let fileData = try Data.init(contentsOf: filePath)
            let data:String = fileData.base64EncodedString(options: NSData.Base64EncodingOptions.init(rawValue: 0))
            return "'" + data + "'" // Single quotes are safe here.
        } catch(let error) {
            let desc = String(describing: error)
            print(desc)
            return "new Error(`" + desc + "`)"
        }
    }

    /**
     Reads a file of the given basename from the Documents directory using the
     specified encoding.
     - parameter fname: String
     - parameter encoding: String
     - returns: String - a javascript expression
    */
    public func readFile(fname: String, encoding: String) -> String {
        let filePath = URL(string: self.path + fname)
        if encoding == "utf8" {
            return readFileAsUtf8(filePath: filePath!)
        }
        if encoding == "base64" {
            return readFileAsBase64(filePath: filePath!)
        }
        return "new Error('Invalid encoding (try utf8 or base64).')"
    }

    /**
     Reads the contents of the Documents directory and returns a list.
     - returns: String - a javascript array literal or Error initialization.
    */
    public func readdir(dirPath: String) -> String {
        let url = URL(string: dirPath)
        var filesList = ""
        do {
            let files = try FileManager.default.contentsOfDirectory(at: url!, includingPropertiesForKeys: nil, options: [])
            for url in files {
                filesList += "'\(String(describing: url.lastPathComponent))',"
            }
            return "[\(filesList)]"
        } catch (let err) {
            let desc = String(describing: err)
            print(desc)
            return "new Error('\(desc)')"
        }
    }

    /**
     Writes the given data to a file of the given fname in the Documents directory.
     - parameter fname: String
     - parameter data: String
     - returns: String - a javascript expression
    */
    public func writeFile (fname: String, data: String) -> String {
        let path = URL(string: self.path + fname)
        do {
            try data.write(to: path!, atomically: true, encoding: .utf8)
            return "'void-a0331d36011d813b'" // When this is the result, js result is Promise<Void>.
        } catch let error {
            let desc = "writeFile failed. \(String(describing: error))"
            print(desc)
            return "new Error('\(desc)')"
        }
    }

    /**
     Delete a file of the given fname from the Documents directory.
     - parameter fname: String
     - returns: String - a javascript expression
    */
    public func unlink(fname: String) -> String {
        let path = URL(string: self.path + fname)
        let doesExist = ((((try? path?.checkResourceIsReachable()) as Bool??)) ?? false)!
        if (!doesExist) {
            let desc = "Cannot delete file \(fname) because it does not exist."
            print(desc)
            return "new Error('\(desc)')"
        }
        do {
            let fileManager = FileManager.default
            try fileManager.removeItem(at: path!)
            return "'void-a0331d36011d813b'"
        } catch (let error) {
            let desc = String(describing: error)
            print(desc)
            return "new Error('\(desc)')"
        }
    }
    
    /**
     Determines whether a file of the given fname exists in the Documents directory.
     - parameter fname: String
     - returns: String - a javascript expression
    */
    public func exists(fname: String) -> String {
        let path = URL(string: self.path + fname)
        let doesExist = ((((try? path?.checkResourceIsReachable()) as Bool??)) ?? false)!
        if (doesExist) {
            return "true"
        } else {
            return "false"
        }
    }

    public func stat(fname: String) -> String {
        let url = URL(string: self.path + fname)
        if let attributes = try? FileManager.default.attributesOfItem(atPath: (url?.path)!) as [FileAttributeKey: Any] {
            let birthtime = attributes[FileAttributeKey.creationDate] as! Date
            let mtime = attributes[FileAttributeKey.modificationDate] as! Date
            let size = attributes[FileAttributeKey.size] as! Int
            return "{birthtime:'\(birthtime)', mtime:'\(mtime)', size:\(size)}"
        }
        return "new Error('ENOENT: no such file or directory, stat \(fname)')"
    }
    
    /**
     Downloads a single file from the given URL, and stores it with the given
     filename (the 'to' param).
     - parameter url: URL
     - parameter to: String
    */
    private func download(url: URL, to: String, completion: @escaping (_ result: String) -> Void) -> Void {
        let req = URLRequest(url: url)
        let sess = URLSession(configuration: .default)
        let task = sess.downloadTask(with: req) { tmpUrl, response, error in
            let destUrl = URL(string: self.path + to)
            let res = response as? HTTPURLResponse
            if (res?.statusCode == 200) {
                do {
                    try FileManager.default.copyItem(at: tmpUrl!, to: destUrl!)
                    completion("{url:`\(String(describing: url))`, result:'success'}")
                } catch (let err) {
                    let desc = "Error creating \(to): \(String(describing: err))"
                    print(desc)
                    completion("{url:`\(String(describing: url))`, result: new Error(`\(desc)`)}")
                }
            } else {
                let desc = "Error downloading \(to): \(String(describing: error))"
                print(desc)
                completion("{url:`\(String(describing: url))`, result: new Error(`\(desc)`)}")
            }
        }
        task.resume()
    }
    
    /**
     Download a remote file and save with the specified name.
     - parameter webview: JSAppView - webview in which to run callback
     - parameter id: String - to synchronize callbacks
     - parameter urlString: String
     - parameter fname: String
    */
    public func downloadToFile(webview: JSAppView, id: String, urlString: String, fname: String) -> Void {
        let url = URL(string: urlString)
        self.download(url: url!, to: fname) { result in
            webview.jsCallback(id: id, js: result)
        }
    }
    
    /**
     Download a set of remote files and save with the remote files' basenames.
     - parameter webview: JSAppView - webview in which to run callback
     - parameter id: String - to synchronize callbacks
     - parameter urls: ArraySlice<String>
     - parameter fname: String
    */
    public func downloadFiles(webview: JSAppView, id: String, urls: ArraySlice<String>) -> Void {
        
        // Handle the case where we download nothing.
        if (urls.count < 1) {
             webview.jsCallback(id: id, js: "[]")
            return
        }

        var results = [String]() // Overall results.
        var i = 0

        func parallelDl() -> Void {
            print("\(i)")
            let urlString = urls[urls.startIndex + i]
            i = (i + 1)
            let url = URL(string: urlString)
            let basename = url?.lastPathComponent
            self.download(url: url!, to: basename!) { result in
                results.append(result)
                if (results.count == urls.count) {
                    // Advise the webview that we're done.
                    var jsResults = ""
                    for result in results {
                        jsResults += (result + ",")
                    }
                    webview.jsCallback(id: id, js: "[\(jsResults)]")
                } else {
                    if (i < urls.count) {
                        parallelDl() // Trigger the next download.
                    }
                    // Advise the webview of progress.
                    let js = "window.JSAppView.__progress[\(id)](\(results.count), \(urls.count))"
                    webview.js(code: js)
                }
            }
        }
        
        // Start 4 downloaders in parallel (avoids timeouts).
        parallelDl()
        if (urls.count > 1) {
            parallelDl()
        }
        if (urls.count > 2) {
            parallelDl()
        }
        if (urls.count > 3) {
            parallelDl()
        }
    }
}
