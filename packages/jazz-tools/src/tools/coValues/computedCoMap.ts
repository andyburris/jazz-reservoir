import { CoValueUniqueness, RawCoMap } from "cojson";
import {
  ComputedCoMapInstanceCoValuesMaybeLoaded,
  ComputedCoMapInstanceShape,
} from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";
import { z } from "../implementation/zodSchema/zodReExport";
import {
  Account,
  BranchDefinition,
  CoList,
  CoMapSchemaInit,
  CoValueClass,
  Group,
  isRefEncoded,
  parseCoValueCreateOptions,
  parseSubscribeRestArgs,
  RefsToResolve,
  RefsToResolveForShape,
  RefsToResolveStrict,
  Resolved,
  ResolvedFromShapeAndQuery,
  Simplify,
  StaticResolved,
  SubscribeRestArgs,
  TypeSym,
} from "../internal";
import { CoMap, CoMapInit_DEPRECATED, CoMapJazzApi } from "./coMap";

/**
 * Wait until the next millisecond boundary.
 * This ensures a clean temporal separation between operations.
 */
async function waitForNextMs(): Promise<number> {
  const startMs = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const now = Date.now();
      if (now > startMs) {
        resolve(now);
      } else {
        // Use setImmediate/setTimeout(0) to yield and check again
        setTimeout(check, 0);
      }
    };
    check();
  });
}

export class ComputedCoMap<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
  ResolvedDependenciesQuery extends RefsToResolveForShape<Shape>,
