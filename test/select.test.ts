import { assert, describe, it } from "@effect/vitest";

import { Port } from "../src/Listener.ts";
import { isInDirectory, parseTarget } from "../src/select.ts";

describe("isInDirectory", () => {
  const cwd = "/Users/me/Code/anyrange/circles/apps/frontend";

  it.each([
    ["circles", true],
    ["anyrange/circles", true],
    ["circles/apps/", true],
    ["/Users/me/Code/anyrange", true],
    // Whole segments only, so a sibling project is never caught by accident.
    ["circ", false],
    ["circles-old", false],
    ["anyrange/apps", false],
    // Absolute fragments are anchored at the root.
    ["/Code/anyrange", false],
    // No segments: never matches everything.
    ["", false],
    ["/", false],
  ] as const)("%s → %s", (fragment, expected) => {
    assert.strictEqual(isInDirectory(cwd, fragment), expected);
  });
});

describe("parseTarget", () => {
  it("reads all-digit arguments as ports and anything else as directories", () => {
    assert.deepStrictEqual(parseTarget("3000"), {
      _tag: "Port",
      port: Port.make(3000),
    });
    assert.deepStrictEqual(parseTarget("circles"), {
      _tag: "Directory",
      fragment: "circles",
    });
    assert.deepStrictEqual(parseTarget("3000/"), {
      _tag: "Directory",
      fragment: "3000/",
    });
  });

  it("rejects out-of-range ports", () => {
    assert.throws(() => parseTarget("70000"));
  });
});
