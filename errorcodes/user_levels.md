/app/node_modules/better-sqlite3/lib/methods/wrappers.js:5
        return this[cppdb].prepare(sql, this, false);
                           ^
SqliteError: table user_levels has no column named reroll_teller
    at Database.prepare (/app/node_modules/better-sqlite3/lib/methods/wrappers.js:5:21)
    at file:///app/src/database.js:151:24
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5) {
  code: 'SQLITE_ERROR'
}