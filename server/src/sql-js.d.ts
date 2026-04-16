declare module 'sql.js' {
  const initSqlJs: (config?: {
    locateFile?: (file: string) => string
  }) => Promise<{
    Database: new (data?: Uint8Array) => {
      prepare: (sql: string) => {
        bind: (values: unknown[]) => void
        step: () => boolean
        getAsObject: () => Record<string, unknown>
        free: () => void
      }
      run: (sql: string) => void
      exec: (sql: string) => void
      export: () => Uint8Array
    }
  }>
  export default initSqlJs
}
