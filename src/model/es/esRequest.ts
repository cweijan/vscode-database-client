
export class EsRequest {

    constructor(public type: string, public path: string, public body: string) { }

    public toQuery():string{
        return `${this.type} ${this.path}\n${this.body}`
    }

    public bodyObject(): any {
        return JSON.parse(this.body)
    }

    public setBody(bodyObj: any) {
        this.body = JSON.stringify(bodyObj)
    }

    public static parse(request: string): EsRequest {

        const splitIndex = request.indexOf('\n')
        let [type, path] = (splitIndex == -1 ? request : request.substring(0, splitIndex)).split(' ')
        if (path?.charAt(0) != "/") {
            path = "/" + path
        }
        const body = splitIndex == -1 ? null : request.substring(splitIndex + 1) + "\n"

        return new EsRequest(type, path, body)
    }

}