Components.utils.import("resource://gre/modules/ctypes.jsm");
Components.utils.import("resource://gre/modules/FormHistory.jsm");

function $(el) {
  return document.getElementById(el);
}

function inherit(derived, base) {
  for (property in base) {
    if (!derived[property]) {
      derived[property] = base[property];
    }
  }
}
