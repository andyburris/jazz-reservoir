import { beforeEach, describe, test } from "vitest";
import { co, CoList, CoMap, FileStream, MaybeLoaded, z } from "../exports";
import { NotLoaded, Simplify, SnapshotCoValue } from "../internal";
import { createJazzTestAccount, setupJazzTestSync } from "../testing";

const Child = co.map({ text: z.string() });
const UnresolvedParent = co
  .map({
    children: co.list(Child),
  })
  .withComputed({ wordCount: z.number() });

const partiallyResolvedQuery = { children: true };
const PartiallyResolvedParent = UnresolvedParent.withResolvedDependencies(
  partiallyResolvedQuery,
);

const fullyResolvedQuery = { children: { $each: true } };
const ResolvedParent =
  UnresolvedParent.withResolvedDependencies(fullyResolvedQuery);

const unresolvedDependencyQuery = UnresolvedParent.resolvedDependenciesQuery;
const resolvedDependencyQuery = ResolvedParent.resolvedDependenciesQuery;

const ResolvedComputedParent = ResolvedParent.withComputation((self) => {
  const stopListening = self.$jazz.subscribe(async (resolved) => {
    if (resolved.$jazz.computationState === "uncomputed") {
      const pinned = await resolved.$jazz.startComputation();
      const testType = resolved.$jazz.startComputationUnstripped();

      pinned.children[0]?.text;
      pinned.children[0]?.$jazz.id;

      // @ts-expect-error the rest of the jazz stuff should be stripped out
      pinned.children[0]?.$type$;

      const testStringArray: string[] = [];
      const firstString = testStringArray[0];

      pinned.$jazz.finishComputation({ wordCount: 0 });
    }
  });
  return { stopListening: () => stopListening() };
});

type UnstrippedList = readonly ({
  readonly file: FileStream;
} & {
  readonly name: string;
  readonly file: MaybeLoaded<FileStream>;
} & CoMap)[] &
  CoList<
    MaybeLoaded<
      {
        readonly name: string;
        readonly file: MaybeLoaded<FileStream>;
      } & CoMap
    >
  >;

type UnstrippedNonCoList = readonly ({
  readonly file: FileStream;
} & CoMap)[] &
  MaybeLoaded<
    {
      readonly file: MaybeLoaded<FileStream>;
    } & CoMap
  >[];

type UnstrippedListItem = ({
  readonly file: FileStream;
} & {
  readonly name: string;
  readonly file: MaybeLoaded<FileStream>;
} & CoMap) &
  MaybeLoaded<
    {
      readonly name: string;
      readonly file: MaybeLoaded<FileStream>;
    } & CoMap
  >;

type UnstrippedChild = {
  readonly file: FileStream;
} & {
  readonly name: string;
  readonly file: MaybeLoaded<FileStream>;
} & CoMap;

type StrippedList = SnapshotCoValue<UnstrippedList>;
type StrippedNonCoList = SnapshotCoValue<UnstrippedNonCoList>;
type StrippedListItem = SnapshotCoValue<UnstrippedListItem>;
type StrippedChild = SnapshotCoValue<UnstrippedChild>;

type CoListSimpleExample = readonly string[] & CoList<MaybeLoaded<string>>;
type CoListExample = readonly ({ test: string } & CoMap)[] &
  CoList<MaybeLoaded<{ test: string } & CoMap>>;

type GuaranteedList = string[] & (string | { $isLoaded: false })[];
type NonGuaranteedList = (string | { $isLoaded: false })[];

type GuaranteedListObject = {
  child: { test: string; $isLoaded: true };
  $isLoaded: true;
}[] &
  (
    | {
        child: { test: string; $isLoaded: true } | { $isLoaded: false };
        $isLoaded: true;
      }
    | { $isLoaded: false }
  )[];
type NonGuaranteedListObject = ({ test: string } | { $isLoaded: false })[];

const zz: GuaranteedListObject = [
  { child: { test: "a", $isLoaded: true }, $isLoaded: true },
  { child: { test: "b", $isLoaded: true }, $isLoaded: true },
  { child: { test: "c", $isLoaded: true }, $isLoaded: true },
];
zz[0]?.child.test;

const x: GuaranteedList = ["a", "b", "c"];
x[0]?.length;

const y: NonGuaranteedList = ["a", "b", "c"];
// @ts-expect-error
y[0]?.length;

