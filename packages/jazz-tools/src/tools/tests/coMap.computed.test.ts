import { PureJSCrypto } from "cojson/dist/crypto/PureJSCrypto";
import { Account, co, Group, z } from "jazz-tools";
import { describe, expect, it } from "vitest";
import { ComputedCoMapInstanceShape } from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";

const Child = co.map({ text: z.string() });
const Parent = co
  .map({
    child: Child,
  })
  .withComputed({ wordCount: z.number() }, (self) => {
    const stopListening = self.$jazz.subscribe(
      { resolve: { child: true } },
      (resolved) => {
        if (resolved.$isComputed === false) {
          const count = resolved.child.text
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0).length;
          resolved.$jazz.finishComputation({ wordCount: count });
        }
      },
    );
    return {
      stopListening: () => {
        stopListening();
      },
    };
  });
const Grandparent = co.map({
  parent: Parent,
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
    const parent = Parent.create(
      { child: { text: "hello world" } },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = parent.$jazz.subscribe((value) => {
        if (value.$isComputed && value.wordCount != undefined) {
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
    const parent = Parent.create(
      { child: { text: "one two" } },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 4000);

      let unsubscribe1: () => void;
      let unsubscribe2: () => void;
      let updatedChildOnce = false;

      unsubscribe1 = parent.$jazz.subscribe((value) => {
        if (value.$isComputed && value.wordCount === 2 && unsubscribe1) {
          // First subscriber unsubscribes after seeing the initial computation.
          unsubscribe1();
        }
      });

      unsubscribe2 = parent.$jazz.subscribe((value) => {
        if (value.$isComputed && value.wordCount === 2 && !updatedChildOnce) {
          // After second subscriber has seen the first computed value,
          // update child.text to trigger another computation.
          updatedChildOnce = true;
          parent.child.$jazz.set("text", "one two three four");
        } else if (
          value.$isComputed &&
          value.wordCount === 4 &&
          updatedChildOnce
        ) {
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
    const parent = Parent.create(
      { child: { text: "alpha beta" } },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = parent.$jazz.subscribe((value) => {
        if (value.$isComputed === true && value.wordCount != undefined) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(2);
          unsubscribe();
          resolve();
        }
      });
    });

    parent.child.$jazz.set("text", "gamma delta epsilon");

    // Wait a moment to see if computation runs again (it should not).
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertIsUncomputed(parent);
  });

  it("runs computation when nested in a subscribed CoMap", async () => {
    const account = await getBasicAccount();
    const group = await Group.create({ owner: account });
    const grandparent = Grandparent.create(
      {
        parent: {
          child: { text: "red blue green" },
        },
      },
      { owner: group },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = grandparent.$jazz.subscribe((value) => {
        if (
          value.parent.$isComputed === true &&
          value.parent.wordCount != undefined
        ) {
          clearTimeout(timeout);
          expect(value.parent.wordCount).toBe(3);
          unsubscribe();
          resolve();
        }
      });
    });
  });
});

function assertIsComputed<
  Shape extends z.z.core.$ZodLooseShape,
  ComputedShape extends z.z.core.$ZodLooseShape,
  V extends ComputedCoMapInstanceShape<Shape, ComputedShape>,
>(value: V): asserts value is V & { $isComputed: true } {
  expect(value.$isComputed).toBe(true);
}

function assertIsUncomputed<
  Shape extends z.z.core.$ZodLooseShape,
  ComputedShape extends z.z.core.$ZodLooseShape,
  V extends ComputedCoMapInstanceShape<Shape, ComputedShape>,
>(value: V): asserts value is V & { $isComputed: false } {
  expect(value.$isComputed).toBe(false);
}
