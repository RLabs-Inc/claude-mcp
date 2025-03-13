declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    HOST?: string;
    DOCS_STORAGE_PATH?: string;
    GITHUB_TOKEN?: string;
    PUPPETEER_HEADLESS?: string;
    PUPPETEER_TIMEOUT?: string;
    LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  }
}