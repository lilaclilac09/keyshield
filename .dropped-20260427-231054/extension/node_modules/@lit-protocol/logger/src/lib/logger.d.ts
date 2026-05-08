import { DestinationStream, LoggerOptions, Logger as Pino } from 'pino';
export declare const getDefaultLevel: () => string;
type Logger = Pino<string, boolean>;
declare let logger: Logger;
declare function setLoggerOptions(loggerOptions: LoggerOptions<string, false>, destination?: DestinationStream): Logger;
declare function getChildLogger(...childParams: Parameters<typeof logger.child>): Logger;
export { getChildLogger, logger, setLoggerOptions };
export type { Logger };
