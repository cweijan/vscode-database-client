import { ChildProcess, spawn } from "child_process";
import { Transform } from "stream";
import { EOL } from "os";
import { Database } from "./interfaces/database";
const csvparser = require("csv-parser");

const NO_HANDLER = (...args: any[]) => {}; // this is just an empty function to handle callbacks i dont care about

const RESULT_SEPARATOR =new Date().getTime()+""

export class CliDatabase implements Database {
    readonly sqliteProcess?: ChildProcess;
    readonly pid?: number;
    private _started: boolean;
    private _ended: boolean;
    private csvParser: Transform;
    private startCallback?: (err: Error) => void;
    private endCallback?: (err?: Error) => void;
    private writeCallback?: (rows: string[][], err?: Error) => void;
    private execQueue: {sql: string, callback?: (rows: string[][], err?: Error) => void}[];
    private errStr: string;
    private rows: string[][];
    private busy: boolean;

    constructor(private command: string, private path: string, callback: (err: Error) => void) {
        let args = ["-csv", "-header", "-bail", "-nullvalue", "NULL"];

        this._started = false;
        this._ended = false;
        this.errStr = "";
        this.rows = [];
        this.execQueue = [];
        this.busy = false;
        
        this.startCallback = callback;

        this.csvParser = csvparser({separator: ',', strict: false, headers: false});
        
        try {
            this.sqliteProcess = spawn(this.command, args, {stdio: ['pipe', "pipe", "pipe" ]});
        } catch(err) {
            let startError = new Error("SQLite process failed to start: "+err.message);
            setTimeout(() => this.onStartError(startError), 0);
            return;
        }

        this.sqliteProcess.once('error', (err: Error) => {
            let startError = new Error("SQLite process failed to start: "+err.message);
            this.onStartError(startError);
        });

        const quotedPath = `"${this.path.replace(/\\/g, "/")}"`;
        console.log(quotedPath)
        try {
            this._write(`.open ${quotedPath}${EOL}`);
            this._write(`select 1 from sqlite_master;${EOL}`);
            this._write(`.print ${RESULT_SEPARATOR}${EOL}`);
            this.busy = true;
        } catch(err) {
            setTimeout(() => this.onStartError(err), 0);
            return;
        }

        this.sqliteProcess.once('exit', (code, signal) => {
            this.onExit(code, signal);
        });

        this.sqliteProcess.stderr.on("data", (data) => {
            this.onError(data);
        });
        
        this.sqliteProcess.stdout.pipe(this.csvParser).on("data", (data: Object) => {
            this.onData(data);
        });

        // register an empty handler for stdio,
        // we dont care about errors,
        // they will only occur when the process stops because of -bail
        this.sqliteProcess.stdin.once("error", NO_HANDLER);
        this.sqliteProcess.stdout.once("error", NO_HANDLER);
        this.csvParser.once("error", NO_HANDLER);
    }

    close(callback: (err?: Error) => void): void {
        if (this._ended) {
            if (callback) callback(new Error("SQLite process already ended."));
            return;
        }
        try {
            this._ended = true;
            this.endCallback = callback;
            this.execQueue.push({sql: ".exit"});
            if (!this.busy) {
                this.next();
            }
        } catch(err) {
            //
        }
    }
    
    execute(sql: string, callback?: (rows: string[][], err?: Error) => void) {
        if (this._ended) {
            if (callback) callback([], new Error("SQLite process already ended."));
            return;
        }

        // trim the sql
        sql= sql.trim();

        // ignore if it's a dot command
        if (sql.startsWith(".")) {
            return;
        }
        // add a space after EXPLAIN so that the result is a table (see: https://www.sqlite.org/eqp.html)
        if (sql.toLowerCase().startsWith("explain")) {
            let pos = "explain".length;
            sql = sql.slice(0, pos) + " " + sql.slice(pos);
        }

        try {
            this.execQueue.push({sql: sql, callback: callback});
            if (!this.busy) {
                this.next();
            }
        }catch(err) {
            //
        }
    }

    private _write(text: string) {
        if (!this.sqliteProcess) return;
        
        // add EOL at the end
        if (!text.endsWith("\n")) text += "\n";

        try {
            this.sqliteProcess.stdin.write(text);
        } catch(err) {
            //
        }
    }

    private onStartError(err: Error) {
        this._started = false;
        this.csvParser.end();

        if (this.startCallback) {
            this.startCallback(err);
            this.startCallback = undefined;
        }
    }

    private onExit(code: number|null, signal: string|null) {
        this._ended = true;
        this.csvParser.end();
        if (!this._started) {
            if (this.startCallback) this.startCallback(new Error(this.errStr));
            return;
        }

        if (code === 0) {
            //
        } else if (code === 1 || signal) {
            if (this.writeCallback) this.writeCallback([], new Error(this.errStr));
        }

        if (this.endCallback) this.endCallback();
    }
    
    private onData(data: Object) {
        if (this.errStr) {
            return;
        }

        // console.log(data)
        //@ts-ignore
        let row: string[] = Object.values(data);

        if (row.length === 1 && row[0] === RESULT_SEPARATOR) {
            if (!this._started) {
                this._started = true;
            }

            if (this.writeCallback) this.writeCallback(this.rows);
            this.next();
            return;
        }
        
        this.rows.push(row);
    }

    private onError(data: string|Buffer) {
        if (!data) return;
        
        // Workaround for CentOS (and maybe other OS's) where the command throws an error at the start but everything works fine
        if (data.toString().match(/\: \/lib64\/libtinfo\.so\.[0-9]+: no version information available \(required by /)) return;

        this.errStr += data.toString();
        // last part of the error output
        if (this.errStr.endsWith("\n")) {
            // reformat the error message
            let match = this.errStr.match(/Error: near line [0-9]+:(?: near "(.+)":)? (.+)/);
            if (match) {
                let token = match[1];
                let rest = match[2];
                this.errStr = `${token? `near "${token}": `: ``}${rest}`;
            }

            //if (this.sqliteProcess) this.sqliteProcess.kill();
        }
    }

    private next() {
        this.rows = [];
        let execObj = this.execQueue.shift();
        if (execObj) {
            this._write(execObj.sql);
            this._write(`.print ${RESULT_SEPARATOR}${EOL}`);
            this.busy = true;
            this.writeCallback = execObj.callback;
        } else {
            this.busy = false;
        }
    }

    get ended(): boolean {
        return this._ended;
    }

    get started(): boolean {
        return this._started;
    }
}