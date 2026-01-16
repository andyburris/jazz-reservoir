import { PureJSCrypto } from "cojson/dist/crypto/PureJSCrypto";
import { Account, co, Group, z } from "jazz-tools";
import { describe, expect, it } from "vitest";

// const Regular = co.map({ text: z.string()})
// const regular = Regular.create({ text: "hello world" });
// regular.$jazz.subscribe((value) => {
//   console.log("Regular text:", value.text);
// });

const Test = co
  .map({
    text: z.string(),
  })
  .withComputed({ wordCount: z.number() }, (self) => {
    const stopListening = self.$jazz.subscribe((resolved) => {
      if (resolved.$isComputed === true) {
        console.log("Computed word count", resolved.wordCount);
      } else {
        const count = resolved.text
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0).length;
        resolved.$jazz.finishComputation({ wordCount: count });
        // // @ts-expect-error
        // resolved.$jazz.finishComputation();
        // // @ts-expect-error
        // resolved.$jazz.finishComputation({ text: resolved.text, wordCount: count });
        // // @ts-expect-error
        // resolved.$jazz.finishComputation({ nonsense: "nonsense" });
      }
    });
    return {
      stopListening: () => {
        stopListening();
      },
    };
  });

function getBasicAccount() {
  return Account.create({
    creationProps: { name: "Test User" },
    crypto: new PureJSCrypto(),
  });
}

describe("ComputedCoMap wordCount", () => {
  it("runs computation for a single subscriber", async () => {
    const account = await getBasicAccount();
    const group = await Group.create({ owner: account });
    const test = Test.create({ text: "hello world" }, { owner: group });

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
