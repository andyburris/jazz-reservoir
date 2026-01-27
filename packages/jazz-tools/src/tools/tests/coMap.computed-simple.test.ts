import { beforeEach, describe, expect, it } from "vitest";
import { co, z } from "../exports";
import { createJazzTestAccount, setupJazzTestSync } from "../testing.js";

// const Regular = co.map({ text: z.string()})
// const regular = Regular.create({ text: "hello world" });
// regular.$jazz.subscribe((value) => {
//   console.log("Regular text:", value.text);
// });

const Test = co
  .map({
    text: z.string(),
  })
  .withComputed({ wordCount: z.number() })
  .withComputation((self) => {
    const stopListening = self.$jazz.subscribe(async (resolved) => {
      if (resolved.$isComputed === true) {
        console.log("Computed word count", resolved.wordCount);
      } else if (resolved.$jazz.computationState === "uncomputed") {
        const pinnedBase = await resolved.$jazz.startComputation();
        const count = pinnedBase.text
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0).length;
        pinnedBase.$jazz.finishComputation({ wordCount: count });
      }
    });
    return {
      stopListening: () => {
        stopListening();
      },
    };
  });

beforeEach(async () => {
  await setupJazzTestSync();

  await createJazzTestAccount({
    isCurrentActiveAccount: true,
    creationProps: { name: "Hermes Puggington" },
  });
});

describe("ComputedCoMap wordCount", () => {
  it("runs computation for a single subscriber", async () => {
    const test = Test.create({ text: "hello world" });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = test.$jazz.subscribe((value) => {
        if (value.$isComputed === true && value.wordCount != undefined) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(2);
          unsubscribe();
          resolve();
        }
      });
    });
  });
});
