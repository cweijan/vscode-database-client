const numberTypes = new Set([
    'integer',
    'int',
    'smallint',
    'tinyint',
    'mediumint',
    'bigint',
    'decimal',
    'numeric',
    'float',
    'double',
    'real',
]);
const stringTypes = new Set([
    'date',
    'datetime',
    'timestamp',
    'time',
    'year',
    'char',
    'varchar',
    'text',
    'mediumtext',
    'longtext',
    'tinytext',
    'set',
    'enum',
    'json',
]);
const bitTypes = new Set(['bit']);
const hexTypes = new Set([
    'blob',
    'tinyblob',
    'mediumblob',
    'longblob',
    'binary',
    'varbinary',
]);
const geometryTypes = new Set([
    'point',
    'linestring',
    'polygon',
    'multipoint',
    'multilinestring',
    'multipolygon',
    'geometrycollection',
]);

type ColumnTypes = 'STRING' | 'BIT' | 'HEX' | 'NUMBER' | 'GEOMETRY';
function resolveType(columnType: string): ColumnTypes {
    if (numberTypes.has(columnType)) {
        return 'NUMBER';
    }

    if (stringTypes.has(columnType)) {
        return 'STRING';
    }

    if (hexTypes.has(columnType)) {
        return 'HEX';
    }

    if (geometryTypes.has(columnType)) {
        return 'GEOMETRY';
    } // shouldn't ever happen

    /* istanbul ignore else */ if (bitTypes.has(columnType)) {
        return 'BIT';
    } // shouldn't ever happen

    /* istanbul ignore next */ throw new Error(`UNKNOWN TYPE "${columnType}"`);
}

export { ColumnTypes, resolveType };
