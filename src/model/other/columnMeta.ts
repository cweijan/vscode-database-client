/**
 * column meta info
 */
export interface ColumnMeta {
    /**
     * column name.
     */
    name: string;
    /**
     * column type without length example: varcahr.
     */
    simpleType: string;
    /**
     * column type with length, example:varchar(255). 
     */
    type: string;
    /**
     * column comment.
     */
    comment: string;
    /**
     * indexed key.
     */
    key: string;
    /**
     * "YES" or  "NO" .
     */
    nullable: string;
    /**
     * man length or this column value.
     */
    maxLength: string;
    /**
     * default value or column.
     */
    defaultValue:any;
    /**
     * extra info, auto_increment
     */
    extra:any;
}