const vscode = typeof (acquireVsCodeApi) != "undefined" ? acquireVsCodeApi() : null;
const postMessage = (message) => { if (vscode) { vscode.postMessage(message) } }
let events = {}
window.addEventListener('message', ({ data }) => {
  if (events[data.type]) {
    events[data.type](data.content);
  }
})
export const vscodeEvent = {
  on(event, data) {
    events[event] = data
    return vscodeEvent;
  },
  emit(event, data) {
    postMessage({ type: event, content: data })
  }
}
