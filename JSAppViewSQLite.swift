import Foundation
import SQLite3

var results = "" // A js object array string of the results.

class JSAppViewSQLite {

    var path: String!
    var connected: Bool!
    var db: OpaquePointer?
    
    init(docsDir: String) {
        self.path = docsDir + "js-app-view.sqlite"
        self.connected = false
    }
    
    private func connect() -> String {
        let dbfile = URL(string: self.path)
        if sqlite3_open(dbfile?.path, &self.db) != SQLITE_OK {
            self.connected = false
            return "fail"
        } else {
            self.connected = true
            return "success"
        }
    }
    
    public func query(sql: String) -> String {
        // Connect if we haven't already.
        return "'This does not work yet.'"
    }
}
