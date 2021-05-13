import { Statement, StatementType } from "./interfaces/statement";

export function extractStatements(query: string): Statement[] {
    let statements: Statement[] = [];

    let statement: Statement|undefined;
    let isStmt = false;
    let isString = false;
    let isComment = false;
    let isCommand = false;
    let commentChar = '';
    let stringChar = '';

    let queryLines = query.split(/\r?\n/);
    for(let lineIndex=0; lineIndex<queryLines.length; lineIndex++) {
        let line = queryLines[lineIndex];
        for(let charIndex=0; charIndex<line.length; charIndex++) {
            let char = line[charIndex];
            let prevChar = charIndex>0? line[charIndex-1] : undefined;
            let nextChar = charIndex<line.length-1? line[charIndex+1] : undefined;

            if (isStmt) {
                if (statement) statement.sql += char;

                if (!isString && char === ';') {
                    isStmt = false;
                    if (statement) {
                        statement.position.end = [lineIndex, charIndex];
                        statements.push(statement);
                        statement = undefined;
                    }
                } else if (!isString && char === '\'') {
                    isString = true;
                    stringChar = '\'';
                } else if (!isString && char === '"') {
                    isString = true;
                    stringChar = '"';
                } else if (isString && char === stringChar) {
                    isString = false;
                    stringChar = '';
                }
            } else if (isComment && commentChar === '-') {
                // skip char
            } else if (isComment && commentChar === '/') {
                if (char === '/' && prevChar === '*') {
                    isComment = false;
                    commentChar = '';
                }
            } else if (isCommand) {
                if (statement) statement.sql += char;
            } else if (char === ' ' || char === '\t') {
                // skip this char
            } else if (char === '-' && nextChar === '-') {
                isComment = true;
                commentChar = '-';
            } else if (char === '/' && nextChar === '*') {
                isComment = true;
                commentChar = '/';
            } else if (char === '.') {
                isCommand = true;
                statement = {sql: char, position: {start: [lineIndex, charIndex], end: [lineIndex, charIndex]}, type: StatementType.COMMAND};
            } else if (char.match(/\w/)) {
                isStmt = true;
                statement = {sql: char, position: {start: [lineIndex, charIndex], end: [lineIndex, charIndex]}, type: StatementType.OTHER};
            } else {
                throw Error("Not a valid query");
            }
        }

        if (isCommand) {
            isCommand = false;
            if (statement) {
                statement.position.end = [lineIndex, line.length-1];
                statements.push(statement);
                statement = undefined;
            }
        }
        if (isComment && commentChar === '-') {
            isComment = false;
            commentChar = '';
        }
        if (isStmt) {
            if (statement) statement.sql += "\n";
        }
    }

    // if there is only one statement that does not end with ';'
    // we trim() and add ';' at the end
    // Note: this behaviour is mainly for the extension command sqlite.quickQuery
    if (statement && statements.length === 0) {
        statement.sql = statement.sql.trim() + ';';
        statements.push(statement);
    }

    statements.forEach(statement => statement.type = categorizeStatement(statement.sql) );

    return statements;
}

function categorizeStatement(sql: string): StatementType {
    let type: StatementType;

    sql = sql.toLowerCase();
    if (sql.startsWith(StatementType.SELECT.toLowerCase())) {
        type = StatementType.SELECT;
    } else if (sql.startsWith(StatementType.INSERT.toLowerCase())) {
        type = StatementType.INSERT;
    } else if (sql.startsWith(StatementType.UPDATE.toLowerCase())) {
        type = StatementType.UPDATE;
    } else if (sql.startsWith(StatementType.EXPLAIN.toLowerCase())) {
        type = StatementType.EXPLAIN;
    } else if (sql.startsWith(StatementType.PRAGMA.toLowerCase())) {
        type = StatementType.PRAGMA;
    } else if (sql.startsWith('.')) {
        type = StatementType.COMMAND;
    } else {
        type = StatementType.OTHER;
    }

    return type;
}