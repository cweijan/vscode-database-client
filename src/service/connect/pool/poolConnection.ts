
export enum pcStatus {
    PEENDING, FREE, BUSY
}

export class IpoolConnection<T>  {
    public actual?: T;
    constructor(public id: number, public status: pcStatus) {

    }
}