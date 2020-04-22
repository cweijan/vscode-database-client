import format = require('date-format');

function between(min: number, max: number) {
    max = max + 1
    return Math.floor(
        Math.random() * (max - min) + min
    )
}

function boolean() {
    between(0, 1) == 0 ? true : false;
}

function constant(...item: any[]) {
    if (!item || item.length == 0) return ''
    return item[between(0, item.length - 1)]
}

function now() {
    new Date().getTime()
}

function nowStr() {
    format('yyyy-MM-dd hh:mm:ss', new Date())
}

export class MockRunner {

}