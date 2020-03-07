export class Util {
    /**
     * trim array, got from SO.
     * @param origin origin array
     * @param attr duplicate check attribute
     */
    static trim<T>(origin: T[], attr: string): T[] {
        let seen = new Set();
        return origin.filter(item => {
            let temp = item[attr];
            return seen.has(temp) ? false : seen.add(temp);
        });
    }
}