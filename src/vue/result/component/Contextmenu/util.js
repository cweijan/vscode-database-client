export function hasClass(el, className) {
  if (!className) {
    return true;
  }
  if (!el || !el.className || typeof el.className !== 'string') {
    return false;
  }
  for (let cn of el.className.split(/\s+/)) {
    if (cn === className) {
      return true;
    }
  }
  return false;
}

export function getElementsByClassName(className) {
  let els = [];
  for (let el of document.getElementsByClassName(className) || []) {
    els.push(el);
  }
  return els;
}

export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

