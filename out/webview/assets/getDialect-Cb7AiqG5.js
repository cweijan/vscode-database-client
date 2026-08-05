import{n as e}from"./constants-CRlXRqEU.js";import{g as t,m as n,n as r,r as i}from"./wrapper-CunEpPTM.js";import{t as a}from"./stringBuilder-Cw4U0MZU.js";var o=class{dropDatabase(e){return`DROP DATABASE ${e}`}truncateDatabase(e){return null}pingDataBase(e,t){return null}showMaterialViews(e,t){return``}showExternalTables(e){return`select foreign_table_name "name",foreign_server_name "server",foreign_server_catalog "server_db" from information_schema.foreign_tables where foreign_table_schema='${e}';`}showTableSource(e,t){return null}showIndex(e,t){return null}showForeignKeys(e,t){return null}showChecks(e,t){return null}showPartitions(e,t){return null}showActualPartitions(e,t){return null}showTriggers(e,t){return null}updateTable(e){return null}tableTemplate(e){return null}showViewSource(e,t,n){return null}viewTemplate(e){return null}materializedViewTemplate(){return this.viewTemplate(!0)}updateColumn(e,t){return null}updateColumnSql(e){return null}createIndex(e){return null}dropIndex(e,t){return null}triggerTemplate(e){return`CREATE TRIGGER trigger_name$1
[BEFORE/AFTER] INSERT ON ${e??`[table_name]$2`}
FOR EACH ROW BEGIN
    $3
END;`}dropTriggerTemplate(e,t){return`DROP TRIGGER ${e}`}showTriggerSource(e,t){return null}showEvents(e){return`SELECT EVENT_NAME "name" FROM information_schema.EVENTS where EVENT_SCHEMA='${e}' ORDER BY EVENT_NAME;`}eventTemplate(){return`CREATE EVENT event_name$1
ON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 HOUR
DO
BEGIN
    SELECT now()$2;
END;`}dropEventTemplate(e){return`DROP EVENT IF EXISTS ${e};`}showProcedures(e){return null}showProcedureSource(e,t){return null}procedureTemplate(){return null}showFunctions(e){return null}showFunctionSource(e,t,n){return null}functionTemplate(){return null}showSequences(e){return null}showCustomTypes(e){return null}showPackages(e){return null}showUsers(){return null}showDatabaseUsers(){return null}createUser(){return null}updateUser(e){return null}dropUser(e){return null}showRoles(){return null}showDatabaseRoles(){return null}createRole(){return null}updateRole(e){return null}dropRole(e){return`DROP ROLE ${e}`}grantRole(e){return null}showLogins(){return null}createLogin(){return null}updateLogin(e){return null}dropLogin(e){return null}showVersion(){return null}showCollations(){return null}showAllComments(){return null}showAllForeignKeys(){return null}showAllConstraints(){return null}kill(e){return null}processList(){return null}},s=class extends o{showVersion(){return`select version() server_version`}createIndex(e){let t=e.indexType||`btree`;return`CREATE INDEX ${e.column}_${new Date().getTime()}_index ON ${e.table} USING ${t} (${e.column})`}dropIndex(e,t){return`DROP INDEX ${t}`}showIndex(e,t){return`select name index_name,is_in_sorting_key indexdef  FROM system.columns WHERE database = '${e}' and table ='${t}' and indexdef=1`}kill(e){return`KILL QUERY WHERE query_id='${e.ID}'`}processList(){return`
    SELECT query_id AS "ID", user AS "User",
    current_database AS "DB",os_user AS "State",
    addSeconds(now(), elapsed) AS "Time",
    query AS "SQL"
    FROM system.processes p 
    ORDER BY elapsed desc`}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD COLUMN [column] [type]`}createUser(){return`CREATE USER [name] WITH PASSWORD 'password'`}updateColumn(e,t){let{name:n,type:r,comment:i,nullable:a,defaultValue:o}=t;return`-- change column type
ALTER TABLE ${e} 
    ALTER COLUMN ${n} TYPE ${r};
-- change column name
ALTER TABLE ${e}  
    RENAME COLUMN ${n} TO [newColumnName]`}updateColumnSql(e){let{columnName:t,columnType:n,newColumnName:i,comment:o,table:s,defaultValue:c,oldRow:l}=e;return new a(``,`
`).if(n!=l.type,`ALTER TABLE ${s} ALTER COLUMN ${t} TYPE ${n};`).if(c&&c!=l.defaultValue,`ALTER TABLE ${s} MODIFY COLUMN ${t} DEFAULT ${r(c,n)};`).if(o&&o!=l.comment,`ALTER TABLE ${s} MODIFY COLUMN ${t} COMMENT '${o}';`).if(t!=i,`ALTER TABLE ${s} RENAME COLUMN ${t} TO ${i};`).toString()}showUsers(){return`SELECT * FROM system.users`}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`ALTER TABLE ${t} MODIFY COMMENT '${i}';`),n&&t!=n&&(a+=`ALTER TABLE ${t} RENAME TO ${n};`),a}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='${e}' AND table_type='BASE TABLE';`}createDatabase(e){return`CREATE DATABASE $1`}showTableSource(e,t){return`SELECT create_table_query as "Create Table",name as table_name,'definition' as view_definition from system.tables WHERE database='${e}' and name='${t}'`}showViewSource(e,t){return`SELECT create_table_query as "Create View",name as table_name,'definition' as view_definition from system.tables WHERE database='${e}' and name='${t}'`}showProcedureSource(e,t){return`select number from system.numbers where 1=0`}showFunctionSource(e,t){return`select number from system.numbers where 1=0`}showTriggerSource(e,t){return`select number from system.numbers where 1=0`}showColumns(e,t){return`select name,type, null as maximum_length,default_expression as defaultValue,is_in_primary_key as key from system.columns c where database='${e}' and table='${t}' `}showProcedures(e){return`select number from system.numbers where 1=0`}showViews(e){return`select name ,engine as type from system.tables where database='${e}' and engine = 'View' ORDER BY name`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n}`}showTables(e){return`select name, engine as type from system.tables where database='${e}' and engine <> 'View' ORDER BY name`}showDatabases(){return`SELECT name as Database FROM system.databases where name not in ('information_schema','INFORMATION_SCHEMA') order by name ASC`}showSchemas(){return this.showDatabases()}tableTemplate(){return`CREATE TABLE table_name$1(  
    id UUID,
    create_time DATETIME,
    name$2 String
)
ENGINE = MergeTree()
ORDER BY (id)
PRIMARY KEY(id);`}viewTemplate(){return`CREATE VIEW $1
AS
SELECT * FROM $2`}procedureTemplate(){return`select number from system.numbers where 1=0`}functionTemplate(){return`CREATE FUNCTION [func_name] AS (a, b, c) -> a * b * c;`}showRoles(){return`SELECT name FROM system.roles ORDER BY name;`}createRole(){return`CREATE ROLE role_name$1;
-- Grant role privileges
GRANT role_name$1 TO role_name$2;`}updateRole(e){return`ALTER ROLE ${e} 
-- RENAME TO new_name
;`}grantRole(e){return`GRANT ${e} TO role_name$1;`}},c=class{constructor(e){this.param=e,this.afterTablePrefix=`ALTER TABLE "${e.table}"`,this.afterColumnPrefix=`${this.afterTablePrefix} ALTER COLUMN "${e.columnName}"`}genAlterSQL(){let{columnName:e,newColumnName:t}=this.param;return new a(``,`
`).append(this.changeTypePart()).append(this.notNullPart()).append(this.defaultPart()).append(this.otherPart()).append(this.commentPart()).if(e!=t,`${this.afterTablePrefix} RENAME COLUMN "${e}" TO "${t}";`).toString()}changeTypePart(){let{oldRow:e,columnType:t}=this.param;return e.type==t?``:`${this.afterColumnPrefix} TYPE ${t};`}notNullPart(){let{oldRow:e,isNotNull:t}=this.param;return e.isNotNull==t?``:`${this.afterColumnPrefix} ${t?`SET NOT NULL`:`DROP NOT NULL`};`}otherPart(){return null}defaultPart(){let{oldRow:e,defaultValue:t,columnType:i}=this.param;return e.defaultValue==t?``:`${this.afterColumnPrefix} ${n(t)?`DROP DEFAULT`:`SET DEFAULT ${r(t,i)}`};`}commentPart(){return``}},l=class extends o{showVersion(){return``}createIndex(e){return`ALTER TABLE ${e.table} ADD ${e.type||`key`} ("${e.column||`[column]`}")`}dropIndex(e,t){return`DROP INDEX "${t}"`}addColumn(e,t){return`ALTER TABLE ${e}
    ADD COLUMN [column] [type] COMMENT ''${t?` AFTER "${t}"`:``};`}createUser(){return`CREATE USER 'username'@'%' IDENTIFIED BY 'password';
-- Grant select privilege to all databases;
GRANT SELECT ON *.* TO 'username'@'%' WITH GRANT OPTION;
-- Grant all privileges to all databases;
GRANT ALL PRIVILEGES ON *.* TO 'username'@'%' WITH GRANT OPTION;`}updateUser(e){return`update mysql.user set
    password = PASSWORD("newPassword")
    where User = '${e}';
