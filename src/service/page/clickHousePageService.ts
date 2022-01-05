import { AbstractPageSerivce } from "./pageService";

export class ClickHousePageService extends AbstractPageSerivce {
  protected buildPageSql(sql: string, start: number, limit: number): string {
    const paginationSql = `LIMIT ${limit} OFFSET ${start}`;
    if (sql.match(/\blimit\b/i)) {
      return sql.replace(/\blimit\b.+/gi, paginationSql);
    }

    return `${sql} ${paginationSql}`;
  }
}
