/* eslint-disable @typescript-eslint/no-var-requires */
const {
  decodeJsonPathEscapes,
  appendJsonPath,
  parsePathSegments,
  getValueAtOtherFieldsPath,
}: {
  decodeJsonPathEscapes: (raw: string) => string;
  appendJsonPath: (parentPath: string, segment: string | number) => string;
  parsePathSegments: (path: string) => Array<string | number>;
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