> extends CoMap {
  declare $jazz: ComputedCoMapJazzApi<
    Shape,
    ComputedShape,
    this,
    ResolvedDependenciesQuery
  >;

  public get $isComputed(): boolean {
    // $isComputed is true when $internalComputationState is "computed" and
    // no base schema edits have happened since computation started
    const state = this.$jazz.getComputationState();

    // If never computed or currently computing, return false
    if (!state || state.status !== "computed") {
      return false;
    }

    // Find the start time that corresponds to this completed computation
    const startedAt = this.$jazz.getMostRecentStartTime();
    if (!startedAt) {
      return false;
    }

    // Check if any base schema edit has madeAt >= startedAt
    const latestBaseEditTime = this.$jazz.getLatestBaseEditTime();
    if (latestBaseEditTime !== null && latestBaseEditTime >= startedAt) {
      return false;
    }

    return true;
  }

  /** @internal */
  constructor(options: { fromRaw: RawCoMap } | undefined) {
    const proxy = super(options) as unknown as ComputedCoMap<
      Shape,
      ComputedShape,
      ResolvedDependenciesQuery
    >;
    if (options) {
      if ("fromRaw" in options) {
        Object.defineProperties(this, {
          $jazz: {
            value: new ComputedCoMapJazzApi(
              proxy as any,
              () => options.fromRaw,
            ),
            enumerable: false,
            configurable: true,
            writable: true,
          },
        });
      } else {
        throw new Error("Invalid CoMap constructor arguments");
      }
    }

    return proxy;
  }

  /**
   * Create a new CoMap with the given initial values and owner.
   *
   * The owner (a Group or Account) determines access rights to the CoMap.
   *
   * The CoMap will immediately be persisted and synced to connected peers.
   *
   * @example
   * ```ts
   * const person = Person.create({
   *   name: "Alice",
   *   age: 42,
   *   pet: cat,
   * }, { owner: friendGroup });
   * ```
   *
   * @category Creation
   *
   * @deprecated Use `co.map(...).create`.
   **/
  static create<M extends CoMap>(
    this: CoValueClass<M>,
    init: Simplify<CoMapInit_DEPRECATED<M>>,
    options?:
      | {
          owner?: Account | Group;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Account
      | Group,
  ) {
    const instance = new this();

    return ComputedCoMap._createCoMap(instance, init, options);
  }

  /**
   * @internal
   */
  static _createCoMap<M extends CoMap>(
    instance: M,
    init: Simplify<CoMapInit_DEPRECATED<M>>,
    options?:
      | {
          owner?: Account | Group;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Account
      | Group,
  ): M {
    const { owner, uniqueness } = parseCoValueCreateOptions(options);

    Object.defineProperties(instance, {
      $jazz: {
        value: new ComputedCoMapJazzApi(instance as any, () => raw),
        enumerable: false,
        configurable: true,
        writable: true,
      },
    });

    const raw = CoMap.rawFromInit(instance, init, owner, uniqueness);

    return instance;
  }
}

export class ComputedCoMapJazzApi<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
  M extends ComputedCoMap<Shape, ComputedShape, ResolvedDependenciesQuery>,
  ResolvedDependenciesQuery extends RefsToResolveForShape<Shape>,
> extends CoMapJazzApi<M> {
  declare isComputed: true;
  static {
    this.prototype["isComputed"] = true;
  }

  getResolvedDependenciesQuery(): ResolvedDependenciesQuery {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    return schema?.resolvedDependenciesQuery ?? true;
  }

  /**
   * Get the last computed state of this ComputedCoMap.
   *
   * Returns a composite view where:
   * - Base shape properties are from the moment computation started (startedAt - 1)
   * - Computed shape properties are from when computation finished (finishedAt)
   *
   * This represents "what the computation saw" for base props and
   * "what the computation produced" for computed props.
   *
   * If a computation is currently in progress, returns the previous completed computation.
   * If no computation has ever completed, returns the current state.
   */
  get lastComputedValue(): Simplify<
    ComputedCoMapInstanceShape<Shape, ComputedShape>
  > &
    ComputedCoMap<Shape, ComputedShape, ResolvedDependenciesQuery> {
    // Find the most recent completed computation
    const lastCompletedComputation = this.getLastCompletedComputation();

    if (!lastCompletedComputation) {
      // No computation has ever completed - return current state
      return this.coMap as any;
    }

    const { startedAt, finishedAt } = lastCompletedComputation;

    // Build composite: base props from startedAt - 1, computed props from finishedAt
    return this.getCompositeSnapshot(startedAt - 1, finishedAt);
  }

  /**
   * Find the most recent completed computation (start/finish pair).
   * Returns null if no computation has ever completed.
   */
  private getLastCompletedComputation(): {
    startedAt: number;
    finishedAt: number;
  } | null {
    // Iterate through all edits to find start/finish pairs
    // We want the most recent "computed" and its corresponding "computing"
    let lastStartTime: number | null = null;
    let lastFinishTime: number | null = null;
    let pendingStartTime: number | null = null;

    for (const edit of this.raw.editsAt("$internalComputationState")) {
      const editTime = edit.at.getTime();

      if (edit.value === "computing") {
        // This is a start - remember it as pending
        pendingStartTime = editTime;
      } else if (edit.value === "computed" && pendingStartTime !== null) {
        // This completes the pending computation
        lastStartTime = pendingStartTime;
        lastFinishTime = editTime;
        pendingStartTime = null; // Reset for next potential pair
      }
    }

    if (lastStartTime === null || lastFinishTime === null) {
      return null;
    }

    return { startedAt: lastStartTime, finishedAt: lastFinishTime };
  }

  /**
   * Build a composite snapshot with base props from one time and computed props from another.
   *
   * @param baseTime - Timestamp for base shape properties
   * @param computedTime - Timestamp for computed shape properties
   */
  private getCompositeSnapshot(
    baseTime: number,
    computedTime: number,
  ): Simplify<ComputedCoMapInstanceShape<Shape, ComputedShape>> &
    ComputedCoMap<Shape, ComputedShape, ResolvedDependenciesQuery> {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) {
      return this.coMap as any;
    }

    const computedKeys = Object.keys(schema.computedShape);
    const resolveQuery = this.getResolvedDependenciesQuery();

    // Get the base portion via getBaseShapeAtTime (uses resolveQuery)
    const basePinned = this.getBaseShapeAtTime(baseTime, resolveQuery);

    // Build the composite object starting from the base
    const result: Record<string, any> = { ...basePinned };

    // Add computed shape properties from computedTime
    const computedFilteredRaw = this.raw.atTime(computedTime);
    for (const key of computedKeys) {
      result[key] = computedFilteredRaw.get(key);
    }

    // $isComputed always true in the composite
    Object.defineProperty(result, "$isComputed", {
      get: () => true,
      enumerable: true,
    });

    // Override $jazz to include the full API (not just { id })
    Object.defineProperty(result, "$jazz", {
      value: this,
      enumerable: false,
    });

    return result as any;
  }

  /**
   * Given an already loaded `CoMap`, subscribe to updates to the `CoMap` and ensure that the specified fields are loaded to the specified depth.
   *
   * Works like `CoMap.subscribe()`, but you don't need to pass the ID or the account to load as again.
   *
   * Returns an unsubscribe function that you should call when you no longer need updates.
   *
   * @category Subscription & Loading
   **/
  subscribe<
    Map extends Simplify<
      ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>
    > &
      ComputedCoMap<Shape, ComputedShape, ResolvedDependenciesQuery>,
    const R extends RefsToResolve<Map> = true,
  >(
    listener: (value: Resolved<Map, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<
    Map extends Simplify<
      ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>
    > &
      ComputedCoMap<Shape, ComputedShape, ResolvedDependenciesQuery>,
    const R extends RefsToResolve<Map> = true,
  >(
    options: {
      resolve?: RefsToResolveStrict<Map, R>;
      unstable_branch?: BranchDefinition;
    },
    listener: (value: Resolved<Map, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<
    Map extends Simplify<
      ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>
    > &
      ComputedCoMap<Shape, ComputedShape, ResolvedDependenciesQuery>,
    const R extends RefsToResolve<Map>,
  >(...args: SubscribeRestArgs<Map, R>): () => void {
    const { options, listener } = parseSubscribeRestArgs(args);
    return super.subscribe(options, listener);
  }

  /**
   * Get the current computation state as a simple string.
   * Returns "uncomputed" if never computed or if stale,
   * "computing" if computation is in progress,
   * "computed" if computation is complete and up-to-date.
   */
  get computationState(): "uncomputed" | "computing" | "computed" {
    const state = this.getComputationState();

    if (!state) {
      return "uncomputed";
    }

    if (state.status === "computing") {
      return "computing";
    }

    // state.status === "computed" - check if stale
    const startedAt = this.getMostRecentStartTime();
    if (!startedAt) {
      return "uncomputed";
    }

    const latestBaseEditTime = this.getLatestBaseEditTime();
    if (latestBaseEditTime !== null && latestBaseEditTime >= startedAt) {
      return "uncomputed";
    }

    return "computed";
  }

  /**
   * Get the current computation state with detailed info.
   * Returns null if computation has never been started, otherwise returns
   * the status and when it was set.
   */
  getComputationState(): {
    status: "computing" | "computed";
    madeAt: number;
  } | null {
    const edit = this.raw.lastEditAt("$internalComputationState");
    if (!edit) {
      return null;
    }
    const status = this.raw.get("$internalComputationState") as
      | null
      | "computing"
      | "computed";
    if (!status) return null;
    return {
      status,
      madeAt: edit.at.getTime(),
    };
  }

  /**
   * Get the madeAt timestamp of the most recent "computing" state.
   * This represents when the current/last computation started.
   */
  getMostRecentStartTime(): number | null {
    // Iterate through all edits to find the most recent "computing"
    // editsAt iterates in chronological order, so the last "computing" we see is the most recent
    let mostRecentStartTime: number | null = null;
    for (const edit of this.raw.editsAt("$internalComputationState")) {
      if (edit.value === "computing") {
        mostRecentStartTime = edit.at.getTime();
      }
    }
    return mostRecentStartTime;
  }

  /**
   * Get the madeAt timestamp of the most recent "computing" state that
   * occurred before a given "computed" timestamp.
   * This finds the start time that corresponds to a specific completion.
   */
  getStartTimeForFinish(finishedAt: number): number | null {
    let lastStartTime: number | null = null;
    for (const edit of this.raw.editsAt("$internalComputationState")) {
      const editTime = edit.at.getTime();
      if (editTime > finishedAt) {
        break;
      }
      if (edit.value === "computing") {
        lastStartTime = editTime;
      }
    }
    return lastStartTime;
  }

  /**
   * Get the latest madeAt timestamp among all base shape properties,
   * including nested CoValues.
   */
  getLatestBaseEditTime(): number | null {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) return null;
    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);

    const resolvedResolvedDependenciesQuery =
      this.getResolvedDependenciesQuery();
    return this.getLatestEditTimeRecursive(
      this.coMap,
      resolvedResolvedDependenciesQuery,
      new Set<string>(),
      new Set(baseKeys),
    );
  }

  /**
   * Helper to get the latest edit madeAt time for a CoValue and its children recursively.
   */
  private getLatestEditTimeRecursive(
    coValue: any,
    resolveQuery: RefsToResolveForShape<Shape>,
    visitedSet: Set<string>,
    limitTopLevelKeys?: Set<string>,
  ): number | null {
    if (!coValue?.$jazz?.id)
      throw new Error("Expected a CoValue with $jazz.id");

    // Prevent infinite recursion
    if (visitedSet.has(coValue.$jazz.id)) return null;
    visitedSet.add(coValue.$jazz.id);

    let latestTime: number | null = null;

    if (
      typeof resolveQuery === "object" &&
      Object.keys(resolveQuery).length > 0
    ) {
      const coValueType = coValue[TypeSym];
      if (
        coValueType === "CoMap" ||
        coValueType === "Account" ||
        coValueType === "Group"
      ) {
        const map = coValue as unknown as CoMap;
        const keys =
          "$each" in resolveQuery
            ? map.$jazz.raw.keys()
            : Object.keys(resolveQuery);

        for (const key of keys) {
          if (key === "$onError") continue; // Skip $onError key if present

          // @ts-expect-error
          const childValue = map[key];
          if (childValue === undefined)
            throw new Error(
              `Invariant violation: resolved dependency "${key}" is not loaded`,
            );

          // @ts-expect-error
          const childQuery = resolveQuery[key] ?? resolveQuery.$each;

          const time = this.getLatestEditTimeRecursive(
            childValue,
            childQuery,
            visitedSet,
          );
          if (time !== null && (latestTime === null || time > latestTime)) {
            latestTime = time;
          }
        }
      } else if (coValue[TypeSym] === "CoList") {
        const list = coValue as unknown as CoList;

        const descriptor = list.$jazz.getItemsDescriptor();

        if (descriptor && isRefEncoded(descriptor)) {
          list.$jazz.raw.processNewTransactions();
          const entries = list.$jazz.raw.entries();
          const keys =
            "$each" in resolveQuery
              ? Object.keys(entries)
              : Object.keys(resolveQuery);

          for (const key of keys) {
            if (key === "$onError") continue; // Skip $onError key if present

            const childValue = list[Number(key)];
            if (childValue === undefined)
              throw new Error(
                `Invariant violation: resolved dependency "${key}" is not loaded`,
              );

            // @ts-expect-error
            const childQuery = resolveQuery[key] ?? resolveQuery.$each;

            const time = this.getLatestEditTimeRecursive(
              childValue,
              childQuery,
              visitedSet,
            );
            if (time !== null && (latestTime === null || time > latestTime)) {
              latestTime = time;
            }
          }
        }
      } // TODO: handle CoFeed (type === "CoStream")
    }

    // Check all base properties of this CoValue
    for (const key of Object.keys(coValue)) {
      if (limitTopLevelKeys && !limitTopLevelKeys.has(key)) continue; // Skip non-top-level properties if limitTopLevelKeys is provided

      const edit = coValue.$jazz.raw.lastEditAt(key as string);
      if (edit) {
        const editTime = edit.at.getTime();
        if (latestTime === null || editTime > latestTime) {
          latestTime = editTime;
        }
      }
    }

    return latestTime;
  }

  /**
   * Mark computation as started and return a time-pinned snapshot of the base shape.
   *
   * This method waits for the next millisecond to ensure a clean temporal boundary,
   * then sets $internalComputationState to "computing" and returns a time-pinned
   * view of the CoMap with only base shape properties, pinned to the moment just
   * before the computation started.
   *
   * The returned object includes `$jazz` so you can call `pinned.$jazz.finishComputation()`.
   *
   * The computation function should use this returned value to read base properties,
   * ensuring it operates on a consistent snapshot.
   */
  async startComputation(): Promise<
    StaticResolved<Shape, ResolvedDependenciesQuery> & {
      $jazz: {
        id: string;
        finishComputation: (init: CoMapSchemaInit<ComputedShape>) => void;
      };
    }
  > {
    // Wait for the next millisecond to create a clean temporal boundary
    const startTime = await waitForNextMs();

    // Set the computation state
    this.raw.set("$internalComputationState", "computing");

    // Return a time-pinned view of the base shape, pinned to startTime - 1
    const resolveQuery = this.getResolvedDependenciesQuery();
    const timePinned = this.getBaseShapeAtTime(startTime - 1, resolveQuery);

    // Attach finishComputation onto the $jazz object
    (timePinned.$jazz as any).finishComputation = (
      init: CoMapSchemaInit<ComputedShape>,
    ) => {
      this.finishComputation(init);
    };

    return timePinned as any;
  }

  startComputationUnstripped(): ResolvedFromShapeAndQuery<
    Shape,
    ResolvedDependenciesQuery
  > {
    throw new Error(
      "ComputedCoMap.startComputationUnstripped() is not supported. Use startComputation() instead.",
    );
  }

  /**
   * Mark computation as finished. Sets the computed properties and
   * updates $internalComputationState to "computed".
   * Should only be called from the object returned by startComputation() to ensure proper timing.
   */
  private finishComputation(init: CoMapSchemaInit<ComputedShape>): void {
    // Set all computed properties
    if (Object.keys(init).length > 0) {
      this.applyDiff({ ...init } as any);
    }
    // Mark computation as complete
    this.raw.set("$internalComputationState", "computed");
  }

  /**
   * Get a time-pinned view of just the base shape properties.
   * Computed properties are not included in the returned object.
   * Includes `$jazz` API for calling `finishComputation()`.
   *
   * Child CoValues are also time-pinned to the same timestamp.
   *
   * @param time - The timestamp to pin to (edits with madeAt <= time are included)
   */
  private getBaseShapeAtTime(
    time: number,
    resolveQuery: RefsToResolveForShape<Shape>,
  ): StaticResolved<Shape, ResolvedDependenciesQuery> {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) {
      throw new Error("Cannot get base shape: schema not found");
    }

    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);

    const timePinned = this.createTimePinnedCoValue(
      this.coMap,
      time,
      resolveQuery,
    );

    // Filter down to only base shape properties
    const result: Record<string, any> = {};
    for (const key of baseKeys) {
      // @ts-expect-error - indexing with base shape keys
      result[key] = timePinned[key];
    }

    // Attach minimal $jazz with just the id
    Object.defineProperty(result, "$jazz", {
      value: { id: this.coMap.$jazz.id },
      enumerable: false,
    });

    return result as any;
  }

  /**
   * Create a time-pinned view of a CoValue.
   * The returned object has all properties pinned to the specified time,
   * and nested CoValues are recursively pinned as well.
   *
   * @param coValue - The CoValue to create a time-pinned view of
   * @param time - The timestamp to pin to
   */
  private createTimePinnedCoValue<PinnedShape extends z.core.$ZodLooseShape>(
    coValue: any,
    time: number,
    resolveQuery: RefsToResolveForShape<PinnedShape>,
  ): StaticResolved<PinnedShape, RefsToResolveForShape<PinnedShape>> {
    if (!coValue?.$jazz?.raw) {
      return coValue;
    }

    // Create a time-filtered view of this CoValue's raw
    const timeFilteredRaw = coValue.$jazz.raw.atTime(time);

    // Build a plain object with all own properties as raw time-pinned values
    const result: Record<string, any> & { $jazz: { id: string } } = {
      $jazz: { id: coValue.$jazz.id },
    };

    const keys = Object.keys(coValue).filter(
      (k) => !k.startsWith("$") && k !== "constructor",
    );

    for (const key of keys) {
      result[key] = timeFilteredRaw.get(key);
    }

    // Recursively pin children referenced in the resolve query
    if (
      typeof resolveQuery === "object" &&
      Object.keys(resolveQuery).length > 0
    ) {
      const coValueType = coValue[TypeSym];
      if (
        coValueType === "CoMap" ||
        coValueType === "Account" ||
        coValueType === "Group"
      ) {
        const queryKeys =
          "$each" in resolveQuery
            ? Object.keys(coValue).filter((k) => !k.startsWith("$"))
            : Object.keys(resolveQuery);

        for (const key of queryKeys) {
          if (key === "$onError") continue;

          const childValue = (coValue as any)[key];
          // @ts-expect-error - query key access
          const childQuery = resolveQuery[key] ?? resolveQuery.$each;

          if (childValue?.$jazz?.id) {
            result[key] = this.createTimePinnedCoValue(
              childValue,
              time,
              childQuery,
            );
          } else if (childValue === undefined) {
            // Child not loaded — create a dummy with just the id
            const rawRef = timeFilteredRaw.get(key);
            result[key] = { $jazz: { id: rawRef } };
          }
        }
      } else if (coValue[TypeSym] === "CoList") {
        const list = coValue as unknown as CoList;
        const descriptor = list.$jazz.getItemsDescriptor();

        if (descriptor && isRefEncoded(descriptor)) {
          list.$jazz.raw.processNewTransactions();
          const entries = list.$jazz.raw.entries();
          const queryKeys =
            "$each" in resolveQuery
              ? Object.keys(entries)
              : Object.keys(resolveQuery);

          for (const key of queryKeys) {
            if (key === "$onError") continue;

            const childValue = list[Number(key)];
            // @ts-expect-error - query key access
            const childQuery = resolveQuery[key] ?? resolveQuery.$each;

            if (childValue?.$jazz?.id) {
              result[key] = this.createTimePinnedCoValue(
                childValue,
                time,
                childQuery,
              );
            } else if (childValue === undefined) {
              const rawRef = entries[Number(key)];
              result[key] = { $jazz: { id: rawRef } };
            }
          }
        }
      }
    }

    return result as any;
  }
}
