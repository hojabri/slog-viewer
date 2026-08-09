"use strict";



(function (root, factory) {
  const utils = factory();
  root.SlogViewerPathUtils = utils;

  if (typeof module === "object" && module.exports) {
    module.exports = utils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/;

  /**
   * Decode JSON-style escape sequences inside a quoted path segment.
   *
   * Hand-typed filter fields can contain sequences that are not valid JSON
   * (a lone `\q`, an unescaped quote inside `'...'`). Those fall back to the
   * raw segment rather than throwing out of the filter path.
   *
   * @param {string} segment
   * @returns {string}
   * @example decodeJsonPathEscapes(`hello\nworld\t\"test\"`)
   */
  function decodeJsonPathEscapes(segment) {
    const escaped = String.raw`"${segment}"`;

    try {
      return JSON.parse(escaped);
    } catch {
      return segment;
    }
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
    // if it's not number or a valid identifier in js use .
    if (typeof segment !== "number" && VALID_IDENTIFIER.test(segment))
      return `${parentPath && parentPath + "."}${segment}`;

    return `${parentPath}[${JSON.stringify(segment)}]`;
  }

  /**
   * Decode the body of a quoted bracket segment, honouring the quote style used.
   *
   * Single-quoted segments are rewritten into JSON's double-quoted form first, so
   * `\'` decodes to `'` and a bare `"` stays literal.
   *
   * @param {string} raw Segment body, still escaped, without surrounding quotes
   * @param {string} quote `"` or `'`
   * @returns {{ ok: boolean, value: string }}
   */
  function decodeQuotedSegment(raw, quote) {
    let jsonBody = raw;

    if (quote === "'") {
      jsonBody = "";
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === "\\" && raw[i + 1] === "'") {
          jsonBody += "'";
          i++;
          continue;
        }
        jsonBody += raw[i] === '"' ? '\\"' : raw[i];
      }
    }

    try {
      return { ok: true, value: JSON.parse(String.raw`"${jsonBody}"`) };
    } catch {
      return { ok: false, value: raw };
    }
  }

  /**
   * Parse a field path like `user.items[0].name` into segments for walking `otherFields`.
   *
   * Malformed syntax is rejected rather than partially parsed — an unterminated
   * quote, a missing `]`, a non-numeric or negative index, or an invalid escape
   * would otherwise resolve to some unrelated field and produce a wrong match.
   *
   * @param {string} path
   * @returns {(string|number)[] | null} `null` when the path is malformed
   */
  function parsePathSegments(path) {
    const segments = [];
    let i = 0;
    let expectSeparator = false;

    while (i < path.length) {
      if (path[i] === ".") {
        // A dot must follow a segment and be followed by an identifier.
        if (!expectSeparator) {
          return null;
        }
        i++;
        expectSeparator = false;
        if (i >= path.length || path[i] === "." || path[i] === "[") {
          return null;
        }
        continue;
      }

      if (path[i] === "[") {
        i++;
        if (path[i] === '"' || path[i] === "'") {
          const q = path[i];
          i++;
          let raw = "";
          let closed = false;
          while (i < path.length) {
            if (path[i] === "\\" && i + 1 < path.length) {
              raw += path[i];
              raw += path[i + 1];
              i += 2;
              continue;
            }
            if (path[i] === q) {
              i++;
              closed = true;
              break;
            }
            raw += path[i];
            i++;
          }
          if (!closed) {
            return null;
          }
          const decoded = decodeQuotedSegment(raw, q);
          if (!decoded.ok) {
            return null;
          }
          segments.push(decoded.value);
        } else {
          let digits = "";
          while (i < path.length && path[i] >= "0" && path[i] <= "9") {
            digits += path[i];
            i++;
          }
          if (digits === "") {
            return null;
          }
          segments.push(Number(digits));
        }

        // Anything other than `]` here means the bracket was malformed.
        if (path[i] !== "]") {
          return null;
        }
        i++;
        expectSeparator = true;
        continue;
      }

      if (expectSeparator) {
        return null;
      }

      let ident = "";
      while (i < path.length && /[a-zA-Z0-9_$]/.test(path[i])) {
        ident += path[i];
        i++;
      }
      if (!ident) {
        return null;
      }
      segments.push(ident);
      expectSeparator = true;
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
    if (!parts || parts.length === 0) {
      return undefined;
    }
    let cur = otherFields;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") {
        return undefined;
      }
      // Own properties only — otherwise `constructor.name` or
      // `__proto__.constructor.name` would resolve against the prototype chain.
      if (!Object.prototype.hasOwnProperty.call(cur, p)) {
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