type ExtractOnlyIfGuaranteed<T> = T extends readonly (infer E)[]
  ? [T[number]] extends [E]
    ? [E] extends [T[number]]
      ? never // E ≡ T[number] → no narrowing happened → not guaranteed
      : Simplify<T[number]>[] // T[number] ⊂ E → intersection narrowed → guaranteed
    : never
  : never;

// type HasCommonKeys<A, B> =
//   keyof A & keyof B extends never ? false : true;

// type ExtractByShape<E, Narrow> =
//   E extends unknown
//     ? HasCommonKeys<E, Narrow> extends true
//       ? E
//       : never
//     : never;

// type ExtractOnlyIfGuaranteed<T> =
//   T extends readonly (infer E)[]
//     ? [T[number]] extends [E]
//       ? [E] extends [T[number]]
//         ? never
//         : T[number][]
//       : never
//     : never;

type ExtractOnlyIfGuaranteedExample = ExtractOnlyIfGuaranteed<GuaranteedList>;
type ExtractOnlyIfGuaranteedBadExample =
  ExtractOnlyIfGuaranteed<NonGuaranteedList>;
type ExtractOnlyIfGuaranteedCoListExample =
  ExtractOnlyIfGuaranteed<CoListExample>;
type ExtractOnlyIfGuaranteedCoListBadExample = ExtractOnlyIfGuaranteed<
  CoList<MaybeLoaded<string>>
>;
type ExtractOnlyIfGuaranteedCoListExample2 =
  ExtractOnlyIfGuaranteed<UnstrippedNonCoList>;
type ExtractOnlyIfGuaranteedCoListExample3 =
  ExtractOnlyIfGuaranteed<UnstrippedList>;

type ExtractOnlyIfGuaranteedListObject =
  ExtractOnlyIfGuaranteed<GuaranteedListObject>;
type ExtractOnlyIfGuaranteedListObjectBad =
  ExtractOnlyIfGuaranteed<NonGuaranteedListObject>;

type ExtractOnlyIfGuaranteedSimple = ExtractOnlyIfGuaranteed<readonly string[]>;
type SnapshotCoValueSimple = SnapshotCoValue<readonly string[]>;

const xlist: ExtractOnlyIfGuaranteedListObject = [];
xlist[0]?.child.test;

type UnCoList<T> = T extends CoList<any>
  ? T extends readonly (infer Item)[] & CoList<any>
    ? readonly Exclude<Item, NotLoaded<any>>[] // strip the MaybeLoaded widening
    : never
  : T extends readonly (infer Item)[]
    ? readonly Item[]
    : never;
type UnCoListExample = UnCoList<CoListExample>;
type UnCoListExampleShouldntResolve = UnCoList<CoList<MaybeLoaded<string>>>;

const PartiallyResolvedComputedParent = PartiallyResolvedParent.withComputation(
  (self) => {
    const stopListening = self.$jazz.subscribe(async (resolved) => {
      if (resolved.$jazz.computationState === "uncomputed") {
        const pinned = await resolved.$jazz.startComputation();
        const testType = resolved.$jazz.startComputationUnstripped();

        // // @ts-expect-error if children's items aren't resolved, they should only have $jazz.id, not their own children
        // pinned.children[0]?.text;
        pinned.children[0]?.$jazz.id;

        const testStringArray: string[] = [];
        const firstString = testStringArray[0];

        pinned.$jazz.finishComputation({ wordCount: 0 });
      }
    });
    return { stopListening: () => stopListening() };
  },
);

type X = FileStream;
type Y = SnapshotCoValue<FileStream>;

describe("ComputedCoMap wordCount", () => {
  beforeEach(async () => {
    await setupJazzTestSync();

    await createJazzTestAccount({
      isCurrentActiveAccount: true,
      creationProps: { name: "Hermes Puggington" },
    });
  });

  test("runs computation when nested in a subscribed CoMap", async () => {});
});

type RealWorld = {
  readonly exportFiles: readonly ({
    readonly file: FileStream;
  } & {
    readonly name: string;
    readonly file: MaybeLoaded<FileStream>;
  } & CoMap)[] &
    CoList<
      MaybeLoaded<
        {
          readonly name: string;
          readonly file: MaybeLoaded<FileStream>;
        } & CoMap
      >
    >;
} & CoMap;

type RealWorldStripped = SnapshotCoValue<RealWorld>;
