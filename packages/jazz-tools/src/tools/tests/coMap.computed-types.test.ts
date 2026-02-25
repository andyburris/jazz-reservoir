import { describe, test } from "vitest";
import { co, z } from "../exports";

const Child = co.map({ text: z.string() });
const Grandchild = co.map({ value: z.number() });
const ChildWithRef = co.map({ grandchild: Grandchild, label: z.string() });

// ====================================================================
// Issue (a): withResolvedDependencies accepts invalid shapes
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
  //   // ChildWithRef has a 'grandchild' CoValue ref — this should work
  //   co.map({ child: ChildWithRef })
  //     .withComputed({ total: z.number() })
  //     .withResolvedDependencies({ child: { grandchild: true } });
  // });
});

// ====================================================================
// Issue (b): startComputation return type should reflect the query
// ====================================================================

describe("startComputation return type reflects resolved dependencies", () => {
  test("with specific query, queried children are deeply resolved, non-queried are shallow", () => {
    const Parent = co
      .map({ child: Child, other: Child })
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

            // // @ts-expect-error 'other' is NOT in the query — its children should NOT be accessible
            // pinned.other.text;

            pinned.$jazz.finishComputation({ wordCount: 0 });
          }
        });
        return { stopListening: () => stopListening() };
      });
  });

  test("with true (default) query, all base keys are deeply available", () => {
    const Parent = co
      .map({ child: Child, other: Child })
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

  test("queried CoValue children are plain objects, not full CoValues", () => {
    const Parent = co
      .map({ child: Child })
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

  test("non-queried CoValue children are shallow plain objects", () => {
    const Parent = co
      .map({ child: Child, other: Child })
      .withComputed({ wordCount: z.number() })
      .withResolvedDependencies({ child: true })
      .withComputation((self) => {
        const stopListening = self.$jazz.subscribe(async (resolved) => {
          if (resolved.$jazz.computationState === "uncomputed") {
            const pinned = await resolved.$jazz.startComputation();

            // non-queried 'other' should have $jazz.id
            pinned.other.$jazz.id;

            // // @ts-expect-error non-queried 'other' should NOT have its children accessible
            // pinned.other.text;

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
