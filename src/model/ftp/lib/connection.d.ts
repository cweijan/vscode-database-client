// Type definitions for the legacy FTP client (connection.js)
// This FTP implementation is based on the "ftp" npm package pattern.
// It uses CommonJS module.exports and prototypal inheritance.

declare module '@/model/ftp/lib/connection' {

    import { EventEmitter } from 'events';
    import { Readable } from 'stream';

    // ---- Interfaces (module-scoped: not exported, but visible to class FTP) ----
    interface FTPOptions {
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        secure?: boolean | 'implicit';
        secureOptions?: object;
        encoding?: string;
        connTimeout?: number;
        pasvTimeout?: number;
        keepalive?: number;
        debug?: (msg: string) => void;
    }

    interface ListingElement {
        type: string;
        name: string;
        target?: string;
        sticky: boolean;
        rights: {
            user: string;
            group: string;
            other: string;
        };
        acl: boolean;
        owner: string;
        group: string;
        size: number;
        date?: Date;
    }

    interface FTPError extends Error {
        code: number;
    }

    type Callback<T = any> = (err: FTPError | null, result?: T, code?: number) => void;

    // ---- Main FTP class (uses module-scoped interfaces above) ----
    class FTP extends EventEmitter {

        connected: boolean;
        options: FTPOptions;

        constructor();

        // Connection
        connect(options: FTPOptions): void;
        end(): void;
        destroy(): void;

        // Standard commands
        ascii(cb: Callback): this;
        binary(cb: Callback): this;
        abort(cb: Callback): this;
        abort(immediate: boolean, cb: Callback): this;
        cwd(path: string, cb: (err: FTPError | null, cwd?: string) => void, promote?: boolean): this;
        delete(path: string, cb: (err: FTPError | null) => void): this;
        site(cmd: string, cb: Callback): this;
        status(cb: Callback): this;
        rename(from: string, to: string, cb: Callback): this;
        logout(cb: Callback): this;
        listSafe(
            path: string | boolean | Callback,
            zcomp?: boolean | Callback,
            cb?: Callback,
        ): this;
        list(
            path: string,
            cb: (err: FTPError | null, list: ListingElement[]) => void,
        ): this;
        list(cb: (err: FTPError | null, list: ListingElement[]) => void): this;

        // File transfer
        get(
            path: string,
            cb: (err: FTPError | null, stream: Readable) => void,
        ): this;
        get(
            path: string,
            zcomp: boolean,
            cb: (err: FTPError | null, stream: Readable) => void,
        ): this;
        put(
            input: string | Buffer | Readable,
            path: string,
            cb: (err: FTPError | null) => void,
        ): this;
        put(
            input: string | Buffer | Readable,
            path: string,
            zcomp: boolean,
            cb: (err: FTPError | null) => void,
        ): this;
        append(
            input: string | Buffer | Readable,
            path: string,
            zcomp?: boolean | Callback,
            cb?: Callback,
        ): this;

        // Directory operations
        pwd(cb: (err: FTPError | null, cwd: string) => void): this;
        cdup(cb: Callback): this;
        mkdir(path: string, cb: (err: FTPError | null) => void): this;
        mkdir(path: string, recursive: boolean, cb: (err: FTPError | null) => void): this;
        rmdir(path: string, cb: (err: FTPError | null) => void): this;
        rmdir(path: string, recursive: boolean, cb: (err: FTPError | null) => void): this;

        // Extended commands
        size(path: string, cb: (err: FTPError | null, size: number) => void): this;
        lastMod(path: string, cb: (err: FTPError | null, date: Date) => void): this;
        restart(offset: number, cb: Callback): this;

        // System
        system(cb: (err: FTPError | null, system: string) => void): this;

        // EventEmitter overrides
        on(event: 'ready', listener: () => void): this;
        on(event: 'error', listener: (err: Error) => void): this;
        on(event: 'close', listener: (hadError: boolean) => void): this;
        on(event: 'end', listener: () => void): this;
        on(event: 'greeting', listener: (text: string) => void): this;
        on(event: string, listener: (...args: any[]) => void): this;
    }

    // Namespace merge: makes `Client.ListingElement`, `Client.FTPOptions`, etc. accessible
    namespace FTP {
        export type { FTPOptions, ListingElement, FTPError };
    }

    export = FTP;
}