FLUSH PRIVILEGES;
-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("newPassword")
`}updateColumn(e,t){let{name:n,type:r,comment:i,nullable:o,defaultValue:s,extra:c,character_set_name:l,collation_name:u}=t;return new a(`ALTER TABLE ${e}`).append(`\n\tCHANGE ${n} ${n} ${r}`).if(l,`CHARACTER SET ${l}`).if(u,`COLLATE ${u}`).if(o!=`YES`,`NOT NULL`).if(c?.toLowerCase()?.includes(`auto_increment`),`AUTO_INCREMENT`).if(i,`COMMENT '${i}'`).if(s,`DEFAULT ${s==`CURRENT_TIMESTAMP`?s:`'${s}'`}`).toString()}updateColumnSql(e){return new c(e).genAlterSQL()}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`COMMENT ON TABLE "${t}" IS '${i}';`),n&&t!=n&&(a+=`RENAME TABLE "${t}" TO "${n}";`),a}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE "',table_schema,'"."',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES where  table_schema ='${e}' and TABLE_TYPE<>'VIEW';`}createDatabase(e){return`CREATE DATABASE $1;`}showTableSource(e,t){return`SHOW CREATE TABLE ${e}.${t};`}showViewSource(e,t,n){return`SHOW CREATE VIEW database.${t};`}showColumns(e,t){return`SELECT COLUMN_NAME name,DATA_TYPE type, IS_NULLABLE nullable
            FROM information_schema.columns WHERE table_schema = '${e}' AND table_name = '${t}' ORDER BY ORDINAL_POSITION;`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}showTables(e,t=e){return`SELECT TABLE_NAME "name" FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${t}' and TABLE_TYPE<>'VIEW' ORDER BY TABLE_NAME;`}showViews(e,t=e){return`SELECT TABLE_NAME name FROM information_schema.VIEWS  WHERE TABLE_SCHEMA = '${t}' ORDER BY TABLE_NAME`}showDatabases(){return`SELECT SCHEMA_NAME as Database FROM information_schema.schemata ORDER BY Database;`}showSchemas(e){return`SELECT SCHEMA_NAME as schema FROM information_schema.schemata ORDER BY schema;`}tableTemplate(e){return`CREATE TABLE table_name$1(
    id int,
    create_time DATE,
    update_time DATE,
    content VARCHAR(255)
);`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM `}procedureTemplate(){return`CREATE PROCEDURE procedure_name$1()
BEGIN
    $2
END;`}functionTemplate(){return`CREATE FUNCTION function_name$1() RETURNS int
BEGIN
    $2
    return 0;
END;`}},u=class extends o{showDatabases(){return null}showSchemas(e){return null}showTables(e,t,n){return null}addColumn(e,t){return null}showColumns(e,t,n){return null}showViews(e,t){return null}buildPageSql(e,t,n){return null}createDatabase(e){return null}},d=class extends o{showVersion(){return`select RTRIM(SUBSTR(REPLACE(banner,'Oracle Database ',''),1,3)) "server_version" from v$version where rownum=1`}showAllForeignKeys(){return`SELECT 
    a.constraint_name AS "constraint_name",
    a.owner AS "table_schema",
    a.table_name AS "table_name",
    a.column_name AS "column_name",
    c.owner AS "referenced_schema",
    c.table_name AS "referenced_table",
    c.column_name AS "referenced_column"
FROM 
    ALL_CONS_COLUMNS a 
JOIN 
    ALL_CONSTRAINTS b ON a.owner = b.owner AND a.constraint_name = b.constraint_name
JOIN 
    ALL_CONS_COLUMNS c ON b.r_owner = c.owner AND b.r_constraint_name = c.constraint_name
WHERE 
    b.constraint_type = 'R'
    and a.owner not in ('SYS','APEX_040200')`}showAllConstraints(){return`SELECT 
        b.CONSTRAINT_NAME "constraint_name",
        c.CONSTRAINT_TYPE "constraint_type",
        b.owner "table_schema",
        b.table_name "table_name",
        b.COLUMN_NAME "column_name"
         FROM ALL_CONS_COLUMNS b 
          join ALL_CONSTRAINTS c on b.CONSTRAINT_NAME=c.CONSTRAINT_NAME 
          WHERE CONSTRAINT_TYPE='P'
          and b.owner not in ('SYS','APEX_040200')`}showAllComments(){return`SELECT 
        owner "table_schema",
        table_name "table_name",
        COLUMN_NAME "column_name",
        COMMENTS "comment"
         FROM all_col_comments WHERE COMMENTS is not null
         and owner not in ('SYS','APEX_040200')`}createIndex(e){let{table:t,column:n}=e;return`CREATE INDEX ${`${t}_${n}`} ON ${t}(${n})`}dropIndex(e,t){return`DROP INDEX ${t}`}showIndex(e,t){return`SELECT 
col.COLUMN_NAME "column_name",col.INDEX_NAME "index_name",idx.UNIQUENESS "uniqueness"
from ALL_IND_COLUMNS col
join ALL_INDEXES idx on col.index_name = idx.index_name
WHERE col.TABLE_OWNER='${e}'
     and col.TABLE_NAME='${t}';`}kill(e){let{SID:t,SERIAL:n}=e;return`ALTER SYSTEM KILL SESSION '${t},${n}' IMMEDIATE;`}processList(){return`SELECT 
        SID, SERIAL# as SERIAL,
        s.username "User", s.schemaname "Schema", 
        s.status "Status", 
        sql.sql_text SQL
        FROM v$session s,
             v$sql     sql
       WHERE sql.sql_id(+) = s.sql_id
         AND s.type     = 'USER'`}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD [column] [type];
COMMENT ON COLUMN ${e}.[column] IS 'comment'`}createUser(){return`CREATE USER $1 IDENTIFIED BY [password$2];
GRANT CONNECT TO $1;
ALTER USER $1 quota unlimited on USERS;
        `}updateUser(e){return`ALTER USER ${e} IDENTIFIED BY [new_password]`}updateColumn(e,t){let{name:n,type:r,comment:i,nullable:a,defaultValue:o}=t;return`-- change column type
ALTER TABLE ${e} MODIFY ${n} ${r};
-- change column name
ALTER TABLE ${e} RENAME COLUMN ${n} TO [newColumnName];
COMMENT ON COLUMN ${e}.${n} IS '${i||``}'`}updateColumnSql(e){let{columnName:t,columnType:n,newColumnName:r,comment:i,defaultValue:o,table:s,isNotNull:c,oldRow:l}=e;return new a(``,``).if(n!=l.type,`ALTER TABLE "${s}" MODIFY "${t}" ${n};`).if(c!=l.isNotNull,`\nALTER TABLE "${s}" MODIFY "${t}"${c?`NOT NULL`:`NULL`};`).if(o!=null&&o!=l.defaultValue,`\nALTER TABLE "${s}" MODIFY "${t}" DEFAULT ${o?.match(/(:|nextval)/i)?o:`'${o?.replace(/(^'|'$)/g,``)}'`};`).if(i&&i!=l.comment,`\nCOMMENT ON COLUMN "${s}"."${t}" is '${i}';`).if(t!=r,`\nALTER TABLE "${s}" RENAME COLUMN "${t}" TO "${r}";`).toString()}showUsers(){return`SELECT username "user" FROM all_users`}pingDataBase(e){return e?`ALTER SESSION SET current_schema = "${e}"`:null}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`COMMENT ON TABLE "${t}" IS '${i}';`),n&&t!=n&&(a+=`ALTER TABLE "${t}" RENAME TO "${n}"`),a}truncateDatabase(e){return`SELECT 'TRUNCATE TABLE "' || owner || '"."' || object_name || '";' trun FROM all_objects where  owner ='${e}' and object_type ='TABLE'`}createDatabase(e){return`CREATE USER $1 IDENTIFIED BY password$2;`}showViewSource(e,t,n){return n?`select QUERY "Create View" from ALL_MVIEWS where OWNER='${e}' and mview_name='${t}'`:`SELECT DBMS_METADATA.GET_DDL('VIEW', '${t}', '${e}') AS VIEW_DDL FROM DUAL;`}showProcedureSource(e,t){return`SELECT text "Create Procedure"
        FROM all_source
       WHERE owner = '${e}'
         AND name  = '${t}'
       ORDER BY line`}showFunctionSource(e,t){return`SELECT 'CREATE ' || LISTAGG(text) within group( order by line ) "source"
        FROM all_source
       WHERE owner = '${e}'
         AND name  = '${t}'
       ORDER BY line`}showTriggerSource(e,t){return`SELECT text
        FROM all_source
       WHERE owner = '${e}'
         AND name  = '${t}'
       ORDER BY line`}showColumns(e,t){return e?`select
        a.COLUMN_NAME "name",
        a.DATA_DEFAULT "defaultValue",
        a.DATA_PRECISION "precision",
        a.DATA_SCALE "scale",
        a.DATA_TYPE "type",
        COALESCE(a.DATA_PRECISION, a.data_length) "maximum_length",
        a.NULLABLE "nullable"
      from
        all_tab_columns a
      where
        a.owner = '${e}'
        and a.table_name = '${t}'`:`select
a.COLUMN_NAME "name",
a.DATA_DEFAULT "defaultValue",
a.DATA_PRECISION "precision",
a.DATA_SCALE "scale",
a.DATA_TYPE "type",
COALESCE(a.DATA_PRECISION, a.data_length) "maximum_length",
a.NULLABLE "nullable"
from
    user_tab_columns a
where
a.table_name = '${t}'`}showChecks(e,t){return`SELECT
        c.constraint_name "name",
        c.search_condition "clause"
    FROM
        all_constraints c
    WHERE
        c.owner = '${e}' and
        c.table_name = '${t}'
        AND c.constraint_type = 'C';`}showForeignKeys(e,t){let n=`select
        b.CONSTRAINT_NAME "constraint_name",
        b.COLUMN_NAME "column_name",
        c_pk.table_name "referenced_table",
        b_pk.COLUMN_NAME "referenced_column"
    from ALL_CONS_COLUMNS b
        join ALL_CONSTRAINTS c on b.owner=c.owner and b.CONSTRAINT_NAME = c.CONSTRAINT_NAME
        JOIN all_constraints c_pk ON c.r_owner = c_pk.owner AND c.r_constraint_name = c_pk.constraint_name
        join ALL_CONS_COLUMNS b_pk on b_pk.CONSTRAINT_NAME = c_pk.CONSTRAINT_NAME
    where
        b.owner = '${e}' and
        b.table_name = '${t}'
        and c.CONSTRAINT_TYPE = 'R';`;return e||(n=n.replace(/all_/gi,`USER_`).replace(`b.owner = 'undefined' and`,``)),n}showTriggers(e,t){return`SELECT TRIGGER_NAME "trigger_name",TABLE_NAME "table_name",TRIGGERING_EVENT "event" FROM all_triggers WHERE TABLE_OWNER='${e}' ${t?` AND TABLE_NAME='${t}'`:``} ORDER BY TRIGGER_NAME`}showPackages(e){return`SELECT 
                    object_name "name" ,
                    status "status"
                FROM 
                    ALL_OBJECTS 
                WHERE 
                    OBJECT_TYPE IN ('PACKAGE') 
                    AND owner='${e}' 
                ORDER BY 
                    "name"`}showProcedures(e){return`SELECT 
                    object_name "ROUTINE_NAME" ,
                    status "status"
                FROM 
                    all_objects 
                WHERE 
                    object_type = 'PROCEDURE' 
                    AND owner = '${e}' 
                ORDER BY 
                    "ROUTINE_NAME"`}showFunctions(e){return`SELECT 
                    object_name "ROUTINE_NAME" ,
                    status "status"
                FROM 
                    all_objects 
                WHERE 
                    object_type = 'FUNCTION' 
                    AND owner='${e}' 
                ORDER BY 
                    "ROUTINE_NAME"`}showViews(e,t){return`select object_type "type",object_name "name" from all_objects where object_type = 'VIEW' and owner='${t}' ORDER BY "type","name"`}showMaterialViews(e,t){return`select object_type "type",object_name "name" from all_objects where object_type = 'MATERIALIZED VIEW' and owner='${t}' ORDER BY "type","name"`}buildPageSql(e,t,n){return`SELECT * FROM ${t} WHERE ROWNUM <= ${n}`}showTables(e,t){return`select 
        o.object_name "name", nvl(t.num_rows, -1) "table_rows", 
        c.comments "comment", s.bytes "data_length"
        from all_objects o
        LEFT JOIN all_tables t on o.owner = t.owner and o.object_name = t.table_name
        LEFT JOIN all_tab_comments c on o.owner = c.owner and o.object_name = c.table_name
        LEFT JOIN USER_SEGMENTS s on o.object_name = s.segment_name
        where o.owner = '${t}' and o.object_type = 'TABLE' ORDER BY "name"`}showDatabases(){return`select username as "Database" from sys.all_users order by username`}showSchemas(){return`select username as "Database" from sys.all_users order by username`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id NUMBER GENERATED AS IDENTITY PRIMARY KEY,
    create_time DATE,
    name$2 VARCHAR2(255)
);
COMMENT ON TABLE table_name$1 IS '$3';
COMMENT ON COLUMN table_name$1.$2 IS '$4'`}viewTemplate(e){return`CREATE ${e?`MATERIALIZED `:``}VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`CREATE PROCEDURE proc_name$1(x IN OUT NUMBER, y OUT NUMBER)
IS
BEGIN
   $2
   y:=4 * x;
END;`}functionTemplate(){return`CREATE FUNCTION fun_name$1(x IN NUMBER) 
RETURN NUMBER 
IS
BEGIN 
    $2
    RETURN x*2;
END;`}showRoles(){return`SELECT role as name FROM dba_roles ORDER BY role;`}createRole(){return`CREATE ROLE role_name$1;
-- Grant role privileges
GRANT role_name$1 TO role_name$2;`}updateRole(e){return`ALTER ROLE ${e} 
-- NOT IDENTIFIED
-- IDENTIFIED BY password
-- IDENTIFIED EXTERNALLY
-- IDENTIFIED GLOBALLY
;`}grantRole(e){return`GRANT ${e} TO role_name$1;`}},f=class extends d{showVersion(){return`SELECT REPLACE(banner,'DM Database Server 64 ','') "server_version"  FROM v$version where rownum=1;`}createIndex(e){let{table:t,column:n=`$2`}=e;return`CREATE INDEX ${`${t}_${n}`} ON ${t}(${n});`}dropIndex(e,t){return`DROP INDEX ${t};`}showIndex(e,t){return`SELECT COLUMN_NAME "column_name",INDEX_NAME "index_name" from all_IND_COLUMNS WHERE TABLE_OWNER='${e}' and TABLE_NAME='${t}';`}processList(){return`SELECT SESS_ID,STATE,SQL_TEXT FROM v$sessions`}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD COLUMN $1 $2;
COMMENT ON COLUMN ${e}.$3 IS 'comment$4';`}createUser(){return`CREATE USER $1 IDENTIFIED BY [password]$2;`}updateUser(e){return`ALTER USER ${e} IDENTIFIED BY [new_password];`}updateColumn(e,t){let{name:n,type:r,comment:i,nullable:a,defaultValue:o}=t;return`-- change column type
ALTER TABLE ${e} MODIFY ${n} ${r};
-- change column name
ALTER TABLE ${e} RENAME COLUMN ${n} TO [newColumnName];
COMMENT ON COLUMN ${e}.${n} IS '${i||``}';`}updateColumnSql(e){let{columnName:t,columnType:n,newColumnName:r,comment:i,defaultValue:o,table:s,isNotNull:c,oldRow:l}=e;return new a(``,``).if(n!=l.type,`ALTER TABLE "${s}" MODIFY "${t}" ${n};`).if(c!=l.isNotNull,`\nALTER TABLE "${s}" MODIFY "${t}"${c?`NOT NULL`:`NULL`};`).if(o!=null&&o!=l.defaultValue,`\nALTER TABLE "${s}" MODIFY "${t}" DEFAULT ${o?.match(/(:|nextval)/i)?o:`'${o?.replace(/(^'|'$)/g,``)}'`};`).if(i&&i!=l.comment,`\nCOMMENT ON COLUMN "${s}"."${t}" is '${i}';`).if(t!=r,`\nALTER TABLE "${s}" RENAME COLUMN "${t}" TO "${r}";`).toString()}showUsers(){return`SELECT username "user" FROM all_users`}pingDataBase(e){return e?`set SCHEMA ${e}`:null}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`COMMENT ON TABLE "${t}" IS '${i}';`),n&&t!=n&&(a+=`ALTER TABLE "${t}" RENAME TO "${n}"`),a}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE \`',table_schema,'\`.\`',TABLE_NAME, '\`;') trun FROM INFORMATION_SCHEMA.TABLES where  table_schema ='${e}' and TABLE_TYPE<>'VIEW';`}createDatabase(e){return`CREATE USER [name] IDENTIFIED BY [password];`}showViewSource(e,t){return`CALL SP_VIEWDEF('${e}', '${t}');`}showProcedureSource(e,t){return`SELECT LISTAGG(text) within group(order by line) "Create Procedure"
        FROM all_source
       WHERE owner = '${e}'
         AND name  = '${t}'
       ORDER BY line`}showFunctionSource(e,t){return`select DBMS_METADATA.GET_DDL('FUNCTION', '${t}','${e}') "Create Function";`}showColumns(e,t){return`select
        a.COLUMN_NAME "name",
        a.DATA_DEFAULT "defaultValue",
        a.DATA_TYPE "type",
        a.DATA_PRECISION "precision",
        a.DATA_SCALE "scale",
        a.data_length "maximum_length",
        a.NULLABLE "nullable",
        c.CONSTRAINT_TYPE "key",
        cc.COMMENTS "comment",
        sc."INFO2" "extra"
      from
        all_tab_columns a
        left join all_col_comments cc on a.COLUMN_NAME=cc.COLUMN_NAME and a.OWNER=cc.SCHEMA_NAME and a.table_name=cc.table_name
        left join ALL_CONS_COLUMNS b on a.COLUMN_NAME=b.COLUMN_NAME and a.OWNER=b.OWNER and a.table_name=b.table_name
        left join all_CONSTRAINTS c on b.CONSTRAINT_NAME=c.CONSTRAINT_NAME
        left join sys.syscolumns sc on sc.id = (
            SELECT OBJECT_ID
                FROM all_objects t
                WHERE t.owner =a.OWNER
                AND t.object_name = a.table_name
                AND t.OBJECT_TYPE='TABLE'
        ) and sc."NAME"=a.COLUMN_NAME
      where
        a.owner = '${e}'
        and a.table_name = '${t}';`}showProcedures(e){return`select object_name "ROUTINE_NAME" from all_objects where object_type = 'PROCEDURE' and owner='${e}' ORDER BY "ROUTINE_NAME";`}showFunctions(e){return`select object_name "ROUTINE_NAME" from all_objects where object_type = 'FUNCTION' and owner='${e}' ORDER BY "ROUTINE_NAME";`}showViews(e){return`select object_name "name" from all_objects where object_type = 'VIEW' and owner='${e}';`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}kill(e){return`sp_close_session('${e.SESS_ID}');`}showTables(e,t){return`SELECT a.object_name "name",b.COMMENTS "comment"
FROM all_objects a
LEFT JOIN ALL_TAB_COMMENTS b on a.OWNER=b.OWNER and a.object_name=b.TABLE_NAME
where a.object_type = 'TABLE' and a.owner='${t}' and a.TEMPORARY<>'Y';`}showDatabases(){return`select object_name "Database" from all_objects where object_type = 'SCH';`}showSchemas(){return`select object_name "Database" from all_objects where object_type = 'SCH';`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id int NOT NULL PRIMARY KEY IDENTITY(1,1),
    create_time DATETIME,
    name$2 VARCHAR(255)
);
COMMENT ON TABLE $1 IS '$3';
COMMENT ON COLUMN $1.$2 IS '$4';`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`CREATE PROCEDURE proc_name$1(x IN OUT NUMBER, y OUT NUMBER)
IS
BEGIN
   $2
   y:=4 * x;
END;`}functionTemplate(){return`CREATE FUNCTION fun_name$1(x IN int) RETURN int$2
AS
BEGIN
    $3
    return x*2;
END;`}},p=class extends o{showVersion(){return`select @@version server_version;`}showAllForeignKeys(){return`SELECT 
        CONSTRAINT_NAME constraint_name,
        TABLE_SCHEMA table_schema,
        TABLE_NAME table_name,
        COLUMN_NAME column_name,
        REFERENCED_TABLE_SCHEMA referenced_schema,
        REFERENCED_TABLE_NAME referenced_table,
        REFERENCED_COLUMN_NAME referenced_column
         FROM information_schema.KEY_COLUMN_USAGE 
         WHERE REFERENCED_TABLE_NAME is not null`}createIndex(e){let t=`${e.type||`key`}`;return t.match(/BTREE/i)&&(t=`key`),`ALTER TABLE ${e.table} ADD ${t} (\`${e.column||`$1`}\`)`}dropIndex(e,t){return`ALTER TABLE ${e} DROP INDEX \`${t}\``}showIndex(e,t){return`SELECT column_name "column_name",index_name "index_name",index_type "index_type",non_unique=0 "isUnique" FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema='${e}' and table_name='${t}'
        ORDER BY index_name, SEQ_IN_INDEX;`}kill(e){return`KILL ${e?.ID};`}processList(){return"SELECT ID, USER User, DB, COMMAND Command, STATE State, TIME Time, INFO `SQL`\nFROM information_schema.PROCESSLIST;"}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD COLUMN $1 [type]$2 COMMENT '$3'${t?` AFTER \`${t}\``:``};`}createUser(){return`CREATE USER '$1'@'%' IDENTIFIED BY 'password$2';
