import { PureJSCrypto } from "cojson/dist/crypto/PureJSCrypto";
import { Account, co, Group, z } from "jazz-tools";
import { describe, expect, it } from "vitest";

const Inner = co.map({ text: z.string() });
const Outer = co
  .map({
    inner: Inner,
    wordCount: z.number().optional(),
  })
  .withComputation((self) => {
    const stopListening = self.$jazz.subscribe(
      { resolve: { inner: true } },
      (resolved) => {
        const count = resolved.inner.text
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0).length;
        if (!(resolved.wordCount === count)) {
          resolved.$jazz.set("wordCount", count);
        }
      },
    );
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
    const outer = Outer.create(
      { inner: { text: "hello world" } },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = outer.$jazz.subscribe((value) => {
        if (value.wordCount != undefined) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(2);
          unsubscribe();
          resolve();
        }
      });
    });
  });

  it("keeps computation running while any subscriber remains", async () => {
    const account = await getBasicAccount();
    const group = await Group.create({ owner: account });
    const outer = Outer.create(
      { inner: { text: "one two" } },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 4000);

      let unsubscribe1: () => void;
      let unsubscribe2: () => void;
      let updatedInnerOnce = false;

      unsubscribe1 = outer.$jazz.subscribe((value) => {
        if (value.wordCount === 2 && unsubscribe1) {
          // First subscriber unsubscribes after seeing the initial computation.
          unsubscribe1();
        }
      });

      unsubscribe2 = outer.$jazz.subscribe((value) => {
        if (value.wordCount === 2 && !updatedInnerOnce) {
          // After second subscriber has seen the first computed value,
          // update inner.text to trigger another computation.
          updatedInnerOnce = true;
          outer.inner.$jazz.set("text", "one two three four");
        } else if (value.wordCount === 4 && updatedInnerOnce) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(4);
          unsubscribe2();
          resolve();
        }
      });
    });
  });

  // TODO: eventually we should be updating whenever it's resolved in the LocalNode,
  // so this test should become wrong eventually
  it("stops computation when all subscribers unsubscribe", async () => {
    const account = await getBasicAccount();
    const group = await Group.create({ owner: account });
    const outer = Outer.create(
      { inner: { text: "alpha beta" } },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = outer.$jazz.subscribe((value) => {
        if (value.wordCount != undefined) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(2);
          unsubscribe();
          resolve();
        }
      });
    });

    outer.inner.$jazz.set("text", "gamma delta epsilon");

    // Wait a moment to see if computation runs again (it should not).
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(outer.wordCount).toBe(2); // should not have updated
  });
});
