/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 非空时直连该地址；开发环境留空则使用同源 `/api`（需 Vite proxy） */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
