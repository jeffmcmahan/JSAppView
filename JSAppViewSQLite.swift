import Foundation
import SQLite3

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
        if !self.connected {
            let status = self.connect()
            if status != "success" {
                let desc = "Could not open SQLite database."
                print(desc)
                return "new Error(`\(desc)`)"
            }
        }
        
        var results = "'Results go here.'"
        // Execute queries directly.
        sqlite3_exec(self.db, sql, { resultVoidPointer, columnCount, values, columns in
            // Do stuff.
            return 0
        }, nil, nil)
        
        return results
    }
}
