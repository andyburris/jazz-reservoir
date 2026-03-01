import { beforeEach, describe, expect, test } from "vitest";
import { co, z } from "../exports";
import { SnapshotCoValue } from "../internal";
import { ComputedCoMapInstanceShape } from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";
import { createJazzTestAccount, setupJazzTestSync } from "../testing";

const Child = co.map({ text: z.string() });
const Parent = co
  .map({
    child: Child,
  })
  .withComputed({ wordCount: z.number() })
  .withResolvedDependencies({ child: true })
  .withComputation((self) => {
    const stopListening = self.$jazz.subscribe(
      { resolve: { child: true } },
      async (resolved) => {
        // console.log(
        //   "text = ",
        //   resolved.child.text,
        //   ", computation state =",
        //   resolved.$jazz.computationState,
        //   ", $isComputed =",
        //   resolved.$isComputed,
        // );
        if (resolved.$jazz.computationState === "uncomputed") {
          const pinned = await resolved.$jazz.startComputation();

          const count = pinned.child.text
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0).length;
          pinned.$jazz.finishComputation({ wordCount: count });

          // // @ts-expect-error can't finishComputation on the original object, must use the pinned version
          // resolved.$jazz.finishComputation({ wordCount: count });
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
const ParentList = co.list(Parent);

describe("ComputedCoMap wordCount", () => {
  beforeEach(async () => {
    await setupJazzTestSync();

    await createJazzTestAccount({
      isCurrentActiveAccount: true,
      creationProps: { name: "Hermes Puggington" },
    });
  });

  test("runs computation for a single subscriber", async () => {
    const parent = Parent.create({ child: { text: "hello world" } });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = parent.$jazz.subscribe((value) => {
        if (value.$isComputed) {
          clearTimeout(timeout);
          expect(value.wordCount).toBe(2);
          unsubscribe();
          resolve();
        }
      });
    });
  });

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

  // TODO: eventually we should be updating whenever it's resolved in the LocalNode,
  // so this test should become wrong eventually
  test("stops computation when all subscribers unsubscribe", async () => {
    const parent = Parent.create({ child: { text: "alpha beta" } });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = parent.$jazz.subscribe((value) => {
        if (value.$isComputed) {
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
    // @ts-expect-error property still exists, just is type-hidden
    expect(parent.wordCount).toBe(2);
  });

  test("runs computation when nested in a subscribed CoMap", async () => {
    const grandparent = Grandparent.create({
      parent: {
        child: { text: "red blue green" },
      },
    });

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

  test("lastComputedValue returns undefined when computation has never completed", async () => {
    const parent = Parent.create({ child: { text: "never computed" } });

    const lastComputed = parent.$jazz.lastComputedValue;
    expect(lastComputed).toBeUndefined();
  });

  test("lastComputedValue returns the computed value when a computation is completed", async () => {
    const parent = Parent.create({ child: { text: "initial" } });

    let computedOnce = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 2000);

      const unsubscribe = parent.$jazz.subscribe((value) => {
        if (!value.$isComputed && !computedOnce) {
          const lastComputed = parent.$jazz.lastComputedValue;
          expect(lastComputed).toBeUndefined();

          expect(parent.child.text).toBe("initial");
        } else if (value.$isComputed && !computedOnce) {
          const lastComputed = parent.$jazz.lastComputedValue;
          assertIsDefined(lastComputed);
          expect(lastComputed).toBe(true);
          expect(parent.child.text).toBe("initial");
          expect(lastComputed.child.text).toBe("initial");
          expect(lastComputed.wordCount).toBe(1);

          computedOnce = true;
          parent.child.$jazz.set("text", "second time");
        } else if (!value.$isComputed && computedOnce) {
          const lastComputed = parent.$jazz.lastComputedValue;
          assertIsDefined(lastComputed);
          expect(lastComputed).toBe(true);
          expect(parent.child.text).toBe("second time");
          expect(lastComputed.child.text).toBe("initial");
          expect(lastComputed.wordCount).toBe(1);
        } else if (value.$isComputed && computedOnce) {
          const lastComputed = parent.$jazz.lastComputedValue;
          assertIsDefined(lastComputed);
          expect(lastComputed).toBe(true);
          expect(parent.child.text).toBe("second time");
          expect(lastComputed.child.text).toBe("second time");
          expect(lastComputed.wordCount).toBe(2);

          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });
  });
});

// ====================================================================
// Type-only tests
// ====================================================================

describe("withResolvedDependencies type validation", () => {
  test("rejects non-existent keys", () => {
    co.map({ child: Child })
      .withComputed({ wordCount: z.number() })
      // @ts-expect-error 'nonExistent' is not a key on the schema
      .withResolvedDependencies({ nonExistent: true });
  });

  test("rejects primitive keys (only CoValue refs should be queryable)", () => {
    co.map({ child: Child, name: z.string() })
      .withComputed({ wordCount: z.number() })
      // @ts-expect-error 'name' is a primitive (string), not a CoValue ref
      .withResolvedDependencies({ name: true });
  });

  test("accepts valid CoValue ref keys", () => {
    // This should NOT error — child is a CoValue ref
    co.map({ child: Child })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ child: true });
  });

  // TODO: fix — nested sub-query excess key checking not yet implemented
  // test("rejects invalid nested sub-queries", () => {
  //   co.map({ child: Child })
  //     .withComputed({ wordCount: z.number() })
  //     // @ts-expect-error 'nonExistent' is not a key on Child
  //     .withResolvedDependencies({ child: { nonExistent: true } });
  // });

  // TODO: fix — valid nested sub-query currently errors when it shouldn't
  // test("accepts valid nested sub-queries", () => {
  //   const ChildWithRef = co.map({ grandchild: co.map({ value: z.number() }), label: z.string() });
  //   // ChildWithRef has a 'grandchild' CoValue ref — this should work
  //   co.map({ child: ChildWithRef })
  //     .withComputed({ total: z.number() })
  //     .withResolvedDependencies({ child: { grandchild: true } });
  // });
});

describe("startComputation types", () => {
  test("queried children are deeply resolved, non-queried are shallow", () => {
    co.map({ child: Child, other: Child })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ child: true })
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            // 'child' IS in the query — should be deeply accessible
            pinned.child.text;

            // 'other' should still exist as a shallow object (like MaybeLoaded)
            pinned.other.$jazz.id;

            // @ts-expect-error 'other' is NOT in the query — its children should NOT be accessible
            pinned.other.text;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });

  test("default query (no withResolvedDependencies) makes children shallow", () => {
    co.map({ child: Child, other: Child })
      .withComputed({ wordCount: z.number() })
      // No withResolvedDependencies — defaults to true
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            // @ts-expect-error with default true query, children should only have $jazz.id, not their own children
            pinned.child.text;
            pinned.child.$jazz.id;

            // @ts-expect-error with default true query, children should only have $jazz.id, not their own children
            pinned.other.text;
            pinned.other.$jazz.id;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });

  test("queried children are plain objects, not full CoValues", () => {
    co.map({ child: Child })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ child: true })
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            // Should be able to access the text as a string
            const text: string = pinned.child.text;

            // @ts-expect-error pinned children should be plain objects, no $type$
            pinned.child.$type$;

            // Should have $jazz.id but it should be a string, not a full $jazz API
            pinned.child.$jazz.id;

            // @ts-expect-error pinned children should not have subscribe
            pinned.child.$jazz.subscribe;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });

  test("non-queried children are shallow plain objects", () => {
    co.map({ child: Child, other: Child })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ child: true })
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            // non-queried 'other' should have $jazz.id
            pinned.other.$jazz.id;

            // @ts-expect-error non-queried 'other' should NOT have its children accessible
            pinned.other.text;

            // @ts-expect-error non-queried 'other' should not have $type$ either
            pinned.other.$type$;

            // @ts-expect-error non-queried 'other' should not have subscribe
            pinned.other.$jazz.subscribe;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });
});

