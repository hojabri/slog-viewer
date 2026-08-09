/* eslint-disable @typescript-eslint/no-var-requires */
const {
  decodeJsonPathEscapes,
  appendJsonPath,
  parsePathSegments,
  getValueAtOtherFieldsPath,
}: {
  decodeJsonPathEscapes: (raw: string) => string;
  appendJsonPath: (parentPath: string, segment: string | number) => string;
  parsePathSegments: (path: string) => Array<string | number> | null;
  getValueAtOtherFieldsPath: (
    otherFields: Record<string, unknown> | undefined,
    path: string,
  ) => unknown;
} = require("./pathUtils.js");

describe("webview pathUtils", () => {
  describe("decodeJsonPathEscapes", () => {
    it("should decode JSON control escapes", () => {
      expect(decodeJsonPathEscapes("line\\nbreak")).toBe("line\nbreak");
      expect(decodeJsonPathEscapes("tab\\tkey")).toBe("tab\tkey");
      expect(decodeJsonPathEscapes("carriage\\rreturn")).toBe("carriage\rreturn");
      expect(decodeJsonPathEscapes("back\\bspace")).toBe("back\bspace");
      expect(decodeJsonPathEscapes("form\\ffeed")).toBe("form\ffeed");
    });

    it("should decode JSON quote, slash, backslash, and unicode escapes", () => {
      expect(decodeJsonPathEscapes('quoted\\"key')).toBe('quoted"key');
      expect(decodeJsonPathEscapes("path\\\\to\\\\file")).toBe("path\\to\\file");
      expect(decodeJsonPathEscapes("a\\/b")).toBe("a/b");
      expect(decodeJsonPathEscapes("snowman \\u2603")).toBe("snowman \u2603");
    });

    it("should fall back to the raw segment when the escapes are not valid JSON", () => {
      expect(decodeJsonPathEscapes("bad\\qescape")).toBe("bad\\qescape");
      expect(decodeJsonPathEscapes('un"balanced')).toBe('un"balanced');
      expect(decodeJsonPathEscapes("truncated\\u26")).toBe("truncated\\u26");
    });
  });

  describe("malformed hand-typed paths", () => {
    it("should reject bracket segments that are not valid JSON strings", () => {
      expect(() => parsePathSegments('a["b\\q"]')).not.toThrow();
      expect(parsePathSegments('a["b\\q"]')).toBeNull();
      expect(parsePathSegments('a["truncated\\u26"]')).toBeNull();
    });

    it("should reject unterminated quotes and missing brackets", () => {
      expect(parsePathSegments('a["b')).toBeNull();
      expect(parsePathSegments('a["b"')).toBeNull();
      expect(parsePathSegments("a[0")).toBeNull();
    });

    it("should reject non-numeric, empty, and negative bracket indices", () => {
      expect(parsePathSegments("a[]")).toBeNull();
      expect(parsePathSegments("a[-1]")).toBeNull();
      expect(parsePathSegments("a[foo]")).toBeNull();
      expect(parsePathSegments("a[12x]")).toBeNull();
    });

    it("should reject malformed separators and stray characters", () => {
      expect(parsePathSegments("a..b")).toBeNull();
      expect(parsePathSegments("a.")).toBeNull();
      expect(parsePathSegments(".a")).toBeNull();
      expect(parsePathSegments("a-b")).toBeNull();
      expect(parsePathSegments("a[0]b")).toBeNull();
    });

    it("should resolve a malformed path to undefined instead of a wrong match", () => {
      const otherFields = { a: { b: 1, "0": "zero" } };

      expect(() => getValueAtOtherFieldsPath(otherFields, 'a["b\\q"]')).not.toThrow();
      expect(getValueAtOtherFieldsPath(otherFields, 'a["b\\q"]')).toBeUndefined();
      // Would previously have parsed as index 0 and matched the "0" key.
      expect(getValueAtOtherFieldsPath(otherFields, "a[foo]")).toBeUndefined();
      expect(getValueAtOtherFieldsPath(otherFields, "a[]")).toBeUndefined();
    });
  });

  describe("single-quoted bracket segments", () => {
    it("should decode escaped single quotes and literal double quotes", () => {
      expect(parsePathSegments("a['it\\'s']")).toEqual(["a", "it's"]);
      expect(parsePathSegments("a['it\"s']")).toEqual(["a", 'it"s']);
    });
  });

  describe("prototype chain safety", () => {
    it("should not resolve inherited properties", () => {
      const otherFields = { a: { b: 1 } };

      expect(getValueAtOtherFieldsPath(otherFields, "constructor.name")).toBeUndefined();
      expect(getValueAtOtherFieldsPath(otherFields, "a.constructor.name")).toBeUndefined();
      expect(getValueAtOtherFieldsPath(otherFields, "a.toString")).toBeUndefined();
      expect(getValueAtOtherFieldsPath(otherFields, '["__proto__"].constructor.name')).toBeUndefined();
    });

    it("should still resolve own properties that shadow prototype names", () => {
      const otherFields = { constructor: "own value", a: { toString: "shadowed" } };

      expect(getValueAtOtherFieldsPath(otherFields, "constructor")).toBe("own value");
      expect(getValueAtOtherFieldsPath(otherFields, "a.toString")).toBe("shadowed");
    });
  });

  describe("appendJsonPath and parsePathSegments", () => {
    it("should round-trip keys with JSON escape sequences", () => {
      const keys = [
        "line\nbreak",
        "tab\tkey",
        "path\\to\\file",
        'quoted"key',
        "snowman \u2603",
        "key.with.dot and space",
      ];

      keys.forEach(key => {
        const path = appendJsonPath("", key);
        expect(parsePathSegments(path)).toEqual([key]);
      });
    });

    it("should preserve existing simple path behavior", () => {
      expect(parsePathSegments("user.name")).toEqual(["user", "name"]);
      expect(parsePathSegments("items[0].id")).toEqual(["items", 0, "id"]);
      expect(parsePathSegments('["key.with.dot"]')).toEqual(["key.with.dot"]);
    });

    it("should parse quoted path segments with unicode escapes", () => {
      expect(parsePathSegments('["snowman \\u2603"]')).toEqual(["snowman \u2603"]);
    });

    it("should round-trip nested object and array paths", () => {
      const parentPath = appendJsonPath("", "items");
      const arrayPath = appendJsonPath(parentPath, 0);
      const childPath = appendJsonPath(arrayPath, 'quoted"key');

      expect(childPath).toBe('items[0]["quoted\\"key"]');
      expect(parsePathSegments(childPath)).toEqual(["items", 0, 'quoted"key']);
    });
  });

  describe("getValueAtOtherFieldsPath", () => {
    it("should read root fields with escaped path keys", () => {
      const otherFields = {
        "line\nbreak": "newline value",
      };

      expect(getValueAtOtherFieldsPath(otherFields, '["line\\nbreak"]')).toBe("newline value");
    });

    it("should read nested fields with escaped path keys", () => {
      const otherFields = {
        parent: {
          "tab\tkey": "tab value",
        },
        items: [
          {
            'quoted"key': "quote value",
          },
        ],
      };

      expect(getValueAtOtherFieldsPath(otherFields, 'parent["tab\\tkey"]')).toBe("tab value");
      expect(getValueAtOtherFieldsPath(otherFields, 'items[0]["quoted\\"key"]')).toBe(
        "quote value",
      );
    });

    it("should read existing simple nested paths", () => {
      const otherFields = {
        user: { name: "Amir" },
        items: [{ id: 1 }],
        "key.with.dot": "dot value",
      };

      expect(getValueAtOtherFieldsPath(otherFields, "user.name")).toBe("Amir");
      expect(getValueAtOtherFieldsPath(otherFields, "items[0].id")).toBe(1);
      expect(getValueAtOtherFieldsPath(otherFields, '["key.with.dot"]')).toBe("dot value");
    });
  });
});
