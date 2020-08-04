const vscode = typeof (acquireVsCodeApi) != "undefined" ? acquireVsCodeApi() : null;
const postMessage = (message) => { if (vscode) { vscode.postMessage(message) } }

export const getVscodeEvent = () => {
    let events = {}
    let init = false;
    function receive({ data }) {
        if (!data)
            return;
        if (events[data.type]) {
            events[data.type](data.content);
        }
    }
    return {
        on(event, data) {
            this.init();
            events[event] = data
            return this;
        },
        emit(event, data) {
            this.init();
            postMessage({ type: event, content: data })
        },
        init() {
            if (init) return;
            init = true;
            window.addEventListener('message', receive)
        },
        destroy() {
            window.removeEventListener('message', receive)
            this.init = false;
        }
    }
}

