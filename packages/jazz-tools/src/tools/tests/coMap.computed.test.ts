import { beforeEach, describe, expect, test } from "vitest";
import { co, z } from "../exports";
import { ComputedCoMapInstanceShape } from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";
import { createJazzTestAccount, setupJazzTestSync } from "../testing";

const Child = co.map({ text: z.string() });
const Parent = co
  .map({
    child: Child,
  })
  .withComputed({ wordCount: z.number() })
  .withComputation((self) => {
    const stopListening = self.$jazz.subscribe(
      { resolve: { child: true } },
      async (resolved) => {
        console.log(
          "text = ",
          resolved.child.text,
          ", computation state =",
          resolved.$jazz.computationState,
          ", $isComputed =",
          resolved.$isComputed,
        );
        if (resolved.$jazz.computationState === "uncomputed") {
          const pinned = await resolved.$jazz.startComputation();
          const count = pinned.child.text
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0).length;
          pinned.$jazz.finishComputation({ wordCount: count });
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

describe("ComputedCoMap wordCount", () => {
  beforeEach(async () => {
    await setupJazzTestSync();

    await createJazzTestAccount({
      isCurrentActiveAccount: true,
      creationProps: { name: "Hermes Puggington" },
    });
  });

  // test("runs computation for a single subscriber", async () => {
  //   const parent = Parent.create({ child: { text: "hello world" } });

  //   await new Promise<void>((resolve, reject) => {
  //     const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

  //     const unsubscribe = parent.$jazz.subscribe((value) => {
  //       if (value.$isComputed) {
  //         clearTimeout(timeout);
  //         expect(value.wordCount).toBe(2);
  //         unsubscribe();
  //         resolve();
  //       }
  //     });
  //   });
  // });

  test("keeps computation running while any subscriber remains", async () => {
    const parent = Parent.create({ child: { text: "one two" } });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

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
          parent.child.$jazz.set("text", "one two three four five");
        } else if (
          value.$isComputed &&
          value.wordCount === 5 &&
          updatedChildOnce
        ) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(5);
          unsubscribe2();
          resolve();
        }
      });
    });
  });

  // // TODO: eventually we should be updating whenever it's resolved in the LocalNode,
  // // so this test should become wrong eventually
  // test("stops computation when all subscribers unsubscribe", async () => {
  //   const parent = Parent.create({ child: { text: "alpha beta" } });

  //   await new Promise<void>((resolve, reject) => {
  //     const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

  //     const unsubscribe = parent.$jazz.subscribe((value) => {
  //       if (value.$isComputed) {
  //         clearTimeout(timeout);
  //         expect(value.wordCount).toBe(2);
  //         unsubscribe();
  //         resolve();
  //       }
  //     });
  //   });

  //   parent.child.$jazz.set("text", "gamma delta epsilon");

  //   // Wait a moment to see if computation runs again (it should not).
  //   await new Promise((resolve) => setTimeout(resolve, 100));

  //   assertIsUncomputed(parent);
  //   // @ts-expect-error property still exists, just is type-hidden
  //   expect(parent.wordCount).toBe(2);
  // });

  // test("runs computation when nested in a subscribed CoMap", async () => {
  //   const grandparent = Grandparent.create({
  //     parent: {
  //       child: { text: "red blue green" },
  //     },
  //   });

  //   await new Promise<void>((resolve, reject) => {
  //     const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

  //     const unsubscribe = grandparent.$jazz.subscribe((value) => {
  //       if (
  //         value.parent.$isComputed === true &&
  //         value.parent.wordCount != undefined
  //       ) {
  //         clearTimeout(timeout);
  //         expect(value.parent.wordCount).toBe(3);
  //         unsubscribe();
  //         resolve();
  //       }
  //     });
  //   });
  // });

  // test("lastComputedValue returns the uncomputed value when computation has never completed", async () => {
  //   const parent = Parent.create({ child: { text: "never computed" } });

  //   const lastComputed = parent.$jazz.lastComputedValue;
  //   assertIsUncomputed(lastComputed);
  //   expect(lastComputed.child.text).toBe("never computed");
  // });

  // test("lastComputedValue returns the computed value when a computation is completed", async () => {
  //   const parent = Parent.create({ child: { text: "initial" } });

  //   let computedOnce = false;

  //   await new Promise<void>((resolve, reject) => {
  //     const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

  //     const unsubscribe = parent.$jazz.subscribe((value) => {
  //       if (!value.$isComputed && !computedOnce) {
  //         const lastComputed = parent.$jazz.lastComputedValue;
  //         assertIsUncomputed(lastComputed);

  //         expect(parent.child.text).toBe("initial");
  //         expect(lastComputed.child.text).toBe("initial");
  //       } else if (value.$isComputed && !computedOnce) {
  //         const lastComputed = parent.$jazz.lastComputedValue;
  //         assertIsComputed(lastComputed);
  //         expect(parent.child.text).toBe("initial");
  //         expect(lastComputed.child.text).toBe("initial");
  //         expect(lastComputed.wordCount).toBe(1);

  //         computedOnce = true;
  //         parent.child.$jazz.set("text", "second time");
  //       } else if (!value.$isComputed && computedOnce) {
  //         const lastComputed = parent.$jazz.lastComputedValue;
  //         assertIsComputed(lastComputed);
  //         expect(parent.child.text).toBe("second time");
  //         expect(lastComputed.child.text).toBe("initial");
  //         expect(lastComputed.wordCount).toBe(1);
  //       } else if (value.$isComputed && computedOnce) {
  //         const lastComputed = parent.$jazz.lastComputedValue;
  //         assertIsComputed(lastComputed);
  //         expect(parent.child.text).toBe("second time");
  //         expect(lastComputed.child.text).toBe("second time");
  //         expect(lastComputed.wordCount).toBe(2);

  //         clearTimeout(timeout);
  //         unsubscribe();
  //         resolve();
  //       }
  //     });
  //   });
  // });
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