-- Grant select privilege to all databases;
GRANT SELECT ON *.* TO '$1'@'%' WITH GRANT OPTION;
-- Grant all privileges to all databases;
GRANT ALL PRIVILEGES ON *.* TO '$1'@'%' WITH GRANT OPTION;`}updateUser(e){return`update mysql.user set 
    password = PASSWORD("newPassword")
    where User = '${e}';
FLUSH PRIVILEGES;
-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("newPassword")
`}updateColumn(e,t){let{nullable:n,extra:r}=t;return this.updateColumnSql({table:e,...t,isNotNull:n!=`YES`,isAutoIncrement:r?.toLowerCase()?.includes?.(`auto_increment`)})}updateColumnSql(e){let{table:t,tableMeta:i,name:o,columnName:s=o,type:c,unsigned:l,zerofill:u,useCurrentTimestamp:d,isNotNull:f,isAutoIncrement:p,comment:m,defaultValue:h,generation_expression:g,character_set_name:_,collation_name:v}=e,y=c?.match(/char|text|set|enum|blob|binary/i)&&i?.collation!=v;return new a(`ALTER TABLE \`${t}\``).append(`\n\tCHANGE \`${s}\` \`${o}\` ${c}`).if(l==`1`,`UNSIGNED`).if(u==`1`,`ZEROFILL`).if(d,`ON UPDATE CURRENT_TIMESTAMP`).if(y&&_,`CHARACTER SET ${_}`).if(y&&v,`COLLATE ${v}`).if(f,`NOT NULL`).if(p,`AUTO_INCREMENT`).if(g,`GENERATED ALWAYS AS ${g} STORED`).condition(!g,e=>e.if(n(h)&&!f,`DEFAULT NULL`).if(!n(h),`DEFAULT ${h==`CURRENT_TIMESTAMP`?h:`${r(h,c)}`}`)).if(m,`COMMENT '${m}'`).append(`;`).toString()}showCollations(){return`select DEFAULT_COLLATE_NAME "name",CHARACTER_SET_NAME "charset",DESCRIPTION "description" from information_schema.CHARACTER_SETS ORDER BY name;`}showChecks(e,t){return`SELECT
        tc.CONSTRAINT_NAME "name",
        cc.CHECK_CLAUSE "clause"
    FROM
        information_schema.CHECK_CONSTRAINTS AS cc,
        information_schema.TABLE_CONSTRAINTS AS tc
    WHERE
        tc.CONSTRAINT_SCHEMA = '${e}'
        AND tc.TABLE_NAME = '${t}'
        AND tc.CONSTRAINT_TYPE = 'CHECK'
        AND tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME;`}showUsers(){return`SELECT user user,host host FROM mysql.user;`}pingDataBase(e){return e?`use \`${e}\``:null}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i,collation:a,newCollation:o}=e,s=``;return i&&i!=r&&(s=`ALTER TABLE \`${t}\` COMMENT = '${i}';`),o&&o!=a&&(s+=`ALTER TABLE \`${t}\` collate = '${o}';`),n&&t!=n&&(s+=`ALTER TABLE \`${t}\` RENAME TO \`${n}\`;`),s}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE \`',table_schema,'\`.\`',TABLE_NAME, '\`;') trun FROM INFORMATION_SCHEMA.TABLES where  table_schema ='${e}' and TABLE_TYPE<>'VIEW';`}createDatabase(e){return`CREATE DATABASE $1
    DEFAULT CHARACTER SET = 'utf8mb4';`}showTableSource(e,t){return`SHOW CREATE TABLE \`${e}\`.\`${t}\`;`}showPartitions(e,t){return`SELECT 
PARTITION_NAME "name",PARTITION_METHOD "strategy",PARTITION_EXPRESSION "columnName",
PARTITION_DESCRIPTION "value",TABLE_ROWS "rows",DATA_LENGTH "length"
        FROM information_schema.partitions WHERE TABLE_SCHEMA='${e}' AND TABLE_NAME = '${t}' AND PARTITION_NAME IS NOT NULL`}showViewSource(e,t){return`SHOW CREATE VIEW  \`${e}\`.\`${t}\`;`}showProcedureSource(e,t){return`SHOW CREATE PROCEDURE \`${e}\`.\`${t}\`;`}showFunctionSource(e,t){return`SHOW CREATE FUNCTION \`${e}\`.\`${t}\`;`}showTriggerSource(e,t){return`SHOW CREATE TRIGGER \`${e}\`.\`${t}\`;`}showColumns(e,t){return`SELECT 
        c.COLUMN_NAME name,
        COLUMN_TYPE type,
        COLUMN_COMMENT comment,COLUMN_KEY \`key\`,IS_NULLABLE nullable,
        CHARACTER_MAXIMUM_LENGTH maximum_length,
        COLUMN_DEFAULT defaultValue,
        INSTR(COLUMN_TYPE,'zerofill')>0 "zerofill",
        INSTR(COLUMN_TYPE,'unsigned')>0 "unsigned",
        EXTRA extra,
        COLLATION_NAME collation_name,
        CHARACTER_SET_NAME character_set_name 
        FROM information_schema.columns c
        WHERE c.table_schema = '${e}' AND c.table_name = '${t}' 
        ORDER BY c.ORDINAL_POSITION;`}showForeignKeys(e,t){return`SELECT
        c.COLUMN_NAME column_name, ik.CONSTRAINT_NAME constraint_name,
        ik.REFERENCED_TABLE_NAME referenced_table, ik.REFERENCED_COLUMN_NAME referenced_column,
        UPDATE_RULE "updateRule",
        DELETE_RULE "deleteRule"
        FROM
        information_schema.columns c join information_schema.KEY_COLUMN_USAGE ik on c.table_schema = ik.TABLE_SCHEMA
        and c.table_name = ik.TABLE_NAME and c.COLUMN_NAME = ik.COLUMN_NAME
        JOIN information_schema.REFERENTIAL_CONSTRAINTS ir on ik.CONSTRAINT_NAME=ir.CONSTRAINT_NAME
        WHERE c.table_schema = '${e}' and c.table_name = '${t}' ORDER BY ik.CONSTRAINT_NAME;`}showTriggers(e,t){return`SELECT 
                    EVENT_OBJECT_TABLE table_name,
                    TRIGGER_NAME "trigger_name",
                    ACTION_TIMING timing,
                    EVENT_MANIPULATION event,
                    EVENT_MANIPULATION manipulation,
                    ACTION_ORIENTATION orientation,
                    ACTION_STATEMENT statement
                FROM 
                    information_schema.TRIGGERS 
                WHERE 
                    TRIGGER_SCHEMA = '${e}' 
                    ${t?` AND EVENT_OBJECT_TABLE='${t}'`:``} 
                ORDER BY 
                    TRIGGER_NAME;`}showProcedures(e){return`SELECT 
    r.ROUTINE_NAME "name",
    p.PARAMETER_NAME "param_name",
    p.DATA_TYPE "param_type",
    p.PARAMETER_MODE "param_mode"
FROM 
    information_schema.routines r
LEFT JOIN 
    information_schema.parameters p 
ON 
    r.SPECIFIC_NAME = p.SPECIFIC_NAME
WHERE
    r.ROUTINE_SCHEMA = '${e}'
    AND r.ROUTINE_TYPE = 'PROCEDURE'
ORDER BY 
    r.ROUTINE_NAME, p.ORDINAL_POSITION;`}showFunctions(e){return`SELECT 
        ROUTINE_NAME "name",
        p.PARAMETER_NAME "param_name",
        p.DATA_TYPE "param_type",
        p.PARAMETER_MODE "param_mode"
    FROM 
        information_schema.routines  r
    LEFT JOIN 
        information_schema.parameters p 
    ON 
        r.SPECIFIC_NAME = p.SPECIFIC_NAME
    WHERE 
        r.ROUTINE_SCHEMA = '${e}' 
        AND r.ROUTINE_TYPE = 'FUNCTION' 
    ORDER BY 
        r.ROUTINE_NAME;`}showViews(e){return`SELECT TABLE_NAME name,SECURITY_TYPE "view_group" FROM information_schema.VIEWS  WHERE TABLE_SCHEMA = '${e}' ORDER BY TABLE_NAME`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}showTables(e){return`SELECT TABLE_COMMENT "comment",TABLE_NAME "name",TABLE_ROWS "table_rows",\`AUTO_INCREMENT\` "auto_increment",
        row_format "row_format",DATA_LENGTH "data_length",INDEX_LENGTH "index_length",TABLE_COLLATION "collation",
        TABLE_TYPE "view_group",\`ENGINE\` engine
        FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${e}' and TABLE_TYPE<>'VIEW' ORDER BY TABLE_NAME;`}showDatabases(){return`show DATABASES`}showSchemas(){return this.showDatabases()}tableTemplate(){return`CREATE TABLE table_name$1(  
    id int NOT NULL PRIMARY KEY AUTO_INCREMENT COMMENT 'Primary Key',
    create_time DATETIME COMMENT 'Create Time',
    name$2 VARCHAR(255)
) COMMENT '$4';`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`CREATE PROCEDURE proc_name$1()
BEGIN
$2
END;`}functionTemplate(){return`CREATE FUNCTION fun_name$1() RETURNS int$2
READS SQL DATA
BEGIN
    $3
    return 0;
END;`}},m=class extends p{showVersion(){return`select replace(@@version,'-MariaDB','') server_version;`}},h=class extends u{showSchemas(e){return null}showVersion(){return`show version`}showDatabases(){return`show dbs`}buildPageSql(e,t,n){return`db('${e}').collection('${t}').find({}).limit(${n}).toArray()`}showIndex(e,t){return`db('${e}').collection('${t}').indexes();`}createIndex(e){let{database:t,table:n,column:r}=e;return`db('${t}').collection('${n}').createIndex({ ${r||`column_name`}: 1 });`}createDatabase(e){return`db("db_name").createCollection("collection")`}dropDatabase(e){return`db("${e}").dropDatabase()`}},g=class extends o{showVersion(){return`SELECT CAST(SERVERPROPERTY('ProductVersion') AS SYSNAME)+' '+CAST(SERVERPROPERTY('Edition') AS SYSNAME) AS server_version`}showAllForeignKeys(){return`SELECT 
    OBJECT_SCHEMA_NAME(fk.parent_object_id) AS table_schema,
    OBJECT_NAME(fk.parent_object_id) AS table_name,
    COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name,
    OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS referenced_schema,
    OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
    COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referenced_column
FROM 
    sys.foreign_keys fk
JOIN 
    sys.foreign_key_columns fc ON fk.object_id = fc.constraint_object_id`}showAllComments(){return`SELECT 
        s.name table_schema,
        t.name AS table_name,
        c2.name AS column_name,
        prop.value AS comment
        FROM 
           sys.columns c2 
                join sys.tables t on c2.object_id=t.object_id
                join sys.schemas s on t.schema_id=s.schema_id 
                join sys.extended_properties prop ON prop.major_id = c2.object_id AND prop.minor_id = c2.column_id`}createIndex(e){return`ALTER TABLE ${e.table} ADD ${e.type} (${e.column})`}dropIndex(e,t){return`DROP INDEX ${e}.${t}`}showIndex(e,t){return`SELECT
        index_name = ind.name,
        column_name = col.name,
        ind.is_primary_key "isPrimary",
        ind.is_unique "isUnique",
        ind.is_unique_constraint,
        CASE 
            WHEN ind.is_primary_key=1 THEN 'PRIMARY'
            WHEN ind.is_unique=1 THEN 'UNIQUE'
            WHEN ind.is_unique_constraint=1 THEN 'UNIQUE'
        ELSE 'INDEX' END index_type
      FROM
        sys.indexes ind
        INNER JOIN sys.index_columns ic ON ind.object_id = ic.object_id
        and ind.index_id = ic.index_id
        INNER JOIN sys.columns col ON ic.object_id = col.object_id
        and ic.column_id = col.column_id
        INNER JOIN sys.tables t ON ind.object_id = t.object_id
      WHERE
        t.name = '${t}';`}kill(e){return`kill ${e.ID};`}processList(){return`SELECT
    s.session_id "ID",
    s.login_name "User",
    s.program_name "Client",
    r.status "Status",
    r.wait_time "Wait Time",
    d.text "SQL"
FROM sys.dm_exec_sessions s
LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
Outer APPLY sys.dm_exec_sql_text(sql_handle) d
WHERE s.is_user_process = 1;`}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD $1 [type]$2;`}createUser(){return`CREATE LOGIN loginName$1 WITH PASSWORD = 'password$2';
-- user master[YourDatabaseName]
CREATE USER userName$3 FOR LOGIN loginName$1;
ALTER ROLE db_datareader ADD MEMBER userName$3;
ALTER ROLE db_datawriter ADD MEMBER userName$3;
-- ALTER ROLE db_ddladmin ADD MEMBER userName$3;`}updateColumn(e,t){let{name:n,type:r,comment:i,nullable:a,defaultValue:o}=t;return`-- change column type
ALTER TABLE ${e} 
    ALTER COLUMN ${n} ${r} ${a==`YES`?`NULL`:`NOT NULL`};
-- change column name
EXEC sp_rename '${e}.${n}', '${n}', 'COLUMN';`}updateColumnSql(e){let{columnName:t,columnType:i,defaultValue:o,newColumnName:s,comment:c,oldRow:l,isNotNull:u,schema:d,table:f}=e;return new a(`ALTER TABLE "${d}"."${f}" ALTER COLUMN "${t}" ${i} ${u?`NOT NULL`:`NULL`};`,`
`).if(l?.defaultValue&&l.defaultValue!=o,()=>`DECLARE @constraintName NVARCHAR(128)
         SELECT @constraintName = dc.name
         FROM sys.default_constraints dc
         JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
         WHERE c.object_id = OBJECT_ID('${d}.${f}')
         AND c.name = '${t}';
         IF @constraintName IS NOT NULL
         BEGIN
             EXEC('ALTER TABLE "${d}"."${f}" DROP CONSTRAINT ' + @constraintName);
         END;`).if(!n(o)&&l.defaultValue!=o,()=>`ALTER TABLE "${d}"."${f}" ADD CONSTRAINT DF_${f}_${t} DEFAULT ${r(o,i)} FOR "${t}";`).if(t!=s,()=>`EXEC sp_rename '${d}.${f}.${t}' , '${s}', 'COLUMN';`).if(c!=l.comment,()=>`EXEC ${l.comment?`sp_updateextendedproperty`:`sp_addextendedproperty`} 
@level0type = N'Schema', @level0name = '${d}',
@level1type = N'Table', @level1name = '${f}', 
@level2type = N'Column', @level2name = '${s}',
@name = N'MS_Description', @value = N'${c}';`).toString()}showDatabaseUsers(){return`SELECT name [user] from sys.database_principals WHERE type IN ('S', 'U', 'G','E') `}updateTable(e){let{schema:t,table:n,newTableName:r,comment:i,newComment:a}=e,o=``;return a&&a!=i&&(o=`EXEC ${i?`sp_updateextendedproperty`:`sp_addextendedproperty`} 
@level0type = N'Schema', @level0name = '${t}',
@level1type = N'Table', @level1name = '${n}', 
@name = N'MS_Description', @value = N'${a}';`),r&&n!=r&&(o+=`sp_rename '${n}', '${r}';`),o}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE [',table_schema,'].[',TABLE_NAME, '];') trun FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'  AND TABLE_SCHEMA='${e}'`}createDatabase(e){return`create database ${e||`[name]`}`}showViewSource(e,t){return`SELECT definition 'Create View' FROM sys.sql_modules WHERE object_id = OBJECT_ID('${e}.${t}');`}showProcedureSource(e,t){return`SELECT definition 'Create Procedure','${e}.${t}' "Procedure" FROM sys.sql_modules WHERE object_id = OBJECT_ID('${e}.${t}');`}showFunctionSource(e,t){return`SELECT definition 'Create Function','${e}.${t}' "Function" FROM sys.sql_modules WHERE object_id = OBJECT_ID('${e}.${t}');`}showTriggerSource(e,t){return`SELECT definition 'SQL Original Statement','${e}.${t}' "Trigger" FROM sys.sql_modules WHERE object_id = OBJECT_ID('${e}.${t}');`}showColumns(e,t){return[`information_schema`,`sys`].includes(e?.toLowerCase())?`SELECT
            name,
            type_name(system_type_id) "type",
            is_nullable nullable,
            max_length "maximum_length"
        FROM
            sys.all_columns
        WHERE
            object_id = OBJECT_ID('${e}.${t}') ;`:`SELECT 
               c.COLUMN_NAME "name",
               DATA_TYPE "type",
               numeric_precision "precision",
               numeric_scale "scale",
               IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH "maximum_length", COLUMN_DEFAULT "defaultValue", '' "comment", tc.constraint_type "key",
               COLUMNPROPERTY(object_id('${e}.${t}'), c.COLUMN_NAME, 'IsIdentity') extra
               FROM
               INFORMATION_SCHEMA.COLUMNS c
               left join  INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
               on c.COLUMN_NAME=ccu.column_name and c.table_name=ccu.table_name and ccu.TABLE_SCHEMA=c.TABLE_SCHEMA
               left join  INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
               on tc.constraint_name=ccu.constraint_name
               and tc.TABLE_SCHEMA=c.TABLE_SCHEMA and tc.table_name=c.table_name WHERE c.TABLE_SCHEMA = '${e}' AND c.table_name = '${t}' ORDER BY ORDINAL_POSITION`}showChecks(e,t){return`SELECT
        tc.CONSTRAINT_NAME "name",
        cc.CHECK_CLAUSE "clause"
    FROM
        "INFORMATION_SCHEMA"."CHECK_CONSTRAINTS" AS cc,
        "INFORMATION_SCHEMA"."TABLE_CONSTRAINTS" AS tc
    WHERE
        tc.CONSTRAINT_SCHEMA = '${e}'
        AND tc.TABLE_NAME = '${t}'
        AND tc.CONSTRAINT_TYPE = 'CHECK'
        AND tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME;`}showForeignKeys(e,t){return`SELECT
        f.name AS "constraint_name",
        COL_NAME( fkc.parent_object_id, fkc.parent_column_id ) AS "column_name",
        OBJECT_NAME (fkc.referenced_object_id) AS "referenced_table",
        COL_NAME( fkc.referenced_object_id, fkc.referenced_column_id )  AS "referenced_column",
        update_referential_action_desc "updateRule",
        delete_referential_action_desc "deleteRule"
    FROM
        sys.foreign_key_columns fkc
        JOIN sys.foreign_keys f ON f.object_id = fkc.constraint_object_id
        JOIN sys.tables tab1 ON tab1.object_id = fkc.parent_object_id and tab1.name='${t}' and SCHEMA_NAME(tab1.schema_id)='${e}'
    ;`}showTriggers(e,t){return`SELECT 
                tr.name AS trigger_name, 
                tb.name AS table_name,
                'Statement' AS orientation,
                OBJECT_DEFINITION(tr.object_id) AS source
            FROM 
                sys.triggers tr
                INNER JOIN sys.tables tb ON tr.parent_id = tb.object_id
                INNER JOIN sys.schemas sc ON tb.schema_id = sc.schema_id
            WHERE 
                tr.is_ms_shipped = 0
                AND sc.name = '${e}' ${t?` AND tb.name='${t}'`:``}`}showProcedures(e){return`SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE SPECIFIC_SCHEMA = '${e}' and ROUTINE_TYPE='PROCEDURE' ORDER BY ROUTINE_NAME`}showFunctions(e){return`SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE SPECIFIC_SCHEMA = '${e}' and ROUTINE_TYPE='FUNCTION' ORDER BY ROUTINE_NAME`}showViews(e,t){return`SELECT name FROM sys.all_views t where SCHEMA_NAME(t.schema_id)='${t}' order by name`}buildPageSql(e,t,n){return`SELECT TOP ${n} * FROM ${t};`}showTables(e,t){return`SELECT 
    t.name AS 'name', 
    ep.value AS 'comment', 
    t.is_ms_shipped AS 'isSystem',
    p.rows AS 'table_rows',
    SUM(a.total_pages) * 8 * 1024 AS 'data_length'
FROM 
    sys.tables t
    LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
    LEFT JOIN sys.indexes i ON t.object_id = i.object_id
    LEFT JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
    LEFT JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE
    t.schema_id = SCHEMA_ID('${t}')
GROUP BY 
    t.name, ep.value, t.is_ms_shipped, p.rows
ORDER BY 
    t.is_ms_shipped, t.name;`}showDatabases(){return`SELECT name 'Database' FROM sys.databases`}showSchemas(){return`SELECT SCHEMA_NAME [schema] FROM INFORMATION_SCHEMA.SCHEMATA`}tableTemplate(e){return`CREATE TABLE ${(e==`dbo`?``:`${e}.`)+`table_name`}$1(  
    id int IDENTITY(1,1) primary key,
    create_time DATETIME,
    update_time DATETIME,
    content$2 NVARCHAR(255)
);
EXECUTE sp_addextendedproperty N'MS_Description', '[table_comment]', N'user', N'dbo', N'table', N'[table_name]', NULL, NULL;
EXECUTE sp_addextendedproperty N'MS_Description', '[column_comment]', N'user', N'dbo', N'table', N'[table_name]', N'column', N'[column_name]';
`}viewTemplate(){return`CREATE VIEW dbo.view_name$1
AS
SELECT * FROM 
`}procedureTemplate(){return`CREATE PROCEDURE dbo.procedure_name$1
AS
BEGIN
    $2
END;`}functionTemplate(){return`CREATE FUNCTION dbo.function_name$1() RETURNS [TYPE]
BEGIN
    $2
    return [value];
END;`}triggerTemplate(e){return`CREATE TRIGGER trigger_name$1
ON ${e??`[table_name]$2`}
[FOR/AFTER] INSERT
AS
BEGIN
    $3
END;`}showRoles(){return`SELECT name FROM sys.server_principals WHERE type = 'R' ORDER BY name;`}showDatabaseRoles(){return`SELECT name FROM sys.database_principals WHERE type = 'R' ORDER BY name;`}createRole(){return`CREATE ROLE role_name$1;
-- Grant role privileges
GRANT role_name$1 TO role_name$2;`}updateRole(e){return`ALTER ROLE ${e} 
-- WITH NAME = new_name
;`}grantRole(e){return`ALTER ROLE ${e} ADD MEMBER role_name$1;`}showLogins(){return`SELECT name as login, type_desc, is_disabled, create_date, modify_date 
        FROM sys.server_principals 
        WHERE type IN ('S', 'U', 'G','E') 
        ORDER BY name;`}createLogin(){return`-- Create SQL Server login
CREATE LOGIN login_name$1 WITH PASSWORD = 'password$2';
-- Create Windows login
-- CREATE LOGIN [domainlogin_name$1] FROM WINDOWS;
-- Create login with additional options
-- CREATE LOGIN login_name$1 WITH PASSWORD = 'password$2', 
--     CHECK_POLICY = ON,
--     CHECK_EXPIRATION = ON,
--     DEFAULT_DATABASE = master,
--     DEFAULT_LANGUAGE = us_english;`}updateLogin(e){return`-- Change password
ALTER LOGIN ${e} WITH PASSWORD = 'new_password$1';
-- Disable/Enable login
-- ALTER LOGIN ${e} DISABLE;
-- ALTER LOGIN ${e} ENABLE;
-- Change default database
-- ALTER LOGIN ${e} WITH DEFAULT_DATABASE = database_name;
-- Change default language
-- ALTER LOGIN ${e} WITH DEFAULT_LANGUAGE = language;`}dropLogin(e){return`DROP LOGIN ${e};`}},_=class extends u{showVersion(){return`call dbms.components() yield name, versions, edition unwind versions as server_version return server_version;`}showDatabases(){return`SHOW DATABASES yield name AS Database`}showSchemas(){return this.showDatabases()}showTables(e){return`call db.labels() yield label as name RETURN name ORDER BY toLower(name)`}addColumn(e,t){return`MATCH (n:${e}) WHERE id(n) = 1 SET n.name = 'name' RETURN n`}showColumns(e,t){return`MATCH(n:\`${t}\`) UNWIND keys(n) AS name RETURN DISTINCT name`}showIndex(e,t){return`show indexes yield name as index_name, properties as column_name, type as index_type, labelsOrTypes where '${t}' in labelsOrTypes`}showViews(e){return`call db.relationshipTypes() yield relationshipType AS name RETURN name ORDER BY toLower(name)`}showUsers(){return`SHOW USERS`}createUser(){return`CREATE USER [name] IF NOT EXISTS 
    SET PASSWORD 'password';`}buildPageSql(e,t,n){return`MATCH (n${t==`*`?``:`:${t}`}) RETURN n LIMIT ${n}`}createDatabase(e){return`CREATE DATABASE $1`}tableTemplate(){return`CREATE (n:node {id:1}) return n;`}createIndex(e){return`CREATE INDEX FOR (n:${e.table}) ON (n.id)`}dropIndex(e,t){return`DROP INDEX \`${t}\``}viewTemplate(){return`MATCH (n1:node {id:1}), (n2:node {id:2}) CREATE (n1)-[r:TO]->(n2) RETURN type(r)`}},v=class extends c{defaultPart(){let{oldRow:e,isAutoIncrement:t,defaultValue:i,columnType:a}=this.param,o=i?.match?.(/\bnextval\b/);if(t&&!e.isAutoIncrement&&!o)return`${this.afterColumnPrefix} ADD GENERATED ALWAYS AS IDENTITY;`;if(!t&&e.isAutoIncrement&&!o)return`${this.afterColumnPrefix} DROP IDENTITY;`;if(!t&&e.isAutoIncrement&&o)return`${this.afterColumnPrefix} DROP DEFAULT;`;if(e.defaultValue==i)return``;let s=i?.match?.(/\bnextval\b/)?i:r(i,a);return`${this.afterColumnPrefix} ${n(i)?`DROP DEFAULT`:`SET DEFAULT ${s}`};`}commentPart(){let{oldRow:e,table:t,columnName:n,comment:r}=this.param;if(r!=e.comment)return`COMMENT ON COLUMN "${t}"."${n}" is '${r}';`}},y=class extends o{showVersion(){return`SHOW server_version;`}createIndex(e){let t=e.name??`${e.column||`[column]`}`,n=e.indexType||`btree`;return`CREATE INDEX ${t}_${new Date().getTime()}_index ON 
    ${e.table} USING ${n} ("${e.column||`[column]`}");`}dropIndex(e,t){return`DROP INDEX "${t}"`}showIndex(e,t){return`select
    t.relname as table_name,
    i.relname as index_name,
    a.attname as column_name,
    ix.indisprimary "isPrimary",
    ix.indisunique "isUnique",
    CASE ix.indisprimary
        WHEN true THEN 'PRIMARY'
    ELSE CASE ix.indisunique
        WHEN true THEN 'UNIQUE'
    ELSE 'KEY'
    END
    END AS index_type,
    am.amname index_method,
    pg_get_indexdef(ix.indexrelid) as index_definition
  from
    pg_class t
    JOIN pg_catalog.pg_namespace pgn ON pgn.oid=t.relnamespace and pgn.nspname='${e}'
    JOIN pg_index ix on t.oid = ix.indrelid
    JOIN pg_class i on ix.indexrelid = i.oid
    JOIN pg_am am ON am.oid=i.relam
    LEFT JOIN pg_attribute a on t.oid = a.attrelid and a.attnum = ANY(ix.indkey)
  where
     t.relkind = 'r'
    and t.relname = '${t}'
  order by
    ix.indexrelid;`}kill(e){return`SELECT pg_terminate_backend(${e.ID})`}processList(){return`SELECT
        a.pid AS "ID",
        query_start AS "Time",
        datname AS "db",
        CASE
        WHEN c.relname IS NOT NULL THEN c.relname
        ELSE l.virtualtransaction
        END AS "Target",
        l.mode AS "State",
        query AS "SQL"
      FROM
        pg_stat_activity a
        LEFT JOIN pg_locks l ON a.pid = l.pid
        LEFT JOIN pg_class c ON l.relation = c.oid
      ORDER BY
        a.pid ASC,
        c.relname ASC`}addColumn(e,t){return`ALTER TABLE ${e} 
  ADD COLUMN [column] [type];
COMMENT ON COLUMN ${e}.[column] IS 'comment';`}createUser(){return`CREATE USER $1 WITH PASSWORD 'password$2';
-- Grant select privilege;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $1;
-- Grant all privileges;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $1;`}updateUser(e){return`ALTER USER ${e} WITH PASSWORD 'new_password';`}updateColumn(e,t){let{name:n,type:r,comment:i,nullable:a,defaultValue:o}=t;return`-- change column type
ALTER TABLE ${e} 
    ALTER COLUMN ${n} TYPE ${r};
-- change column name
ALTER TABLE ${e} 
    RENAME COLUMN ${n} TO ${n};
-- Change column comment
COMMENT ON COLUMN ${e}.${n} IS '${i||`comment`}';`}updateColumnSql(e){return new v(e).genAlterSQL()}showUsers(){return`SELECT usename "user" from pg_user `}showAllForeignKeys(){return`SELECT
    c.conname AS constraint_name,
    sch.nspname AS table_schema,
    tbl.relname AS table_name,
    (col.attname) as column_name,
    f_tbl.relname AS referenced_table,
    (f_col.attname) as referenced_column,
    c.confupdtype AS "updateRule",
    c.confdeltype AS "deleteRule"
FROM pg_constraint c
LEFT JOIN LATERAL UNNEST(c.conkey)
    WITH ORDINALITY AS u(attnum, attposition)
    ON TRUE
LEFT JOIN LATERAL UNNEST(c.confkey)
    WITH ORDINALITY AS f_u(attnum, attposition)
    ON f_u.attposition = u.attposition
JOIN pg_class tbl ON tbl.oid = c.conrelid
JOIN pg_namespace sch ON sch.oid = tbl.relnamespace
LEFT JOIN pg_attribute col
    ON (col.attrelid = tbl.oid AND col.attnum = u.attnum)
LEFT JOIN pg_class f_tbl ON f_tbl.oid = c.confrelid
LEFT JOIN pg_namespace f_sch ON f_sch.oid = f_tbl.relnamespace
LEFT JOIN pg_attribute f_col
    ON (f_col.attrelid = f_tbl.oid AND f_col.attnum = f_u.attnum)
WHERE c.contype = 'f'`}showForeignKeys(e,t){return`SELECT
    c.conname AS constraint_name,
    (col.attname) as column_name,
    f_tbl.relname AS referenced_table,
    (f_col.attname) as referenced_column,
    c.confupdtype AS "updateRule",
    c.confdeltype AS "deleteRule"
FROM pg_constraint c
LEFT JOIN LATERAL UNNEST(c.conkey) WITH ORDINALITY AS u(attnum, attposition) ON TRUE
LEFT JOIN LATERAL UNNEST(c.confkey) WITH ORDINALITY AS f_u(attnum, attposition) ON f_u.attposition = u.attposition
JOIN pg_class tbl ON tbl.oid = c.conrelid
JOIN pg_namespace sch ON sch.oid = tbl.relnamespace
LEFT JOIN pg_attribute col ON (col.attrelid = tbl.oid AND col.attnum = u.attnum)
LEFT JOIN pg_class f_tbl ON f_tbl.oid = c.confrelid
LEFT JOIN pg_namespace f_sch ON f_sch.oid = f_tbl.relnamespace
LEFT JOIN pg_attribute f_col ON (f_col.attrelid = f_tbl.oid AND f_col.attnum = f_u.attnum)
WHERE c.contype = 'f' and sch.nspname = '${e}' and tbl.relname = '${t}'`}pingDataBase(e){return e?`set search_path to '${e}';`:null}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`COMMENT ON TABLE "${t}" IS '${i}';`),n&&t!=n&&(a+=`ALTER TABLE "${t}" RENAME TO "${n}";`),a}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='${e}' AND table_type='BASE TABLE';`}createDatabase(e){return`CREATE DATABASE $1`}showViewSource(e,t,n){return`select pg_get_viewdef('${e}.${t}' :: regclass) "Create View"`}showProcedureSource(e,t){return`select pg_get_functiondef('${e}.${t}' :: regproc) "Create Procedure",'${t}' "Procedure";`}showTriggerSource(e,t){return`select pg_get_triggerdef(oid) "SQL Original Statement",'${e}.${t}' "Trigger" from pg_trigger where tgname = '${t}';`}showColumns(e,t,n){return`SELECT 
          ${n?`c.*,`:``}
          c.COLUMN_NAME "name", 
          atttypid::regtype AS pg_reg_type,
          DATA_TYPE "type",
          IS_NULLABLE nullable, 
          numeric_precision "precision",
          numeric_scale "scale",
          CHARACTER_MAXIMUM_LENGTH "maximum_length", 
          COLUMN_DEFAULT "defaultValue", 
          pg_catalog.col_description(pgc.oid, c.ordinal_position::int) AS "comment",
          tc.constraint_type "key",
          tc.constraint_name "constraint_name",
          cc.table_name "referenced_table",
          cc.column_name "referenced_column",
          pa.*
        FROM information_schema.columns c
        JOIN pg_catalog.pg_class pgc ON c.table_name = pgc.relname 
        JOIN pg_catalog.pg_namespace pgn ON pgn.oid=pgc.relnamespace and pgn.nspname=c.table_schema
        JOIN pg_attribute pa on pa.attname =c.column_name and pa.attrelid =pgc.oid 
        LEFT JOIN information_schema.key_column_usage ccu on ccu.table_schema=c.table_schema
          and ccu.table_name=c.table_name and ccu.column_name=c.COLUMN_NAME
        LEFT JOIN information_schema.table_constraints tc on tc.table_schema=c.table_schema 
          and tc.table_name=c.table_name and tc.constraint_name=ccu.constraint_name
        LEFT JOIN information_schema.constraint_column_usage cc on cc.table_schema=c.table_schema 
          and cc.constraint_name=tc.constraint_name and  tc.constraint_type='FOREIGN KEY'
        WHERE c.TABLE_SCHEMA = '${e}' AND c.table_name = '${t}' 
        ORDER BY c.ORDINAL_POSITION;`}showChecks(e,t){return`SELECT
    tc.CONSTRAINT_NAME "name",
    cc.CHECK_CLAUSE "clause"
