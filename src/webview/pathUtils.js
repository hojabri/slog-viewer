"use strict";



(function (root, factory) {
  const utils = factory();
  root.SlogViewerPathUtils = utils;

  if (typeof module === "object" && module.exports) {
    module.exports = utils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/;
  const HEX_4 = /^[0-9a-fA-F]{4}$/;

  /**
   * Decode JSON-style escape sequences inside a quoted path segment.
   *
   * @param {string} segment
   * @returns {string}
   * @example decodeJsonPathEscapes(`hello\nworld\t\"test\"`)
   */
  function decodeJsonPathEscapes(segment) {
    const escaped = String.raw`"${segment}"`;

    return JSON.parse(escaped);
  }

  /**
   * Append parent path to the segment key carefully
   *
   * @param {string} parentPath
   * @param {string|number} segment
   *
   * @returns {string}
   *
   * @example appendJsonPath('user', 'salam\"hello') // 'user["salam\"hello"]
   */
  function appendJsonPath(parentPath, segment) {
    const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/;

    // if it's not number or a valid identifier in js use .
    if (typeof segment !== "number" && VALID_IDENTIFIER.test(segment))
      return `${parentPath && parentPath + "."}${segment}`;

    return `${parentPath}[${JSON.stringify(segment)}]`;
  }

  /**
   * Parse a field path like `user.items[0].name` into segments for walking `otherFields`.
   *
   * @param {string} path
   * @returns {(string|number)[]}
   */
  function parsePathSegments(path) {
    const segments = [];
    let i = 0;
    while (i < path.length) {
      if (path[i] === ".") {
        i++;
        continue;
      }
      if (path[i] === "[") {
        i++;
        if (path[i] === '"' || path[i] === "'") {
          const q = path[i];
          i++;
          let raw = "";
          while (i < path.length) {
            if (path[i] === "\\" && i + 1 < path.length) {
              raw += path[i];
              raw += path[i + 1];
              i += 2;
              continue;
            }
            if (path[i] === q) {
              i++;
              break;
            }
            raw += path[i];
            i++;
          }
          segments.push(decodeJsonPathEscapes(raw));
          if (path[i] === "]") {
            i++;
          }
        } else {
          let n = "";
          while (i < path.length && path[i] >= "0" && path[i] <= "9") {
            n += path[i];
            i++;
          }
          segments.push(Number(n));
          if (path[i] === "]") {
            i++;
          }
        }
        continue;
      }
      let ident = "";
      while (i < path.length && /[a-zA-Z0-9_$]/.test(path[i])) {
        ident += path[i];
        i++;
      }
      if (ident) {
        segments.push(ident);
      } else {
        break;
      }
    }
    return segments;
  }

  /**
   * Read a nested value from `otherFields` using dot / bracket path notation.
   *
   * @param {Record<string, unknown>|undefined} otherFields
   * @param {string} path
   * @returns {unknown}
   */
  function getValueAtOtherFieldsPath(otherFields, path) {
    if (!path || !otherFields || typeof otherFields !== "object") {
      return undefined;
    }
    const parts = parsePathSegments(path);
    if (parts.length === 0) {
      return undefined;
    }
    let cur = otherFields;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") {
        return undefined;
      }
      cur = cur[p];
    }
    return cur;
  }

  return {
    decodeJsonPathEscapes,
    appendJsonPath,
    parsePathSegments,
    getValueAtOtherFieldsPath,
  };
});
