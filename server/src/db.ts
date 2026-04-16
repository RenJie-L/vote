import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
/** `sql.js` 入口在 `dist/sql-wasm.js`，包根为其上两级 */
const sqlJsPackageRoot = path.dirname(
  path.dirname(require.resolve('sql.js')),
)

/**
 * sql.js（WASM）封装，避免 better-sqlite3 原生模块在 Windows 上的 EBUSY/EPERM 与 Node 版本不匹配问题。
 * API 形状接近 better-sqlite3：prepare().run/get/all 与 transaction()。
 */
type SqlJsStatement = {
  bind(values: unknown[]): void
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): void
}

type SqlJsDatabase = {
  prepare(sql: string): SqlJsStatement
  run(sql: string): void
  exec(sql: string): void
  export(): Uint8Array
}

export class SqliteDb {
  private readonly raw: SqlJsDatabase
  private readonly filePath: string
  private inTransaction = false

  constructor(raw: SqlJsDatabase, filePath: string) {
    this.raw = raw
    this.filePath = filePath
  }

  prepare(sql: string) {
    const db = this.raw
    return {
      run: (...params: unknown[]) => {
        const stmt = db.prepare(sql)
        stmt.bind(params)
        stmt.step()
        stmt.free()
        this.maybePersist()
      },
      get: (...params: unknown[]) => {
        const stmt = db.prepare(sql)
        stmt.bind(params)
        if (!stmt.step()) {
          stmt.free()
          return undefined
        }
        const row = stmt.getAsObject()
        stmt.free()
        return row
      },
      all: (...params: unknown[]) => {
        const stmt = db.prepare(sql)
        stmt.bind(params)
        const rows: Record<string, unknown>[] = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject())
        }
        stmt.free()
        return rows
      },
    }
  }

  transaction(fn: () => void) {
    this.inTransaction = true
    this.raw.run('BEGIN IMMEDIATE')
    try {
      fn()
      this.raw.run('COMMIT')
    } catch (e) {
      try {
        this.raw.run('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw e
    } finally {
      this.inTransaction = false
      this.persist()
    }
  }

  private maybePersist() {
    if (!this.inTransaction) this.persist()
  }

  persist() {
    const dir = path.dirname(this.filePath)
    fs.mkdirSync(dir, { recursive: true })
    const data = this.raw.export()
    fs.writeFileSync(this.filePath, Buffer.from(data))
  }
}

export async function openDatabase(dbPath: string): Promise<SqliteDb> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(sqlJsPackageRoot, 'dist', file),
  })

  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })

  let raw: SqlJsDatabase
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath)
    raw = new SQL.Database(new Uint8Array(buf)) as SqlJsDatabase
  } else {
    raw = new SQL.Database() as SqlJsDatabase
  }

  raw.run('PRAGMA foreign_keys = ON')
  raw.exec(`
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL,
      option_id TEXT NOT NULL,
      voter_session TEXT NOT NULL,
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
      UNIQUE (poll_id, voter_session)
    );

    CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id);
  `)

  const db = new SqliteDb(raw, dbPath)
  if (!fs.existsSync(dbPath)) {
    db.persist()
  }

  return db
}
