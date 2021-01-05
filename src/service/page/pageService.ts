import { DatabaseType } from "@/common/constants";
import { MssqlPageService } from "./mssqlPageService";
import { MysqlPageSerivce } from "./mysqlPageSerivce";

export interface PageService {
    /**
     * build page sql
     * @param sql 
     * @param page 
     * @param pageSize 
     * @return paginationSql
     */
    build(sql: string, page: number, pageSize: number): string;

}

export abstract class AbstractPageSerivce implements PageService {
  
    public build(sql: string, page: number, pageSize: number): string {

        if (!sql) {
            throw new Error("Not support empty sql!");
        }

        if (!pageSize) {
            pageSize = 100;
        }

        let start = 0;
        if (page) {
            start = (page - 1) * pageSize;
        }

        return this.buildPageSql(sql, start, pageSize)
    }

    protected abstract buildPageSql(sql: string, start: number, limit: number): string;

}