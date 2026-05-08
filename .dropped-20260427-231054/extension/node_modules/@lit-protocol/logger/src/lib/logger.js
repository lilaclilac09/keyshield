"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.getDefaultLevel = void 0;
exports.getChildLogger = getChildLogger;
exports.setLoggerOptions = setLoggerOptions;
const tslib_1 = require("tslib");
const pino_1 = tslib_1.__importDefault(require("pino"));
const isNode = () => {
    let isNode = false;
    // @ts-ignore
    if (typeof process === 'object') {
        // @ts-ignore
        if (typeof process.versions === 'object') {
            // @ts-ignore
            if (typeof process.versions.node !== 'undefined') {
                isNode = true;
            }
        }
    }
    return isNode;
};
const getDefaultLevel = () => {
    let logLevel = 'silent';
    if (isNode()) {
        logLevel = process.env['LOG_LEVEL'] || 'silent';
    }
    else {
        // @ts-ignore
        logLevel = globalThis['LOG_LEVEL'] || 'silent';
    }
    // console.log('✅ logLevel', logLevel);
    return logLevel;
};
exports.getDefaultLevel = getDefaultLevel;
const DEFAULT_LOGGER_OPTIONS = {
    name: 'LitProtocolSDK',
    level: (0, exports.getDefaultLevel)() === 'debug2' ? 'debug' : (0, exports.getDefaultLevel)(),
};
// Custom logger wrapper for debug2 level
const createConsoleLogger = (name) => {
    const baseLogger = {
        level: 'debug', // Use standard level to avoid pino errors
        // Standard log levels that delegate to console
        fatal: (...args) => console.error(`[${name}] FATAL:`, ...args),
        error: (...args) => console.error(`[${name}] ERROR:`, ...args),
        warn: (...args) => console.warn(`[${name}] WARN:`, ...args),
        info: (...args) => console.info(`[${name}] INFO:`, ...args),
        debug: (...args) => console.log(`[${name}] DEBUG:`, ...args),
        trace: (...args) => console.log(`[${name}] TRACE:`, ...args),
        // Custom debug2 level using console.log
        debug2: (...args) => console.log(`[${name}] DEBUG2:`, ...args),
        // Child logger creation
        child: (bindings) => {
            const childName = bindings.module ? `${name}:${bindings.module}` : name;
            return createConsoleLogger(childName);
        },
        // Silent method (no-op)
        silent: () => { },
        // Add stub methods for pino compatibility
        on: () => baseLogger,
        addLevel: () => { },
        isLevelEnabled: () => true,
        levelVal: 30,
        version: '1.0.0',
    };
    return baseLogger;
};
let logger = ((0, exports.getDefaultLevel)() === 'debug2'
    ? createConsoleLogger(DEFAULT_LOGGER_OPTIONS.name)
    : (0, pino_1.default)(DEFAULT_LOGGER_OPTIONS));
exports.logger = logger;
function setLoggerOptions(loggerOptions, destination) {
    const finalOptions = {
        ...DEFAULT_LOGGER_OPTIONS,
        ...loggerOptions,
    };
    // Use console logger for debug2 level
    if (finalOptions.level === 'debug2') {
        exports.logger = logger = createConsoleLogger(finalOptions.name || 'LitProtocolSDK');
    }
    else {
        // Ensure we don't pass debug2 to pino - convert to debug instead
        const pinoOptions = {
            ...finalOptions,
            level: finalOptions.level === 'debug2' ? 'debug' : finalOptions.level,
        };
        exports.logger = logger = (0, pino_1.default)(pinoOptions, destination);
    }
    return logger;
}
function getChildLogger(...childParams) {
    return logger.child(...childParams);
}
//# sourceMappingURL=logger.js.map