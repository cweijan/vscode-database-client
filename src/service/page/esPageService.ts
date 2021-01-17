import { EsRequest } from "@/model/es/esRequest";
import { AbstractPageSerivce } from "./pageService";

export class EsPageService extends AbstractPageSerivce {
    protected buildPageSql(sql: string, start: number, limit: number): string {

        const req = EsRequest.parse(sql)
        const body = req.bodyObject();
        body.from = start;
        body.size = limit;
        req.setBody(body);
        return req.toQuery()
    }

}