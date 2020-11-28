import { TypecastField } from 'mysql2/promise';
import * as sqlstring from 'sqlstring';

import { Table } from './interfaces/Table';
import { resolveType } from './resolveType';

// adapted from https://github.com/mysqljs/mysql/blob/master/lib/protocol/Parser.js
// changes:
// - cleaned up to use const/let + types
// - reduced duplication
// - made it return a string rather than an object/array
function parseGeometryValue(buffer: Buffer): string {
    let offset = 4;

    const geomConstructors = {
        1: 'POINT',
        2: 'LINESTRING',
        3: 'POLYGON',
        4: 'MULTIPOINT',
        5: 'MULTILINESTRING',
        6: 'MULTIPOLYGON',
        7: 'GEOMETRYCOLLECTION',
    };

    function readDouble(byteOrder: number): number {
        /* istanbul ignore next */ // ignore coverage for this line as it depends on internal db config
        const val = byteOrder
            ? buffer.readDoubleLE(offset)
            : buffer.readDoubleBE(offset);
        offset += 8;

        return val;
    }
    function readUInt32(byteOrder: number): number {
        /* istanbul ignore next */ // ignore coverage for this line as it depends on internal db config
        const val = byteOrder
            ? buffer.readUInt32LE(offset)
            : buffer.readUInt32BE(offset);
        offset += 4;

        return val;
    }

    // eslint-disable-next-line complexity
    function parseGeometry(): string {
        let result: Array<string> = [];

        const byteOrder = buffer.readUInt8(offset);
        offset += 1;

        const wkbType = readUInt32(byteOrder);

        switch (wkbType) {
            case 1: {
                // WKBPoint - POINT(1 1)
                const x = readDouble(byteOrder);
                const y = readDouble(byteOrder);
                result.push(`${x} ${y}`);
                break;
            }

            case 2: {
                // WKBLineString - LINESTRING(0 0,1 1,2 2)
                const numPoints = readUInt32(byteOrder);
                result = [];
                for (let i = numPoints; i > 0; i -= 1) {
                    const x = readDouble(byteOrder);
                    const y = readDouble(byteOrder);
                    result.push(`${x} ${y}`);
                }
                break;
            }

            case 3: {
                // WKBPolygon - POLYGON((0 0,10 0,10 10,0 10,0 0),(5 5,7 5,7 7,5 7, 5 5))
                const numRings = readUInt32(byteOrder);
                result = [];
                for (let i = numRings; i > 0; i -= 1) {
                    const numPoints = readUInt32(byteOrder);
                    const line: Array<string> = [];
                    for (let j = numPoints; j > 0; j -= 1) {
                        const x = readDouble(byteOrder);
                        const y = readDouble(byteOrder);
                        line.push(`${x} ${y}`);
                    }
                    result.push(`(${line.join(',')})`);
                }
                break;
            }

            case 4: // WKBMultiPoint
            case 5: // WKBMultiLineString
            case 6: // WKBMultiPolygon
            case 7: {
                // WKBGeometryCollection - GEOMETRYCOLLECTION(POINT(1 1),LINESTRING(0 0,1 1,2 2,3 3,4 4))
                const num = readUInt32(byteOrder);
                result = [];
                for (let i = num; i > 0; i -= 1) {
                    let geom = parseGeometry();
                    // remove the function name from the sub geometry declaration from the multi declaration
                    // eslint-disable-next-line default-case
                    switch (wkbType) {
                        case 4: // WKBMultiPoint
                            // multipoint = MULTIPOINT(\d+ \d+, \d+ \d+....)
                            geom = geom.replace(/POINT\((.+)\)/, '$1');
                            break;

                        case 5: // WKBMultiLineString
                            geom = geom.replace('LINESTRING', '');
                            break;

                        case 6: // WKBMultiPolygon
                            geom = geom.replace('POLYGON', '');
                            break;
                    }
                    result.push(geom);
                }
                break;
            } // this case shouldn't happen ever

            /* istanbul ignore next */ default:
                throw new Error(`Unexpected WKBGeometry Type: ${wkbType}`);
        }

        return `${geomConstructors[wkbType]}(${result.join(',')})`;
    }

    return `GeomFromText('${parseGeometry()}')`;
}

function intToBit(int: number): string {
    let bits = int.toString(2);
    while (bits.length < 8) {
        bits = `0${bits}`;
    }

    return bits;
}

/**
 * sql-formatter doesn't support hex/binary literals
 * so we wrap them in this fake function call which gets removed later
 */
function noformatWrap(str: string): string {
    return `NOFORMAT_WRAP("##${str}##")`;
}

const DBNULL = 'NULL';

function typeCast(tables: Array<Table>): (field: TypecastField) => string {
    const tablesByName = tables.reduce((acc, t) => {
        acc.set(t.name, t);

        return acc;
    }, new Map<string, Table>());

    // eslint-disable-next-line complexity
    return (field: TypecastField) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const table = tablesByName.get(field.table)!;
        const columnType = resolveType(table.columns[field.name].type);

        let value: string | null = ''; // the else case shouldn't happen ever
        /* istanbul ignore else */ if (columnType === 'GEOMETRY') {
            // parse and convert the binary representation to a nice string
            const buf = field.buffer();
            if (buf == null) {
                value = null;
            } else {
                value = parseGeometryValue(buf);
            }
        } else if (columnType === 'STRING') {
            // sanitize the string types
            value = sqlstring.escape(field.string());
        } else if (columnType === 'BIT') {
            // bit fields have a binary representation we have to deal with
            const buf = field.buffer();

            if (buf == null) {
                value = null;
            } else {
                // represent a binary literal (b'010101')
                const numBytes = buf.length;
                let bitString = '';
                for (let i = 0; i < numBytes; i += 1) {
                    const int8 = buf.readUInt8(i);
                    bitString += intToBit(int8);
                }

                // truncate the bit string to the field length
                bitString = bitString.substr(-field.length);

                value = noformatWrap(`b'${bitString}'`);
            }
        } else if (columnType === 'HEX') {
            // binary blobs
            const buf = field.buffer();

            if (buf == null) {
                value = null;
            } else {
                // represent a hex literal (X'AF12')
                const numBytes = buf.length;
                let hexString = '';
                for (let i = 0; i < numBytes; i += 1) {
                    const int8 = buf.readUInt8(i);
                    const hex = int8.toString(16);
                    if (hex.length < 2) {
                        hexString += '0';
                    }
                    hexString += hex;
                }

                value = noformatWrap(`X'${hexString}'`);
            }
        } else if (columnType === 'NUMBER') {
            value = field.string();
        } else {
            throw new Error(`Unknown column type detected: ${columnType}`);
        }

        // handle nulls
        if (value == null) {
            value = DBNULL;
        }

        return value;
    };
}

export { typeCast };