FROM
    "information_schema"."check_constraints" AS cc,
    "information_schema"."table_constraints" AS tc
WHERE
    tc.CONSTRAINT_SCHEMA = '${e}'
    AND tc.TABLE_NAME = '${t}'
    AND tc.CONSTRAINT_TYPE = 'CHECK'
    AND tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
    AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    AND cc.CONSTRAINT_NAME NOT LIKE '%\_not\_null'`}showPartitions(e,t){return`select col.column_name "columnName", pt.partition_strategy "strategy" from (
      select
          partrelid, partnatts, case partstrat when 'h' then 'HASH' when 'l' then 'LIST' when 'r' then 'RANGE' end as partition_strategy, unnest(partattrs) column_index
      from
          pg_partitioned_table ) pt
      join pg_class pc on pc.oid = pt.partrelid
      join information_schema.columns col on col.table_schema = pc.relnamespace :: regnamespace :: text
        and col.table_name = pc.relname and col.ordinal_position = pt.column_index
      WHERE col.table_schema='${e}' and col.table_name='${t}';`}showTriggers(e,t){return`SELECT 
              event_object_table table_name,
              trigger_name "trigger_name",
              action_timing timing,
              event_manipulation manipulation ,
              action_orientation orientation,
              action_statement "statement"
            FROM 
              information_schema.TRIGGERS 
            WHERE trigger_schema = '${e}' ${t?` AND event_object_table='${t}'`:``} 
            ORDER BY TRIGGER_NAME ASC`}showProcedures(e){return`SELECT p.proname "ROUTINE_NAME",
    pg_get_functiondef(p.oid) source,
    p.oid,
    pg_get_function_identity_arguments(p.oid) "argDefs"
