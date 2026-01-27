import { CoValueUniqueness, RawCoMap } from "cojson";
import {
  ComputedCoMapBaseShape,
  ComputedCoMapInstanceCoValuesMaybeLoaded,
  ComputedCoMapInstanceShape,
} from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";
import { z } from "../implementation/zodSchema/zodReExport";
import {
  Account,
  BranchDefinition,
  CoMapSchemaInit,
  CoValueClass,
  Group,
  parseCoValueCreateOptions,
  parseSubscribeRestArgs,
  RefsToResolve,
  RefsToResolveStrict,
  Resolved,
  Simplify,
  SubscribeRestArgs,
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
> extends CoMap {
  declare $jazz: ComputedCoMapJazzApi<Shape, ComputedShape, this>;

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
      ComputedShape
    >;
    if (options) {
      if ("fromRaw" in options) {
        Object.defineProperties(this, {
          $jazz: {
            value: new ComputedCoMapJazzApi(proxy, () => options.fromRaw),
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
  M extends ComputedCoMap<Shape, ComputedShape>,
> extends CoMapJazzApi<M> {
  declare isComputed: true;
  static {
    this.prototype["isComputed"] = true;
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
   * If no computation has completed:
   * - If computation is in progress: returns base shape pinned to startedAt - 1
   * - If never started: returns current state
   */
  get lastComputedValue(): Simplify<
    ComputedCoMapInstanceShape<Shape, ComputedShape>
  > &
    ComputedCoMap<Shape, ComputedShape> {
    const state = this.getComputationState();

    if (!state) {
      // Never started - return current state
      return this.coMap as any;
    }

    if (state.status === "computing") {
      // Started but not finished - return base shape pinned to startedAt - 1
      const startedAt = state.madeAt;
      // Return a composite that has base props pinned, no computed props
      return this.getBaseShapeAtTime(startedAt - 1) as any;
    }

    // Completed - find the startedAt that corresponds to this finishedAt
    const finishedAt = state.madeAt;
    const startedAt = this.getStartTimeForFinish(finishedAt);

    if (!startedAt) {
      // Shouldn't happen, but fallback to current state
      return this.coMap as any;
    }

    // Build composite: base props from startedAt - 1, computed props from finishedAt
    return this.getCompositeSnapshot(startedAt - 1, finishedAt);
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
    ComputedCoMap<Shape, ComputedShape> {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) {
      return this.coMap as any;
    }

    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);
    const computedKeys = Object.keys(schema.computedShape);

    // Create time-filtered views
    const baseFilteredRaw = this.raw.atTime(baseTime);
    const computedFilteredRaw = this.raw.atTime(computedTime);

    // Build the composite object
    const result: Record<string, any> = {};

    // Add base shape properties from baseTime
    for (const key of baseKeys) {
      const rawValue = baseFilteredRaw.get(key);
      const currentValue = (this.coMap as any)[key];

      if (currentValue?.$jazz?.id && typeof currentValue === "object") {
        // TODO: Create time-pinned child CoValue
        result[key] = currentValue;
      } else {
        result[key] = rawValue;
      }
    }

    // Add computed shape properties from computedTime
    for (const key of computedKeys) {
      result[key] = computedFilteredRaw.get(key);
    }

    // Add $isComputed based on current state
    Object.defineProperty(result, "$isComputed", {
      get: () => this.coMap.$isComputed,
      enumerable: true,
    });

    // Add $jazz API
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
      ComputedCoMap<Shape, ComputedShape>,
    const R extends RefsToResolve<Map> = true,
  >(
    listener: (value: Resolved<Map, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<
    Map extends Simplify<
      ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>
    > &
      ComputedCoMap<Shape, ComputedShape>,
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
      ComputedCoMap<Shape, ComputedShape>,
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

    // Track visited CoValues to prevent infinite recursion
    const visited = new Set<string>();
    visited.add(this.id);

    let latestTime: number | null = null;

    for (const key of baseKeys) {
      const edit = this.raw.lastEditAt(key);
      if (edit) {
        const editTime = edit.at.getTime();
        if (latestTime === null || editTime > latestTime) {
          latestTime = editTime;
        }
      }

      // Check if this property is a loaded child CoValue
      const value = (this.coMap as any)[key];
      if (value?.$jazz?.id && typeof value === "object") {
        const childLatest = this.getLatestEditTimeRecursive(
          value,
          new Set(visited),
        );
        if (
          childLatest !== null &&
          (latestTime === null || childLatest > latestTime)
        ) {
          latestTime = childLatest;
        }
      }
    }

    return latestTime;
  }

  /**
   * Helper to get the latest edit madeAt time for a CoValue and its children recursively.
   */
  private getLatestEditTimeRecursive(
    coValue: any,
    visitedSet: Set<string>,
  ): number | null {
    if (!coValue?.$jazz?.id) return null;

    // Prevent infinite recursion
    if (visitedSet.has(coValue.$jazz.id)) return null;
    visitedSet.add(coValue.$jazz.id);

    let latestTime: number | null = null;

    // Check all properties of this CoValue
    for (const key of Object.keys(coValue)) {
      const edit = coValue.$jazz.raw.lastEditAt(key as string);
      if (edit) {
        const editTime = edit.at.getTime();
        if (latestTime === null || editTime > latestTime) {
          latestTime = editTime;
        }

        // If this property is a loaded CoValue, check its edits recursively
        const value = coValue[key];
        if (value?.$jazz?.id && typeof value === "object") {
          const childLatest = this.getLatestEditTimeRecursive(
            value,
            visitedSet,
          );
          if (
            childLatest !== null &&
            (latestTime === null || childLatest > latestTime)
          ) {
            latestTime = childLatest;
          }
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
    ComputedCoMapBaseShape<Shape> & {
      $jazz: ComputedCoMapJazzApi<Shape, ComputedShape, M>;
    }
  > {
    // Wait for the next millisecond to create a clean temporal boundary
    const startTime = await waitForNextMs();

    // Set the computation state
    this.raw.set("$internalComputationState", "computing");

    // Return a time-pinned view of the base shape, pinned to startTime - 1
    // This includes all edits that happened before we started waiting
    return this.getBaseShapeAtTime(startTime - 1);
  }

  /**
   * Mark computation as finished. Sets the computed properties and
   * updates $internalComputationState to "computed".
   */
  finishComputation(init: CoMapSchemaInit<ComputedShape>): void {
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
   * @param time - The timestamp to pin to (edits with madeAt <= time are included)
   */
  getBaseShapeAtTime(
    time: number,
  ): ComputedCoMapBaseShape<Shape> & {
    $jazz: ComputedCoMapJazzApi<Shape, ComputedShape, M>;
  } {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) {
      throw new Error("Cannot get base shape: schema not found");
    }

    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);

    // Create a time-filtered view of the raw CoMap
    const timeFilteredRaw = this.raw.atTime(time);

    // Build an object with only the base shape properties
    const result: Record<string, any> = {};
    for (const key of baseKeys) {
      // Get the value from the time-filtered raw
      const rawValue = timeFilteredRaw.get(key);

      // If it's a CoValue reference, we need to load and pin the child too
      // For now, we return the raw value; nested pinning is a TODO
      const currentValue = (this.coMap as any)[key];
      if (currentValue?.$jazz?.id && typeof currentValue === "object") {
        // TODO: Create time-pinned child CoValue
        // For now, return the current loaded child (not pinned)
        result[key] = currentValue;
      } else {
        result[key] = rawValue;
      }
    }

    // Add $jazz API so finishComputation can be called on the pinned object
    Object.defineProperty(result, "$jazz", {
      value: this,
      enumerable: false,
    });

    return result as ComputedCoMapBaseShape<Shape> & {
      $jazz: ComputedCoMapJazzApi<Shape, ComputedShape, M>;
    };
  }
}
