import * as child_process from 'child_process';
import { StreamParser } from './streamParser';
import { ResultSetParser } from './resultSetParser';
import { ResultSet } from './common';
import { EOL } from 'os';

export function execute(sqliteCommand: string, dbPath: string, query: string, callback: (resultSet?: ResultSet, error?: Error) => void) {
    let resultSet: ResultSet;
    let errorMessage = "";
    let streamParser = new StreamParser(new ResultSetParser());

    let args = [
        //dbPath,
        `-header`, // print the headers before the result rows
        `-nullvalue`, `NULL`, // print NULL for null values
        //`-echo`, // print the statement before the result
        `-cmd`, `.mode tcl`
        ];

    let proc = child_process.spawn(sqliteCommand, args, {stdio: ['pipe', "pipe", "pipe" ]});
    // these next lines are written in the stdin to avoid errors when using unicode characters (see issues #32, #37)
    proc.stdin.write(`.open '${dbPath}'${EOL}`);
    proc.stdin.write(`.echo on${EOL}`);
    proc.stdin.end(query);
    
    proc.stdout.pipe(streamParser).once('done', (data: ResultSet) => {
        resultSet = data;
    });
    
    proc.stderr.on('data', (data) => {
        errorMessage += data.toString().trim();
    });

    proc.once('error', (data) => {
        errorMessage += data;
    });

    proc.once('close', () => {
        let error = errorMessage? Error(errorMessage) : undefined;
        callback(resultSet, error);
    });
}