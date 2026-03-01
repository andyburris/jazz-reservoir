import { beforeEach, describe, expect, test } from "vitest";
import { co, z } from "../exports";
import { CoMap, MaybeLoaded, SnapshotCoValue } from "../internal";
import { createJazzTestAccount, setupJazzTestSync } from "../testing";

const Child = co.map({ text: z.string() });
const Parent = co.map({
  child: Child,
});
const Grandparent = co.map({
  parent: Parent,
});

describe("ComputedCoMap wordCount", () => {
  beforeEach(async () => {
    await setupJazzTestSync();

    await createJazzTestAccount({
      isCurrentActiveAccount: true,
      creationProps: { name: "Hermes Puggington" },
    });
  });

  test("runs computation when nested in a subscribed CoMap", async () => {
    const grandparent = Grandparent.create({
      parent: {
        child: { text: "red blue green" },
      },
    });

    expect(grandparent.parent.child.text).toBe("red blue green");
  });
});
