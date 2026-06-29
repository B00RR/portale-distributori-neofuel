/**
 * Application Constants
 * Centralizes all magic numbers and configuration values
 */

// === Performance & Timeouts ===
export const DEBOUNCE_DEFAULT_MS = 300;
export const THROTTLE_DEFAULT_MS = 1000;
export const RATE_LIMIT_MAX_CALLS = 5;
export const RATE_LIMIT_WINDOW_MS = 60000;
export const REQUEST_TIMEOUT_MS = 30000;

// === Validation ===
export const MIN_PRICE_EURO = 0.01;
export const MAX_PRICE_EURO = 10.0;
export const MIN_COUNTER_VALUE = 0;
export const MAX_COUNTER_VALUE = 999999.99;
export const COUNTER_DECIMAL_PLACES = 2;

// === Discrepancy Thresholds ===
export const MINOR_DISCREPANCY_THRESHOLD = 20.0; // €
export const MAJOR_DISCREPANCY_THRESHOLD = 100.0; // €
export const ACCEPTABLE_VARIANCE_PERCENT = 2; // 2%

// === UI Configuration ===
export const MODAL_ANIMATION_DURATION_MS = 300;
export const TOAST_DURATION_MS = 3000;
export const TOAST_ERROR_DURATION_MS = 5000;
export const LOADING_SPINNER_DELAY_MS = 500;

// === Pagination ===
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// === File Upload ===
export const MAX_FILE_SIZE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/vnd.ms-excel'];

// === Number Formatting ===
export const LOCALE_IT = 'it-IT';
export const CURRENCY_EUR = 'EUR';
export const DECIMAL_SEPARATOR = ',';
export const THOUSANDS_SEPARATOR = '.';

// === Regex Patterns ===
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[0-9]{10,15}$/;
// Regex sicura: i due gruppi \d+ sono separati dalla classe [.,] (disgiunta
// dalle cifre), quindi non c'e' ambiguita' ne' backtracking catastrofico.
// Falso positivo dell'euristica safe-regex.
// eslint-disable-next-line security/detect-unsafe-regex
export const NUMERIC_REGEX = /^-?\d+([.,]\d+)?$/;

// === HTTP Status Codes ===
export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_SERVER_ERROR = 500;

// === Date & Time ===
export const DATE_FORMAT_ISO = 'YYYY-MM-DD';
export const DATETIME_FORMAT_ISO = 'YYYY-MM-DD HH:mm:ss';
export const TIME_ZONE_IT = 'Europe/Rome';

// === Cache ===
export const CACHE_DURATION_MS = 300000; // 5 minutes
export const CACHE_MAX_ITEMS = 100;

// === Test Configuration ===
export const TEST_TIMEOUT_MS = 10000;
export const E2E_TIMEOUT_MS = 30000;

// === Performance Budgets ===
export const LIGHTHOUSE_MIN_SCORE = 95;
export const MAX_BUNDLE_SIZE_KB = 200;
export const MAX_TOTAL_SIZE_KB = 500;
export const TARGET_FCP_MS = 1800;
export const TARGET_LCP_MS = 2500;
export const TARGET_TTI_MS = 3800;
export const TARGET_TBT_MS = 300;

// === Test Coverage Targets ===
export const COVERAGE_STATEMENTS = 90;
export const COVERAGE_BRANCHES = 85;
export const COVERAGE_FUNCTIONS = 90;
export const COVERAGE_LINES = 90;

// === Build Configuration ===
export const CHUNK_SIZE_WARNING_LIMIT_KB = 500;
export const NODE_ENV_PRODUCTION = 'production';
export const NODE_ENV_DEVELOPMENT = 'development';

// === Error Messages ===
export const ERROR_NETWORK = 'Errore di connessione. Verifica la tua connessione internet.';
export const ERROR_UNAUTHORIZED = 'Accesso non autorizzato. Effettua il login.';
export const ERROR_NOT_FOUND = 'Risorsa non trovata.';
export const ERROR_SERVER = 'Errore del server. Riprova più tardi.';
export const ERROR_VALIDATION = 'Dati non validi. Controlla i campi del form.';

// === Success Messages ===
export const SUCCESS_SAVE = 'Salvato con successo!';
export const SUCCESS_DELETE = 'Eliminato con successo!';
export const SUCCESS_UPDATE = 'Aggiornamento completato!';
