import { describe, expect, it } from "vitest";

import { generateSubTopicCode, generateTopicCode } from "@/model/codes";

describe("generateTopicCode", () => {
  it("returns T1 when no codes exist", () => {
    expect(generateTopicCode([])).toBe("T1");
  });

  it("returns T2 when T1 exists", () => {
    expect(generateTopicCode(["T1"])).toBe("T2");
  });

  it("fills the first gap when T1 and T3 exist", () => {
    expect(generateTopicCode(["T1", "T3"])).toBe("T2");
  });

  it("fills the first gap when T2 and T3 exist but T1 does not", () => {
    expect(generateTopicCode(["T2", "T3"])).toBe("T1");
  });

  it("walks past a contiguous block", () => {
    expect(generateTopicCode(["T1", "T2", "T3", "T4"])).toBe("T5");
  });

  it("ignores input order", () => {
    expect(generateTopicCode(["T3", "T1", "T2"])).toBe("T4");
  });

  it("is position-based, not name-based (renames cannot move codes)", () => {
    // The function takes no topic-name input. A rename would update Topic.name
    // elsewhere but keep Topic.code, so the next generation step is unaffected.
    const first = generateTopicCode([]);
    expect(first).toBe("T1");
    const second = generateTopicCode([first]);
    expect(second).toBe("T2");
  });
});

describe("generateSubTopicCode", () => {
  it("returns T1a when no codes exist for the topic", () => {
    expect(generateSubTopicCode("T1", [])).toBe("T1a");
  });

  it("returns T1b when T1a exists", () => {
    expect(generateSubTopicCode("T1", ["T1a"])).toBe("T1b");
  });

  it("fills the first gap when T1a and T1c exist", () => {
    expect(generateSubTopicCode("T1", ["T1a", "T1c"])).toBe("T1b");
  });

  it("returns T1aa after T1z", () => {
    const through_z = Array.from({ length: 26 }, (_, i) =>
      `T1${String.fromCharCode(97 + i)}`
    );
    expect(generateSubTopicCode("T1", through_z)).toBe("T1aa");
  });

  it("returns T1ab after T1aa", () => {
    const through_aa = Array.from({ length: 26 }, (_, i) =>
      `T1${String.fromCharCode(97 + i)}`
    );
    through_aa.push("T1aa");
    expect(generateSubTopicCode("T1", through_aa)).toBe("T1ab");
  });

  it("returns T1ba after T1az", () => {
    const codes: string[] = [];
    // a..z
    for (let i = 0; i < 26; i++) {
      codes.push(`T1${String.fromCharCode(97 + i)}`);
    }
    // aa..az
    for (let i = 0; i < 26; i++) {
      codes.push(`T1a${String.fromCharCode(97 + i)}`);
    }
    expect(generateSubTopicCode("T1", codes)).toBe("T1ba");
  });

  it("returns T1aaa after T1zz", () => {
    const codes: string[] = [];
    // a..z
    for (let i = 0; i < 26; i++) {
      codes.push(`T1${String.fromCharCode(97 + i)}`);
    }
    // aa..zz
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        codes.push(
          `T1${String.fromCharCode(97 + i)}${String.fromCharCode(97 + j)}`
        );
      }
    }
    expect(generateSubTopicCode("T1", codes)).toBe("T1aaa");
  });

  it("isolates topics — T2a is not blocked by T1a", () => {
    expect(generateSubTopicCode("T2", ["T1a", "T1b"])).toBe("T2a");
  });

  it("respects the requested topic prefix", () => {
    expect(generateSubTopicCode("T7", ["T7a", "T7b", "T7c"])).toBe("T7d");
  });
});
