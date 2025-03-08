import {createWriteStream, WriteStream} from 'fs';
import {join} from 'path';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export interface LoggerOptions {
    logDir: string;
    logToConsole?: boolean;
    logToFile?: boolean;
    minLevel?: LogLevel;
}

export interface LogMetadata {
    [key: string]: unknown;
}

export class LoggerService {
    private static instance: LoggerService;
    private readonly logStream: WriteStream | null = null;
    private options: LoggerOptions;

    private constructor(options: LoggerOptions) {
        this.options = {
            logToConsole: true,
            logToFile: true,
            minLevel: LogLevel.INFO,
            ...options
        };

        if (this.options.logToFile) {
            const logFile = join(this.options.logDir, `p2p-exchange-${new Date().toISOString().split('T')[0]}.log`);
            this.logStream = createWriteStream(logFile, {flags: 'a'});
        }
    }

    public static getInstance(options: LoggerOptions): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService(options);
        }
        return LoggerService.instance;
    }

    public debug(message: string, meta?: LogMetadata): void {
        this.log(LogLevel.DEBUG, message, meta);
    }

    public info(message: string, meta?: LogMetadata): void {
        this.log(LogLevel.INFO, message, meta);
    }

    public warn(message: string, meta?: LogMetadata): void {
        this.log(LogLevel.WARN, message, meta);
    }

    public error(message: string, error: Error | string, meta?: LogMetadata): void {
        const errorMeta: Record<string, unknown> = typeof error === 'string'
            ? {message: error}
            : {
                name: error.name,
                message: error.message,
                stack: error.stack
            };

        this.log(LogLevel.ERROR, message, {...errorMeta, ...meta});
    }

    private log(level: LogLevel, message: string, meta?: LogMetadata): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const formattedMessage = this.formatLogMessage(timestamp, level, message, meta);

        if (this.options.logToConsole) {
            this.logToConsole(level, formattedMessage);
        }

        if (this.options.logToFile && this.logStream) {
            this.logStream.write(formattedMessage + '\n');
        }
    }

    private formatLogMessage(timestamp: string, level: LogLevel, message: string, meta?: LogMetadata): string {
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level}] ${message}${metaStr}`;
    }

    private logToConsole(level: LogLevel, message: string): void {
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(message);
                break;
            case LogLevel.INFO:
                console.info(message);
                break;
            case LogLevel.WARN:
                console.warn(message);
                break;
            case LogLevel.ERROR:
                console.error(message);
                break;
        }
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const minLevelIndex = levels.indexOf(this.options.minLevel || LogLevel.INFO);
        const currentLevelIndex = levels.indexOf(level);

        return currentLevelIndex >= minLevelIndex;
    }
}