from
    pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    and n.nspname = '${e}'
    and p.prokind = 'p'
order by p.proname`}showFunctions(e){return`SELECT DISTINCT
    r.ROUTINE_NAME AS "name",
    p.oid,
    pg_get_function_identity_arguments(p.oid) "argDefs",
    CASE 
        WHEN p.prorettype = 'pg_catalog.trigger'::regtype THEN 'Trigger'
        ELSE null
    END AS "function_type"
FROM 
    information_schema.routines r
    JOIN pg_proc p ON r.ROUTINE_NAME = p.proname 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    AND n.nspname = '${e}'
WHERE 
    r.ROUTINE_SCHEMA = '${e}' 
    AND r.ROUTINE_TYPE = 'FUNCTION' 
ORDER BY 
    r.ROUTINE_NAME ASC`}showFunctionSource(e,t,n){return n?`select pg_get_functiondef('${n}') "Create Function",'${t}' "Function";`:`select pg_get_functiondef('${e}.${t}' :: regproc) "Create Function",'${t}' "Function";`}showViews(e,t){return`select table_name "name" from information_schema.tables where table_schema='${t}' and table_type='VIEW' order by "name";`}showMaterialViews(e,t){return`SELECT matviewname "name" from pg_matviews WHERE schemaname='${t}' order by "name" ASC`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}showTables(e,t){return`SELECT t.table_name "name", 
    pg_catalog.obj_description(pgc.oid, 'pg_class') "comment",
    pgc.reltuples "table_rows",
    pg_total_relation_size(quote_ident(table_name)) AS "data_length"
FROM information_schema.tables t
JOIN pg_catalog.pg_class pgc ON t.table_name = pgc.relname 
JOIN pg_catalog.pg_namespace pgn ON pgn.oid=pgc.relnamespace and pgn.nspname=t.table_schema
WHERE t.table_type='BASE TABLE'
AND t.table_schema='${t}' order by t.table_name;`}showDatabases(){return`SELECT datname FROM pg_database WHERE datistemplate = false order by datname ASC;`}showSchemas(){return`SELECT nspname "schema" from pg_catalog.pg_namespace order by nspname ASC;`}showSequences(e){return`SELECT sequencename AS name, 
                   last_value AS sequence, 
                   increment_by AS increment
            FROM pg_sequences 
            WHERE schemaname='${e}' 
            ORDER BY name;`}showCustomTypes(e){return`SELECT  t.typname as name,typtype as type,string_agg(pg_enum.enumlabel, ',') enum_values
    FROM        pg_type t 
    LEFT JOIN   pg_enum ON pg_enum.enumtypid = t.oid
    LEFT JOIN   pg_catalog.pg_namespace n ON n.oid = t.typnamespace 
    WHERE (t.typrelid = 0 OR (SELECT c.relkind = 'c' FROM pg_catalog.pg_class c WHERE c.oid = t.typrelid)) 
    AND     NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type el WHERE el.oid = t.typelem AND el.typarray = t.oid)
    and n.nspname='${e}' GROUP BY name,type;`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id int NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    create_time DATE,
    name$2 VARCHAR(255)
);
COMMENT ON TABLE table_name$1 IS '$3';
COMMENT ON COLUMN table_name$1.name$2 IS '$4';`}viewTemplate(e){return`CREATE ${e?`MATERIALIZED `:``}VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`CREATE PROCEDURE proc_name$1()
LANGUAGE SQL
as $$
[$2]
$$;`}triggerTemplate(e){return`CREATE FUNCTION trigger_fun$1() RETURNS TRIGGER AS 
\\$body\\$
BEGIN
    $2
    RETURN [value];
END;
\\$body\\$ 
LANGUAGE plpgsql;

CREATE TRIGGER [name]$3
[BEFORE/AFTER] INSERT
ON ${e??`[table_name]$4`}
FOR EACH ROW
EXECUTE PROCEDURE [trigger_fun]();`}dropTriggerTemplate(e,t){return`DROP TRIGGER ${e} on ${t}`}functionTemplate(){return`CREATE FUNCTION fun_name$1() 
RETURNS int$2 AS $$
BEGIN
    $3
    return 0;
END;
$$ LANGUAGE plpgsql;`}showRoles(){return`SELECT rolname as name, rolsuper as is_superuser, rolcreaterole as can_create_role, 
            rolcreatedb as can_create_db, rolcanlogin as can_login, rolreplication as can_replicate
            FROM pg_roles ORDER BY rolname;`}createRole(){return`CREATE ROLE role_name$1 WITH LOGIN PASSWORD 'password$2';
-- Grant role privileges
GRANT role_name$1 TO postgres;`}updateRole(e){return`ALTER ROLE ${e} WITH 
-- LOGIN/NOLOGIN
-- PASSWORD 'new_password'
-- SUPERUSER/NOSUPERUSER
-- CREATEDB/NOCREATEDB
-- CREATEROLE/NOCREATEROLE
-- INHERIT/NOINHERIT
-- REPLICATION/NOREPLICATION
-- BYPASSRLS/NOBYPASSRLS
-- CONNECTION LIMIT connlimit
-- VALID UNTIL 'timestamp'
;`}grantRole(e){return`GRANT ${e} TO role_name$1;`}},b=class extends y{showAllForeignKeys(){return`SELECT
      refc.constraint_name "constraint_name",
      refc.constraint_schema "table_schema",
      kcu.table_name "table_name",
      kcu.column_name AS "column_name",
      ccu.table_name AS "referenced_table",
      ccu.column_name AS "referenced_column"
  FROM
      information_schema.referential_constraints AS refc,
      information_schema.key_column_usage AS kcu,
      information_schema.constraint_column_usage AS ccu
  WHERE
      refc.constraint_name = kcu.constraint_name
      AND refc.constraint_schema = kcu.table_schema
      AND ccu.constraint_name = refc.constraint_name;`}showForeignKeys(e,t){return`SELECT
      refc.constraint_name "constraint_name",
      kcu.column_name AS column_name,
      ccu.table_name AS referenced_table,
      ccu.column_name AS referenced_column,
      kcu.ordinal_position AS ord_position,
      refc.update_rule "updateRule",
      refc.delete_rule "deleteRule"
  FROM
      information_schema.referential_constraints AS refc,
      information_schema.key_column_usage AS kcu,
      information_schema.constraint_column_usage AS ccu
  WHERE
      refc.constraint_schema = '${e}'
      AND refc.constraint_name = kcu.constraint_name
      AND refc.constraint_schema = kcu.table_schema
      AND ccu.constraint_name = refc.constraint_name
      AND kcu.table_name = '${t}'
  ORDER BY ord_position;`}showProcedures(e){return`SELECT ROUTINE_NAME "ROUTINE_NAME" FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${e}' and ROUTINE_TYPE='PROCEDURE' ORDER BY ROUTINE_NAME ASC`}},x=class extends b{showVersion(){return`SELECT VERSION() as server_version`}createIndex(e){return null}processList(){return`SELECT
        a.pid AS "Id",
        a.usename AS "User",
        a.client_addr AS "Host",
        a.client_port AS "Port",
        datname AS "db",
        query AS "Command",
        l.mode AS "State",
        query_start AS "Time",
        CASE
          WHEN c.relname IS NOT NULL THEN 'Locked Object: ' || c.relname
          ELSE 'Locked Transaction: ' || l.virtualtransaction
        END AS "Info"
      FROM
        pg_stat_activity a
        LEFT JOIN pg_locks l ON a.pid = l.pid
        LEFT JOIN pg_class c ON l.relation = c.oid
      ORDER BY
        a.pid ASC,
        c.relname ASC`}addColumn(e,t){return`ALTER TABLE ${e}
  ADD COLUMN [column] [type];
COMMENT ON COLUMN ${e}.[column] IS 'comment';`}createUser(){return`CREATE USER [name] WITH PASSWORD 'password';`}updateUser(e){return`ALTER USER ${e} WITH PASSWORD 'new_password';`}updateColumn(e,t){let{name:n,type:r}=t;return`-- change column type
ALTER TABLE ${e}
    ALTER COLUMN ${n} TYPE ${r};
-- change column name
ALTER TABLE ${e}
    RENAME COLUMN ${n} TO ${n};`}updateColumnSql(e){return new v(e).genAlterSQL()}showUsers(){return`SELECT usename "user" from pg_user `}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`COMMENT ON TABLE "${t}" IS '${i}';`),n&&t!=n&&(a+=`ALTER TABLE "${t}" RENAME TO "${n}";`),a}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='${e}' AND table_type='BASE TABLE';`}createDatabase(e){return`CREATE DATABASE $1`}showTableSource(e,t){return`SHOW TABLE "${e}"."${t}"`}showViewSource(e,t){return`SHOW VIEW "${e}"."${t}"`}showProcedureSource(e,t){return`select pg_get_functiondef('${e}.${t}' :: regproc) "Create Procedure",'${t}' "Procedure";`}showFunctionSource(e,t){return`select pg_get_functiondef('${e}.${t}' :: regproc) "Create Function",'${t}' "Function";`}showTriggerSource(e,t){return`select pg_get_triggerdef(oid) "SQL Original Statement",'${e}.${t}' "Trigger" from pg_trigger where tgname = '${t}';`}showPartitions(e,t){return``}showIndex(e,t){return`select
    t.relname as table_name,
    i.relname as index_name,
    a.attname as column_name,
    ix.indisprimary "isPrimary",
    ix.indisunique "isUnique",
    CASE ix.indisprimary
        WHEN true THEN 'PRIMARY'
    ELSE CASE ix.indisunique
        WHEN true THEN 'UNIQUE'
    ELSE 'KEY'
    END
    END AS index_type,
    am.amname index_method
  from
    pg_class t
    join pg_catalog.pg_namespace pgn ON pgn.oid=t.relnamespace and pgn.nspname='${e}'
    join pg_index ix on t.oid = ix.indrelid
    join pg_class i on ix.indexrelid = i.oid
    JOIN pg_am am ON am.oid=i.relam
    LEFT JOIN pg_attribute a on t.oid = a.attrelid and a.attnum = ANY(string_to_array(textin(int2vectorout(ix.indkey)),' ')::int[])
  where
     t.relkind = 'r'
    and t.relname = '${t}'
  order by
    ix.indexrelid;`}showSequences(e){return`SELECT sequence_name name FROM information_schema.sequences WHERE sequence_schema = '${e}' ORDER BY sequence_name`}showTriggers(e,t){return`SELECT TRIGGER_NAME "trigger_name" FROM information_schema.TRIGGERS WHERE trigger_schema = '${e}' ${t?` AND event_object_table='${t}'`:``} ORDER BY TRIGGER_NAME ASC`}showProcedures(e){return`SELECT ROUTINE_NAME "ROUTINE_NAME" FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${e}' and ROUTINE_TYPE='PROCEDURE' ORDER BY ROUTINE_NAME ASC`}showFunctions(e){return`SELECT ROUTINE_NAME "ROUTINE_NAME" FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${e}' and ROUTINE_TYPE='FUNCTION' ORDER BY ROUTINE_NAME ASC `}showTables(e,t){return`  SELECT t.table_name "name", pg_catalog.obj_description(pgc.oid, 'pg_class') "comment",
    pg_total_relation_size(quote_ident(table_name)) AS "data_length"
FROM information_schema.tables t
JOIN pg_catalog.pg_class pgc ON t.table_name = pgc.relname
JOIN pg_catalog.pg_namespace pgn ON pgn.oid=pgc.relnamespace and pgn.nspname=t.table_schema
WHERE t.table_type='BASE TABLE'
AND t.table_schema='${t}' order by t.table_name;`}showSchemas(){return`SELECT nspname "schema" from pg_catalog.pg_namespace order by nspname ASC;`}tableTemplate(){return`CREATE TABLE table_name$1(
    id INT identity(1, 1) NOT NULL PRIMARY KEY,
    create_time DATE,
    update_time DATE,
    content$2 VARCHAR(255)
);
COMMENT ON TABLE table_name IS 'table_comment';
COMMENT ON COLUMN table_name.content IS 'content';`}procedureTemplate(){return`CREATE PROCEDURE procedure_name()
as $$
begin
    SELECT 1;
END;
$$ LANGUAGE plpgsql;`}functionTemplate(){return`CREATE FUNCTION function_name()
RETURNS int STABLE
AS $$
    SELECT 1
$$ LANGUAGE sql;`}},S=class extends o{showVersion(){return`select CURRENT_VERSION() as "server_version";`}createIndex(e){let t=`${e.type||`key`}`;return t.match(/BTREE/i)&&(t=`key`),`ALTER TABLE ${e.table} ADD ${t} (\`${e.column||`$1`}\`)`}dropIndex(e,t){return`ALTER TABLE ${e} DROP INDEX \`${t}\``}showIndex(e,t){return``}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD COLUMN $1 [type]$2 COMMENT '$3'${t?` AFTER \`${t}\``:``};`}createUser(){return`CREATE USER '$1'@'%' IDENTIFIED BY 'password$2';
-- Grant select privilege to all databases;
GRANT SELECT ON *.* TO '$1'@'%' WITH GRANT OPTION;
-- Grant all privileges to all databases;
GRANT ALL PRIVILEGES ON *.* TO '$1'@'%' WITH GRANT OPTION;`}updateColumn(e,r){let{name:i,type:o,comment:s,nullable:c,defaultValue:l,extra:u,character_set_name:d,collation_name:f}=r,p=c!=`YES`;return new a(`ALTER TABLE ${e}`).append(`\n\tCHANGE ${i} ${i} ${o}`).if(d,`CHARACTER SET ${d}`).if(f,`COLLATE ${f}`).if(p,`NOT NULL`).if(u?.toLowerCase()?.includes(`auto_increment`),`AUTO_INCREMENT`).if(s,`COMMENT '${s}'`).if(n(l)&&!p,`DEFAULT NULL`).if(!n(l),`DEFAULT ${l==`CURRENT_TIMESTAMP`?l:`'${t(l)}'`}`).toString()}updateColumnSql(e){let{table:t,columnName:n,newColumnName:r,columnType:i,isNotNull:o,isAutoIncrement:s,comment:c,defaultValue:l,oldRow:u}=e,d=`ALTER TABLE "${t}"`,f=o?`SET NOT NULL`:`DROP NOT NULL`;return new a(`${d} ALTER COLUMN "${n}" TYPE ${i};`,`
`).if(c&&c!=u.comment,`${d} ALTER COLUMN "${n}" COMMENT '${c}';`).if(o!=u.isNotNull,`${d} ALTER COLUMN "${n}" ${f};`).if(n!=r,`${d} RENAME COLUMN "${n}" TO "${r}";`).toString()}showCollations(){return``}showChecks(e,t){return``}pingDataBase(e,t){return e?`use "${t}"."${e}"`:`select 1`}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i,collation:a,newCollation:o}=e,s=``;return i&&i!=r&&(s=`ALTER TABLE \`${t}\` COMMENT = '${i}';`),o&&o!=a&&(s+=`ALTER TABLE \`${t}\` collate = '${o}';`),n&&t!=n&&(s+=`ALTER TABLE \`${t}\` RENAME TO \`${n}\`;`),s}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE \`',table_schema,'\`.\`',TABLE_NAME, '\`;') trun FROM INFORMATION_SCHEMA.TABLES where  table_schema ='${e}' and TABLE_TYPE<>'VIEW';`}createDatabase(e){return`CREATE DATABASE $1;`}showTableSource(e,t){return`select get_ddl('table', '${e}.${t}') "Create Table";`}showViewSource(e,t){return`select get_ddl('view', '${e}.${t}') "Create View";`}showProcedureSource(e,t){return`select get_ddl('PROCEDURE', '${e}.${t}()') "Create Procedure";`}showFunctionSource(e,t){return`select get_ddl('FUNCTION', '${e}.${t}()') "Create Function";`}showColumns(e,t){return`SELECT 
        c.COLUMN_NAME "name",
        DATA_TYPE "type",
        CHARACTER_MAXIMUM_LENGTH "maximum_length",
        IS_IDENTITY "key",
        COMMENT "comment",
        IS_NULLABLE "nullable",
        COLUMN_DEFAULT "defaultValue",
        COLLATION_NAME "$"
        FROM information_schema.columns c
        WHERE c.table_schema = '${e}' AND c.table_name = '${t}' 
        ORDER BY c.ORDINAL_POSITION;`}showProcedures(e){return`SELECT PROCEDURE_NAME ROUTINE_NAME FROM information_schema.PROCEDURES WHERE PROCEDURE_SCHEMA = '${e}' ORDER BY PROCEDURE_NAME`}showFunctions(e){return`SELECT FUNCTION_NAME ROUTINE_NAME FROM INFORMATION_SCHEMA.FUNCTIONS WHERE FUNCTION_SCHEMA='${e}' ORDER BY FUNCTION_NAME`}showViews(e,t){return`SELECT COMMENT "comment",TABLE_NAME "name",ROW_COUNT "table_rows"
        FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${t}' and TABLE_TYPE='VIEW' ORDER BY TABLE_NAME;`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}showTables(e,t){return`SELECT COMMENT "comment",TABLE_NAME "name",ROW_COUNT "table_rows"
        FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${t}' and TABLE_TYPE<>'VIEW' ORDER BY TABLE_NAME;`}showDatabases(){return`show databases;`}showSchemas(){return`SELECT SCHEMA_NAME "schema" FROM INFORMATION_SCHEMA.SCHEMATA;`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id int NOT NULL PRIMARY KEY AUTOINCREMENT,
    create_time DATE,
    name$2 VARCHAR(255)
);
COMMENT ON TABLE table_name$1 IS '$3';
COMMENT ON COLUMN table_name$1.name$2 IS '$4';`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`create procedure proc_name$1() returns string
language javascript
as $$
    $2return 1+1;
