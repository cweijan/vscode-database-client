/**
 * avoid run send after date on query result.
 */
export class Trans {
    public static transId: number;
    public static begin() {
        this.transId=new Date().getTime();
    }
}