describe("CoList types in computations", () => {
  test("fully resolved list items are accessible", () => {
    co.map({ children: co.list(Child) })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ children: { $each: true } })
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            pinned.children[0]?.text;
            pinned.children[0]?.$jazz.id;

            // @ts-expect-error the rest of the jazz stuff should be stripped out
            pinned.children[0]?.$type$;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });

  test("partially resolved list items are shallow", () => {
    co.map({ children: co.list(Child) })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ children: true })
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            // partially resolved items should have $jazz.id
            pinned.children[0]?.$jazz.id;

            // @ts-expect-error partially resolved items should not have their own children
            pinned.children[0]?.text;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });

  test("SnapshotCoValue does not strip non-CoList array types", () => {
    const testStringArray: string[] = [];
    const snapshot: SnapshotCoValue<string[]> = testStringArray;
    const firstString: string | undefined = snapshot[0];
  });
});

function assertIsComputed<
  Shape extends z.z.core.$ZodLooseShape,
  ComputedShape extends z.z.core.$ZodLooseShape,
  V extends ComputedCoMapInstanceShape<Shape, ComputedShape>,
>(value: V): asserts value is V & { $isComputed: true } {
  const $isComputed: boolean = value.$isComputed;
  expect($isComputed).toBe(true);
}

function assertIsUncomputed<
  Shape extends z.z.core.$ZodLooseShape,
  ComputedShape extends z.z.core.$ZodLooseShape,
  V extends ComputedCoMapInstanceShape<Shape, ComputedShape>,
>(value: V): asserts value is V & { $isComputed: false } {
  const $isComputed: boolean = value.$isComputed;
  expect($isComputed).toBe(false);
}

function assertIsDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}