$$;`}functionTemplate(){return`CREATE FUNCTION fun_name$1() RETURNS int
AS
$$
    $2return 1;
$$`}showRoles(){return`SELECT ROLE_NAME FROM information_schema.applicable_roles ORDER BY ROLE_NAME;`}createRole(){return`CREATE ROLE role_name$1;
-- Grant role privileges
GRANT ROLE role_name$1 TO role role_name$2;`}updateRole(e){return`ALTER ROLE ${e} 
-- RENAME TO new_name
;`}grantRole(e){return`GRANT ROLE ${e} TO ROLE role_name$1;`}},C=class extends o{showDatabases(){return null}showSchemas(e){return null}createDatabase(e){return null}updateTable(e){let{table:t,newTableName:n}=e,r=``;return n&&t!=n&&(r+=`ALTER TABLE ${t} RENAME TO ${n};`),r}showVersion(){return`select sqlite_version() as server_version`}updateColumn(e,t){return null}updateColumnSql(e){return null}createIndex(e){let{table:t,column:n=`$2`}=e;return`CREATE INDEX ${`${t}_${n}`} ON ${t}(${n});`}showIndex(e,t){return`SELECT name index_name FROM sqlite_master WHERE type='index' and tbl_name='${t}' `}dropIndex(e,t){return`DROP INDEX ${t};`}showTables(e,t){return`SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY type ASC, name ASC;`}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD COLUMN $1 [type$2];`}showSequences(e){return`SELECT name,seq sequence FROM sqlite_sequence`}showColumns(e,t){return`SELECT t1.*,t1.pk "key",t1.dflt_value "defaultValue",t2."table" "referenced_table",t2."to" "referenced_column" FROM PRAGMA_TABLE_INFO('${t}') t1
        left join (
            SELECT * FROM  pragma_foreign_key_list('${t}')
        ) t2  on t1.name=t2.'from';`}showViews(e,t){return`SELECT name, type FROM sqlite_master WHERE type='view' AND name <> 'sqlite_sequence' AND name <> 'sqlite_stat1' ORDER BY type ASC, name ASC;`}showTriggers(e,t){return`SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ${t?` AND tbl_name='${t}'`:``} ORDER BY name ASC;`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}showTableSource(e,t){return`SELECT sql "Create Table" FROM sqlite_master where name='${t}' and type='table';`}showViewSource(e,t){return`SELECT sql "Create View" FROM sqlite_master where name='${t}' and type='view';`}showTriggerSource(e,t){return`SELECT sql FROM sqlite_master where name='${t}' and type='trigger';`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    content TEXT
);`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM $2`}},w=class extends C{showVersion(){return`SELECT library_version as server_version from pragma_version()`}pingDataBase(e,t){return e?`set schema '${e}';`:null}showDatabases(){return`SELECT DISTINCT catalog_name "Database" from information_schema.schemata ORDER BY catalog_name`}showSchemas(e){return`SELECT schema_name "schema" from information_schema.schemata WHERE catalog_name='${e}' ORDER BY schema_name`}showTables(e,t){return`SELECT table_name "name" FROM information_schema.tables
        WHERE table_type in ('BASE TABLE','LOCAL TEMPORARY') and table_catalog='${e}' and table_schema = '${t}' order by table_name`}showViews(e,t){return`
SELECT table_name "name",1 "view_group",null "source" FROM information_schema.tables
        WHERE table_type='VIEW' and table_catalog='${e}' and table_schema = '${t}'
        UNION all
SELECT viewname "name",2 "view_group",definition "source" FROM pg_catalog.pg_views
        WHERE schemaname = '${t}'
ORDER BY "view_group",name`}showSequences(e){return`SELECT sequence_name AS name, last_value AS sequence 
                FROM duckdb_sequences() 
                WHERE schema_name = '${e}'`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id INTEGER NOT NULL PRIMARY KEY,
    content TEXT
);`}showColumns(e,t){return[`system`,`temp`].includes(e)?`SELECT column_name "name", data_type "type",
        column_default "defaultValue", is_nullable "nullable"
        FROM information_schema.columns c
        WHERE c.table_schema = '${e}' AND c.table_name = '${t}' 
        ORDER BY c.ORDINAL_POSITION;`:`SELECT t1.*,t1.pk "key",t1.dflt_value "defaultValue" FROM PRAGMA_TABLE_INFO('${t}') t1;`}updateColumn(e,t){let{name:n,type:r}=t;return`-- change column type
ALTER TABLE ${e} 
    ALTER COLUMN ${n} TYPE ${r};
-- change column name
ALTER TABLE ${e} 
    RENAME COLUMN ${n} TO ${n};`}updateColumnSql(e){return new c(e).genAlterSQL()}},T=class extends l{showVersion(){return`select version() as server_version;`}showDatabases(){return`show databases`}showTables(e,t){return`show tables in ${e}`}showColumns(e,t){return`describe ${e}.${t};`}showViews(e,t){return`show views in ${e}`}},E=class extends l{showVersion(){return`SELECT node_version as server_version FROM system.runtime.nodes;`}pingDataBase(e){return e?`use ${e}`:null}showDatabases(){return`show catalogs`}},D=class extends l{showVersion(){return`select release_version from system.local;`}showUsers(){return`SELECT role as "user" FROM system_auth.roles;`}pingDataBase(e){return e?`use ${e}`:null}createDatabase(e){return`CREATE KEYSPACE $1
WITH REPLICATION = { 
    'class' : 'SimpleStrategy', 
    'replication_factor' : 1 
};`}dropDatabase(e){return`DROP KEYSPACE ${e}`}showDatabases(){return`select keyspace_name as "database" from system_schema.keyspaces;`}showTables(e,t){return`select table_name as "name" from system_schema.tables where keyspace_name='${e}'`}showColumns(e,t){return`select column_name as "name", type, kind as "key" 
                from system_schema.columns 
                where keyspace_name='${e}' 
                and table_name='${t}'`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id int PRIMARY key,
    create_time DATE,
    update_time DATE,
    content TEXT
);`}},O=class extends c{otherPart(){let{oldRow:e,isAutoIncrement:t}=this.param;return!e.isAutoIncrement&&t?`${this.afterColumnPrefix} SET GENERATED ALWAYS as identity;`:e.isAutoIncrement&&!t?`${this.afterColumnPrefix} DROP GENERATED;`:null}commentPart(){let{oldRow:e,table:t,columnName:n,comment:r}=this.param;if(r!=e.comment)return`COMMENT ON COLUMN "${t}"."${n}" is '${r}';`}changeTypePart(){let{oldRow:e,columnType:t}=this.param;return e.type==t?``:`${this.afterColumnPrefix} SET DATA TYPE ${t};`}},k=class extends l{showVersion(){return`SELECT SERVICE_LEVEL as "server_version" FROM SYSIBMADM.ENV_INST_INFO;`}showUsers(){return`SELECT GRANTEE "user" FROM syscat.dbauth WHERE GRANTEETYPE='U';`}pingDataBase(e){return e?`set SCHEMA ${e}`:null}showDatabases(){return`select schemaname "database" from syscat.schemata`}showTableSource(e,t){return null}showTables(e,t){return`select tabname "name", remarks "comment" from syscat.tables where tabschema='${t}' and TYPE='T' order by tabname`}showColumns(e,t){return`select COLUMN_NAME "name",
        DATA_TYPE "type",
        IS_NULLABLE "nullable",
        NUMERIC_PRECISION "precision",
        NUMERIC_SCALE "scale",
        CHARACTER_MAXIMUM_LENGTH "maximum_length",
        sc.length "number_length",
        COLUMN_DEFAULT "defaultValue",
        tc.TYPE "key",
        sc.remarks "comment",
        sc.IDENTITY "extra",
        r.REFTABNAME "referenced_table",
        trim(r.PK_COLNAMES) "referenced_column"
        from SYSIBM.columns c
        left join syscat.keycoluse kc
            on c.TABLE_SCHEMA=kc.TABSCHEMA and c.TABLE_NAME=kc.TABNAME  and c.COLUMN_NAME=kc.COLNAME
        left join SYSCAT.tabconst tc
            on c.TABLE_SCHEMA=tc.TABSCHEMA and c.TABLE_NAME=tc.TABNAME  and tc.CONSTNAME=kc.CONSTNAME
        left join sysibm.syscolumns sc
            on c.TABLE_SCHEMA=sc.TBCREATOR and c.TABLE_NAME=sc.TBNAME  and c.COLUMN_NAME=sc.NAME
        left join syscat.references r
            on c.TABLE_SCHEMA=r.TABSCHEMA and c.TABLE_NAME=r.TABNAME  and c.COLUMN_NAME=trim(r.FK_COLNAMES)
        where
            TABLE_SCHEMA = '${e}'
            and TABLE_NAME = '${t}'
        order by ORDINAL_POSITION;`}updateColumnSql(e){return new O(e).genAlterSQL()}showAllForeignKeys(){return`SELECT 
        CONSTNAME "constraint_name",
        TABSCHEMA "table_schema",
        TABNAME "table_name",
        FK_COLNAMES "column_name",
    REFTABNAME "referenced_table",
    PK_COLNAMES "referenced_column"
     FROM syscat.references`}showForeignKeys(e,t){return`SELECT 
        FK_COLNAMES "column_name",
        CONSTNAME "constraint_name",
        REFTABNAME "referenced_table",
        PK_COLNAMES "referenced_column",
        UPDATERULE "updateRule",
        DELETERULE "deleteRule"
         FROM syscat.references WHERE 
        TABSCHEMA='${e}' and TABNAME='${t}'`}showIndex(e,t){return`SELECT 
        COLNAMES "column_name",
        INDNAME "index_name",
        UNIQUERULE='U' "isUnique"
         FROM SYSCAT.INDEXES WHERE TABNAME = '${t}' AND TABSCHEMA = '${e}'`}showViews(e,t){return`select VIEWNAME "name",TEXT "source" from SYSCAT.VIEWS where VIEWSCHEMA = '${t}';`}showProcedures(e){return`select PROCNAME "routine_name",TEXT "source" from SYSCAT.procedures where PROCSCHEMA = '${e}' order by PROCNAME;`}showChecks(e,t){return`SELECT CONSTNAME "name",TEXT "clause" FROM SYSCAT.CHECKS WHERE TABNAME = '${t}' AND TABSCHEMA = '${e}';`}showTriggers(e,t){let n=`SELECT TRIGNAME "trigger_name",TEXT "source",TABNAME "table_name",TRIGEVENT "event" FROM syscat.triggers WHERE TABSCHEMA = '${e}'`;return t&&(n+=`AND TABNAME = '${t}'`),n}showFunctions(e){return`select FUNCNAME "routine_name",BODY "source" from SYSCAT.FUNCTIONS where FUNCSCHEMA = '${e}' order by FUNCNAME;`}dropIndex(e,t){return`DROP INDEX "${t}"`}createDatabase(e){return`CREATE SCHEMA ${e}$1;`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id INTEGER NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    create_time DATE,
    update_time DATE,
    content VARCHAR(255)
);`}processList(){return`SELECT session_auth_id,
        application_handle,
        elapsed_time_sec,
        activity_state,
        rows_read,
        stmt_text info
 FROM sysibmadm.mon_current_sql
 ORDER BY elapsed_time_sec DESC`}},A=class extends p{tableTemplate(){return`CREATE TABLE table_name(  
    id int NOT NULL  COMMENT 'Primary Key',
    create_time DATETIME COMMENT 'Create Time',
    name VARCHAR(255)
) 
AGGREGATE KEY(id,create_time,name)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1"
);`}showColumns(e,t){return`SELECT 
        c.COLUMN_NAME name,
        COLUMN_TYPE type,
        COLUMN_COMMENT comment,COLUMN_KEY \`key\`,IS_NULLABLE nullable,
        CHARACTER_MAXIMUM_LENGTH maximum_length,
        COLUMN_DEFAULT defaultValue,
        INSTR(COLUMN_TYPE,'zerofill')>0 "zerofill",
        INSTR(COLUMN_TYPE,'unsigned')>0 "unsigned",
        EXTRA extra,
        COLLATION_NAME collation_name,
        CHARACTER_SET_NAME character_set_name 
        FROM information_schema.columns c
        WHERE c.table_schema = '${e}' AND c.table_name = '${t}' 
        ORDER BY c.ORDINAL_POSITION;`}},j=class extends o{showVersion(){return`SELECT SERVER_VERSION();`}createIndex(e){let t=`${e.type||`key`}`;return t.match(/BTREE/i)&&(t=`key`),`ALTER TABLE ${e.table} ADD ${t} (\`${e.column||`$1`}\`)`}dropIndex(e,t){return`ALTER TABLE ${e} DROP INDEX \`${t}\``}showIndex(e,t){return`SELECT column_name "column_name",index_name "index_name",index_type "index_type",non_unique=0 "isUnique" FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema='${e}' and table_name='${t}';`}addColumn(e,t){return`ALTER TABLE ${e} 
    ADD COLUMN $1 [type]$2 COMMENT '$3'${t?` AFTER \`${t}\``:``};`}createUser(){return`CREATE USER '$1'@'%' IDENTIFIED BY 'password$2';
-- Grant select privilege to all databases;
GRANT SELECT ON *.* TO '$1'@'%' WITH GRANT OPTION;
-- Grant all privileges to all databases;
GRANT ALL PRIVILEGES ON *.* TO '$1'@'%' WITH GRANT OPTION;`}updateUser(e){return`update mysql.user set 
    password = PASSWORD("newPassword")
    where User = '${e}';
FLUSH PRIVILEGES;
-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("newPassword")`}updateColumn(e,t){let{nullable:n,extra:r}=t;return this.updateColumnSql({table:e,...t,isNotNull:n!=`YES`,isAutoIncrement:r?.toLowerCase()?.includes?.(`auto_increment`)})}updateColumnSql(e){let{table:t,name:o,columnName:s=o,type:c,unsigned:l,zerofill:u,useCurrentTimestamp:d,isNotNull:f,isAutoIncrement:p,comment:m,defaultValue:h,character_set_name:g,collation_name:_}=e,v=!i(c)&&!c?.match(/json/i);return new a(`ALTER TABLE \`${t}\``).append(`\n\tCHANGE \`${s}\` \`${o}\` ${c}`).if(l==`1`,`UNSIGNED`).if(u==`1`,`ZEROFILL`).if(d,`ON UPDATE CURRENT_TIMESTAMP`).if(v&&g,`CHARACTER SET ${g}`).if(v&&_,`COLLATE ${_}`).if(f,`NOT NULL`).if(p,`AUTO_INCREMENT`).if(m,`COMMENT '${m}'`).if(n(h)&&!f,`DEFAULT NULL`).if(!n(h),`DEFAULT ${h==`CURRENT_TIMESTAMP`?h:`${r(h,c)}`}`).append(`;`).toString()}showCollations(){return null}pingDataBase(e){return e?`use \`${e}\``:null}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i,collation:a,newCollation:o}=e,s=``;return i&&i!=r&&(s=`ALTER TABLE \`${t}\` COMMENT = '${i}';`),o&&o!=a&&(s+=`ALTER TABLE \`${t}\` collate = '${o}';`),n&&t!=n&&(s+=`ALTER TABLE \`${t}\` RENAME TO \`${n}\`;`),s}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE \`',table_schema,'\`.\`',TABLE_NAME, '\`;') trun FROM INFORMATION_SCHEMA.TABLES where  table_schema ='${e}' and TABLE_TYPE<>'VIEW';`}createDatabase(e){return`CREATE DATABASE $1;`}showTableSource(e,t){return`SHOW CREATE TABLE \`${e}\`.\`${t}\`;`}showPartitions(e,t){return`SELECT 
PARTITION_NAME "name",PARTITION_METHOD "strategy",PARTITION_EXPRESSION "columnName",
PARTITION_DESCRIPTION "value",TABLE_ROWS "rows",DATA_LENGTH "length"
        FROM information_schema.partitions WHERE TABLE_SCHEMA='${e}' AND TABLE_NAME = '${t}' AND PARTITION_NAME IS NOT NULL`}showViewSource(e,t){return`SHOW CREATE VIEW  \`${e}\`.\`${t}\`;`}showTriggerSource(e,t){return`SHOW CREATE TRIGGER \`${e}\`.\`${t}\`;`}showColumns(e,t){return`desc ${t}`}showForeignKeys(e,t){return`SELECT
        c.COLUMN_NAME column_name, ik.CONSTRAINT_NAME constraint_name,
        ik.REFERENCED_TABLE_NAME referenced_table, ik.REFERENCED_COLUMN_NAME referenced_column,
        UPDATE_RULE "updateRule",
        DELETE_RULE "deleteRule"
        FROM
        information_schema.columns c join information_schema.KEY_COLUMN_USAGE ik on c.table_schema = ik.TABLE_SCHEMA
        and c.table_name = ik.TABLE_NAME and c.COLUMN_NAME = ik.COLUMN_NAME
        JOIN information_schema.REFERENTIAL_CONSTRAINTS ir on ik.CONSTRAINT_NAME=ir.CONSTRAINT_NAME
        WHERE c.table_schema = '${e}' and c.table_name = '${t}' ORDER BY ik.CONSTRAINT_NAME;`}showViews(e){return`SELECT TABLE_NAME name,SECURITY_TYPE "view_group" FROM information_schema.VIEWS  WHERE TABLE_SCHEMA = '${e}' ORDER BY TABLE_NAME`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n};`}showTables(e){return`show ${e}.tables;`}showDatabases(){return`show databases`}showSchemas(){return this.showDatabases()}tableTemplate(e){return`CREATE TABLE table_name$1(  
    create_time timestamp,
    name$2 NCHAR(255)
);`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`CREATE PROCEDURE proc_name$1()
BEGIN
$2
END;`}functionTemplate(){return`CREATE FUNCTION fun_name$1() RETURNS int$2
READS SQL DATA
BEGIN
    $3
    return 0;
END;`}},M=class extends T{showVersion(){return``}},N=class extends l{showDatabases(){return`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME;`}showTables(e,t=e){return`SELECT table_name,ddl source FROM ${t}.INFORMATION_SCHEMA.TABLES  WHERE TABLE_SCHEMA = '${t}' and TABLE_TYPE<>'VIEW' ORDER BY TABLE_NAME;`}showTableSource(e,t){return`SELECT ddl source FROM ${e}.INFORMATION_SCHEMA.TABLES  WHERE TABLE_SCHEMA = '${e}' and table_name='${t}' ORDER BY TABLE_NAME;`}showColumns(e,t){return`SELECT COLUMN_NAME name,DATA_TYPE type, IS_NULLABLE nullable 
            FROM ${e}.INFORMATION_SCHEMA.COLUMNS WHERE table_schema = '${e}' AND table_name = '${t}' ORDER BY ORDINAL_POSITION;`}showViews(e,t=e){return`SELECT TABLE_NAME,view_definition source FROM ${t}.INFORMATION_SCHEMA.VIEWS  WHERE TABLE_SCHEMA = '${t}' ORDER BY TABLE_NAME`}tableTemplate(e){return`CREATE TABLE ${e}.table_name$1(  
    id INT64,
    create_time DATE,
    update_time DATE,
    content STRING
);`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM `}createDatabase(e){return`CREATE SCHEMA ${e}$1;`}},P=class extends k{showVersion(){return`SELECT SYSTEM_VALUE_NAME, CURRENT_CHARACTER_VALUE FROM QSYS2.SYSTEM_VALUE_INFO WHERE SYSTEM_VALUE_NAME IN ('QSRLNBR', 'QMODEL');`}showUsers(){return`SELECT AUTHORIZATION_NAME AS "user" FROM QSYS2.USER_INFO WHERE STATUS = 'ENABLED';`}pingDataBase(e){return e?`SET SCHEMA ${e}`:null}showDatabases(){return`SELECT SCHEMA_NAME AS "database" FROM QSYS2.SYSSCHEMAS;`}showTables(e,t){return`SELECT TABLE_NAME AS "name", TABLE_TEXT AS "comment" FROM QSYS2.SYSTABLES WHERE TABLE_SCHEMA='${t}' AND TABLE_TYPE='T' ORDER BY TABLE_NAME;`}showColumns(e,t){return`SELECT COLUMN_NAME AS "name",
                       DATA_TYPE AS "type",
                       IS_NULLABLE AS "nullable",
                       NUMERIC_PRECISION AS "precision",
                       NUMERIC_SCALE AS "scale",
                       CHARACTER_MAXIMUM_LENGTH AS "maximum_length",
                       COLUMN_DEFAULT AS "defaultValue",
                       COLUMN_TEXT AS "comment",
                       IDENTITY AS "extra"
                FROM QSYS2.SYSCOLUMNS
                WHERE TABLE_SCHEMA = '${e}'
                  AND TABLE_NAME = '${t}'
                ORDER BY ORDINAL_POSITION;`}showAllForeignKeys(){return`SELECT 
                    CONSTRAINT_NAME AS "constraint_name",
                    TABLE_SCHEMA AS "table_schema",
                    TABLE_NAME AS "table_name",
                    CONSTRAINT_KEYS AS "column_name",
                    SYSTEM_TABLE_NAME AS "referenced_table",
                    SYSTEM_CONSTRAINT_SCHEMA AS "referenced_column"
                FROM QSYS2.SYSCST
                WHERE CONSTRAINT_TYPE = 'FOREIGN KEY';`}showForeignKeys(e,t){return`SELECT 
                    CONSTRAINT_KEYS AS "column_name",
                    CONSTRAINT_NAME AS "constraint_name",
                    SYSTEM_TABLE_NAME AS "referenced_table",
                    SYSTEM_CONSTRAINT_SCHEMA AS "referenced_column"
                FROM QSYS2.SYSCST
                WHERE TABLE_SCHEMA='${e}' AND TABLE_NAME='${t}' AND CONSTRAINT_TYPE='FOREIGN KEY';`}showIndex(e,t){return`SELECT 
                    INDEX_NAME AS "index_name",
                    COLUMN_NAME AS "column_name",
                    CASE WHEN NON_UNIQUE = 0 THEN 'YES' ELSE 'NO' END AS "isUnique"
                FROM QSYS2.SYSINDEXES
                WHERE TABLE_NAME = '${t}' AND TABLE_SCHEMA = '${e}';`}showViews(e,t){return`SELECT VIEW_NAME AS "name", VIEW_DEFINITION AS "source" FROM QSYS2.SYSVIEWS WHERE TABLE_SCHEMA = '${t}';`}showProcedures(e){return`SELECT SPECIFIC_NAME AS "routine_name", ROUTINE_DEFINITION AS "source" FROM QSYS2.SYSROUTINES WHERE ROUTINE_SCHEMA = '${e}' ORDER BY SPECIFIC_NAME;`}showChecks(e,t){return`SELECT CONSTRAINT_NAME AS "name", CHECK_CLAUSE AS "clause" FROM QSYS2.SYSCST WHERE TABLE_NAME = '${t}' AND TABLE_SCHEMA = '${e}' AND CONSTRAINT_TYPE = 'CHECK';`}showTriggers(e,t){return`SELECT TRIGGER_NAME AS "trigger_name", ACTION_STATEMENT AS "source", EVENT_OBJECT_TABLE AS "table_name", EVENT_MANIPULATION AS "event" FROM QSYS2.SYSTRIGGERS WHERE EVENT_OBJECT_SCHEMA = '${e}'${t?` AND EVENT_OBJECT_TABLE = '${t}'`:``};`}showFunctions(e){return`SELECT SPECIFIC_NAME AS "routine_name", ROUTINE_DEFINITION AS "source" FROM QSYS2.SYSFUNCS WHERE FUNCTION_SCHEMA = '${e}' ORDER BY SPECIFIC_NAME;`}dropIndex(e,t){return`DROP INDEX ${e}.${t};`}processList(){return`SELECT JOB_NAME, 
                       AUTHORIZATION_NAME, 
                       TOTAL_CPU_TIME, 
                       TOTAL_DISK_IO_COUNT, 
                       TOTAL_MEMORY_USAGE 
                FROM QSYS2.ACTIVE_JOB_INFO 
                ORDER BY TOTAL_CPU_TIME DESC;`}},F=class extends p{showDatabases(){return`show databases`}showTables(e){return`show tables from ${e}`}showColumns(e,t){return`show columns from ${t}`}showViews(e){return`show views from ${e}`}showIndexes(e,t){return`show indexes from ${t}`}showFunctions(e){return`show functions from ${e}`}showProcedures(e){return`show procedures from ${e}`}showTriggers(e,t){return`show triggers from ${t}`}},I=class extends y{showVersion(){return`select replace(version(), 'KingbaseES ', '');`}triggerTemplate(e){return`CREATE TRIGGER trigger_name$1
[BEFORE/AFTER] INSERT ON ${e??`[table_name]$2`}
FOR EACH ROW BEGIN
    $3
END;`}},L=class extends C{showDatabases(){return`list`}showTables(e){return`SELECT name, type FROM sqlite_master 
                WHERE type='table' 
                AND name NOT LIKE '_cf%' 
                ORDER BY type ASC, name ASC;`}},R=class extends b{showVersion(){return`SELECT VERSION() as server_version`}createIndex(e){return null}processList(){return`SELECT
        a.pid AS "Id",
        a.usename AS "User",
        a.client_addr AS "Host",
        a.client_port AS "Port",
        datname AS "db",
        query AS "Command",
        l.mode AS "State",
        query_start AS "Time",
        CASE
          WHEN c.relname IS NOT NULL THEN 'Locked Object: ' || c.relname
          ELSE 'Locked Transaction: ' || l.virtualtransaction
        END AS "Info"
      FROM
        pg_stat_activity a
        LEFT JOIN pg_locks l ON a.pid = l.pid
        LEFT JOIN pg_class c ON l.relation = c.oid
      ORDER BY
        a.pid ASC,
        c.relname ASC`}addColumn(e,t){return`ALTER TABLE ${e}
  ADD COLUMN [column] [type];
COMMENT ON COLUMN ${e}.[column] IS 'comment';`}createUser(){return`CREATE USER [name] WITH PASSWORD 'password';`}updateUser(e){return`ALTER USER ${e} WITH PASSWORD 'new_password';`}updateColumn(e,t){let{name:n,type:r}=t;return`-- change column type
ALTER TABLE ${e}
    ALTER COLUMN ${n} TYPE ${r};
-- change column name
ALTER TABLE ${e}
    RENAME COLUMN ${n} TO ${n};`}updateColumnSql(e){return new v(e).genAlterSQL()}showUsers(){return`SELECT usename "user" from pg_user `}updateTable(e){let{table:t,newTableName:n,comment:r,newComment:i}=e,a=``;return i&&i!=r&&(a=`COMMENT ON TABLE "${t}" IS '${i}';`),n&&t!=n&&(a+=`ALTER TABLE "${t}" RENAME TO "${n}";`),a}truncateDatabase(e){return`SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='${e}' AND table_type='BASE TABLE';`}createDatabase(e){return`CREATE DATABASE $1`}showTableSource(e,t){return`SELECT pg_get_tabledef('${e}.${t}');`}showProcedureSource(e,t){return`select pg_get_functiondef('${e}.${t}' :: regproc) "Create Procedure",'${t}' "Procedure";`}showFunctionSource(e,t){return`select pg_get_functiondef('${e}.${t}' :: regproc) "Create Function",'${t}' "Function";`}showTriggerSource(e,t){return`select pg_get_triggerdef(oid) "SQL Original Statement",'${e}.${t}' "Trigger" from pg_trigger where tgname = '${t}';`}showPartitions(e,t){return``}showSequences(e){return`SELECT sequence_name name FROM information_schema.sequences WHERE sequence_schema = '${e}' ORDER BY sequence_name`}showTriggers(e,t){return`SELECT TRIGGER_NAME "trigger_name" FROM information_schema.TRIGGERS WHERE trigger_schema = '${e}' ${t?` AND event_object_table='${t}'`:``} ORDER BY TRIGGER_NAME ASC`}showProcedures(e){return` SELECT proname AS "ROUTINE_NAME",
       pg_catalog.pg_get_function_arguments(p.oid) AS "argDefs"
FROM pg_catalog.pg_proc p
     LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE pg_catalog.pg_function_is_visible(p.oid)
  AND n.nspname = '${e}'
  AND p.prokind = 'p'; `}showFunctions(e){return`SELECT proname AS name,
       pg_catalog.pg_get_function_result(p.oid) AS return_type,
       pg_catalog.pg_get_function_arguments(p.oid) AS "argDefs",
       CASE
           WHEN p.proisagg THEN 'agg'
           WHEN p.proiswindow THEN 'window'
           WHEN p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype THEN 'trigger'
           ELSE 'normal'
       END AS type
FROM pg_catalog.pg_proc p
     LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE pg_catalog.pg_function_is_visible(p.oid)
  AND n.nspname = '${e}'
  AND p.prokind = 'f';  `}showTables(e,t){return`SELECT t.table_name "name", pg_catalog.obj_description(pgc.oid, 'pg_class') "comment",
    pg_total_relation_size(quote_ident(table_name)) AS "data_length"
FROM information_schema.tables t
JOIN pg_catalog.pg_class pgc ON t.table_name = pgc.relname
JOIN pg_catalog.pg_namespace pgn ON pgn.oid=pgc.relnamespace and pgn.nspname=t.table_schema
WHERE t.table_type='BASE TABLE'
AND t.table_schema='${t}' order by t.table_name;`}showSchemas(){return`SELECT nspname "schema" from pg_catalog.pg_namespace order by nspname ASC;`}tableTemplate(){return`CREATE TABLE table_name$1(  
    id serial NOT NULL PRIMARY KEY,
    create_time DATE,
    name$2 VARCHAR(255)
);
COMMENT ON TABLE table_name$1 IS '$3';
COMMENT ON COLUMN table_name$1.name$2 IS '$4';`}procedureTemplate(){return`CREATE OR REPLACE PROCEDURE procedure_name()
AS
BEGIN
   SELECT 1;
END;`}functionTemplate(){return`CREATE FUNCTION function_name()
RETURNS int STABLE
AS $$
    SELECT 1
$$ LANGUAGE sql;`}},z=class extends l{showVersion(){return`select version() as server_version;`}showDatabases(){return`SHOW CATALOGS`}pingDataBase(e,t){return`USE ${e}`}showTables(e,t){return`SELECT table_name FROM information_schema.tables
   WHERE table_catalog = '${e}' and table_schema = '${t}' and TABLE_TYPE<>'VIEW' `}tableTemplate(){return`CREATE TABLE table_name$1(
    id LONG PRIMARY KEY,
    create_time DATE,
    update_time DATE,
    content STRING
);`}showColumns(e,t){return`SELECT c.COLUMN_NAME name,
c.DATA_TYPE type, c.IS_NULLABLE nullable,
CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'YES' ELSE 'NO' END AS key
    FROM information_schema.columns c
    LEFT JOIN 
        information_schema.key_column_usage kcu ON c.table_schema = kcu.table_schema
        AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name
    LEFT JOIN 
        information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema AND kcu.table_name = tc.table_name
    WHERE c.table_schema = '${e}' AND c.table_name = '${t}'
    ORDER BY c.ordinal_position;`}createDatabase(e){return`CREATE CATALOG $1${e};`}dropDatabase(e){return`DROP CATALOG ${e};`}},B=class extends b{showTables(e,t){return`SELECT t.table_name "name", pg_catalog.obj_description(pgc.oid, 'pg_class') "comment",pgc.reltuples "table_rows"
FROM information_schema.tables t
JOIN pg_catalog.pg_class pgc ON t.table_name = pgc.relname 
JOIN pg_catalog.pg_namespace pgn ON pgn.oid=pgc.relnamespace and pgn.nspname=t.table_schema
WHERE t.table_type='BASE TABLE'
AND t.table_schema='${t}' order by t.table_name;`}processList(){return`SELECT
            a.pid AS "ID",
            query_start AS "Time",
            datname AS "db",
            CASE
            WHEN c.relname IS NOT NULL THEN c.relname
            ELSE l.virtualtransaction
            END AS "Target",
            l.mode AS "State",
            query AS "SQL"
          FROM
            pg_stat_activity a
            LEFT JOIN pg_locks l ON a.pid = l.pid
            LEFT JOIN pg_class c ON l.relation = c.oid
          ORDER BY
            a.pid ASC,
            c.relname ASC`}},V=class extends l{showVersion(){return`SELECT PARAM_VALUE FROM EXA_METADATA WHERE PARAM_NAME = 'databaseProductVersion';`}showDatabases(){return`SELECT SCHEMA_NAME FROM EXA_SCHEMAS ORDER BY SCHEMA_NAME;`}showTables(e,t,n){return`SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = '${t}' ORDER BY TABLE_NAME;`}showViews(e,t){return`SELECT VIEW_NAME FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = '${t}' ORDER BY VIEW_NAME;`}pingDataBase(e){return e?`OPEN SCHEMA ${e};`:null}showColumns(e,t,n){return`SELECT 
            COLUMN_NAME as "name",
            COLUMN_TYPE as "type",
            COLUMN_IS_NULLABLE as "nullable",
            CASE WHEN COLUMN_IS_DISTRIBUTION_KEY = 'TRUE' THEN 'YES' ELSE 'NO' END as "key"
        FROM EXA_ALL_COLUMNS 
        WHERE COLUMN_SCHEMA = '${e}' 
        AND COLUMN_TABLE = '${t}'
        ORDER BY COLUMN_ORDINAL_POSITION;`}showTriggers(e,t){return`SELECT TRIGGER_NAME FROM SYS.EXA_ALL_TRIGGERS WHERE TRIGGER_SCHEMA = '${e}' ORDER BY TRIGGER_NAME;`}showProcedures(e){return``}showFunctions(e){return`SELECT FUNCTION_NAME FROM SYS.EXA_ALL_FUNCTIONS WHERE FUNCTION_SCHEMA = '${e}' ORDER BY FUNCTION_NAME;`}tableTemplate(){return`CREATE TABLE table_name (
    id INTEGER IDENTITY PRIMARY KEY,
    name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`}viewTemplate(){return`CREATE VIEW view_name$1
AS
SELECT * FROM $2`}procedureTemplate(){return`CREATE PROCEDURE procedure_name(IN param1 INTEGER)
AS
BEGIN
    -- Procedure logic here
END;`}functionTemplate(){return`CREATE FUNCTION function_name$1(param1 INTEGER)
RETURNS INTEGER AS
BEGIN
    $3
    -- Function logic here
    RETURN 0;
END;`}triggerTemplate(){return`CREATE TRIGGER trigger_name
BEFORE INSERT ON table_name
FOR EACH ROW
BEGIN
    -- Trigger logic here
END;`}showUsers(){return`SELECT USER_NAME "user" FROM SYS.EXA_ALL_USERS ORDER BY USER_NAME;`}userTemplate(){return`CREATE USER user_name IDENTIFIED BY 'password';`}truncateDatabase(e){return`SELECT 'TRUNCATE TABLE ' || TABLE_SCHEMA || '.' || TABLE_NAME || ';' 
        FROM SYS.EXA_ALL_TABLES 
        WHERE TABLE_SCHEMA = '${e}';`}createUser(){return`CREATE USER user_name IDENTIFIED BY 'password';`}updateUser(){return`ALTER USER user_name IDENTIFIED BY 'new_password';`}grantPrivileges(){return`GRANT privileges ON schema_name.* TO user_name;`}updateColumn(){return`ALTER TABLE table_name MODIFY column_name column_type;`}addColumn(){return`ALTER TABLE table_name ADD column_name column_type;`}buildPageSql(e,t,n){return`SELECT * FROM ${t} LIMIT ${n}`}countSql(e,t){return`SELECT COUNT(1) as count FROM ${t}`}updateTable(){return`ALTER TABLE old_table_name RENAME TO new_table_name`}showTableSource(e,t){return`SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, 
            CASE WHEN COLUMN_IS_NULLABLE = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable,
            COLUMN_COMMENT
        FROM SYS.EXA_ALL_COLUMNS 
        WHERE COLUMN_SCHEMA = '${e}' 
        AND COLUMN_TABLE = '${t}' 
        ORDER BY COLUMN_ORDINAL_POSITION`}showViewSource(e,t,n){return`SELECT VIEW_TEXT 
        FROM SYS.EXA_ALL_VIEWS 
        WHERE VIEW_SCHEMA = '${e}' 
        AND VIEW_NAME = '${t}'`}showProcedureSource(e,t){return`SELECT PROCEDURE_TEXT 
        FROM SYS.EXA_ALL_PROCEDURES 
        WHERE PROCEDURE_SCHEMA = '${e}' 
        AND PROCEDURE_NAME = '${t}'`}showFunctionSource(e,t){return`SELECT FUNCTION_TEXT 
        FROM SYS.EXA_ALL_FUNCTIONS 
        WHERE FUNCTION_SCHEMA = '${e}' 
        AND FUNCTION_NAME = '${t}'`}showTriggerSource(e,t){return`SELECT TRIGGER_TEXT 
        FROM SYS.EXA_ALL_TRIGGERS 
        WHERE TRIGGER_SCHEMA = '${e}' 
        AND TRIGGER_NAME = '${t}'`}processList(){return`SELECT SESSION_ID, USER_NAME, ACTIVITY, COMMAND_NAME, DURATION 
        FROM SYS.EXA_DBA_SESSIONS 
        WHERE STATUS = 'RUNNING'`}createDatabase(){return`CREATE SCHEMA $1`}};function H(t,n){switch(t||=e.MYSQL,t){case e.MYSQL:return n?new F:new p;case e.MARIA_DB:return new m;case e.DORIS:return new A;case e.MYSQL_COMPATIBLE:return new F;case e.KINGBASE:return new I;case e.COCKROACH:return new B;case e.PG:return n?new b:new y;case e.REDSHIFT:return new x;case e.GAUSS_DB:return new R;case e.SQLServer:return new g;case e.D1:return new L;case e.libSQL:case e.SQLITE:return new C;case e.DUCK_DB:return new w;case e.SNOWFLAKE:return new S;case e.CLICKHOUSE:return new s;case e.DM:return new f;case e.ORACLE:return new d;case e.CASSANDRA:return new D;case e.BIG_QUERY:return new N;case e.PRESTO:case e.TRINO:return new E;case e.HIVE:return new T;case e.DATABRICKS:return new z;case e.ATHENA:return new M;case e.DB2:return new k;case e.AS400:return new P;case e.MONGO_DB:return new h;case e.NEO4J:return new _;case e.TDengine:return new j;case e.EXASOL:return new V}return new l}export{H as t};