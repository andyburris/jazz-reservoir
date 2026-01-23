import { CoValueUniqueness, RawCoMap } from "cojson";
import {
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

export class ComputedCoMap<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
> extends CoMap {
  declare $jazz: ComputedCoMapJazzApi<Shape, ComputedShape, this>;

  public get $isComputed(): boolean {
    // $isComputed is true when all of the properties in the computed shape have been set
    // more recently than any property in the base shape (including edits to loaded child CoValues)
    const latestUncomputedEdit = this.$jazz.getLatestUncomputedEdit();
    const computedEdits = this.$jazz.getComputedEdits();

    // Check if all computed properties exist and were set after the latest uncomputed edit
    for (const edit of computedEdits.values()) {
      if (!edit) {
        // Computed property hasn't been set yet
        return false;
      }
      if (
        latestUncomputedEdit &&
        edit.txIndex <= latestUncomputedEdit.txIndex
      ) {
        // Computed property is stale
        return false;
      }
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

type EditInfo = { txIndex: number; madeAt: number };

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
   * Get the most recent edit among all uncomputed (base shape) keys,
   * including edits to nested loaded CoValues.
   */
  getLatestUncomputedEdit(): EditInfo | null {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) return null;

    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);

    // Track visited CoValues to prevent infinite recursion
    const visited = new Set<string>();
    visited.add(this.id);

    let latestEdit: EditInfo | null = null;

    for (const key of baseKeys) {
      const edit = this.raw.lastEditAt(key as string);
      if (edit?.tx.txIndex) {
        if (!latestEdit || edit.tx.txIndex > latestEdit.txIndex) {
          latestEdit = { txIndex: edit.tx.txIndex, madeAt: edit.at.getTime() };
        }
      }

      // Check if this property is a loaded child CoValue
      const value = (this.coMap as any)[key];
      if (value?.$jazz?.id && typeof value === "object") {
        const childLatest = this.getLatestEditRecursive(
          value,
          new Set(visited),
        );
        if (
          childLatest &&
          (!latestEdit || childLatest.txIndex > latestEdit.txIndex)
        ) {
          latestEdit = childLatest;
        }
      }
    }

    return latestEdit;
  }

  /**
   * Get the edits for each computed key. Returns a Map where values are
   * null if the computed property hasn't been set yet.
   */
  getComputedEdits(): Map<string, EditInfo | null> {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    const result = new Map<string, EditInfo | null>();
    if (!schema) return result;

    const computedKeys = Object.keys(schema.computedShape);

    for (const key of computedKeys) {
      const edit = this.raw.lastEditAt(key as string);
      if (edit?.tx) {
        result.set(key, {
          txIndex: edit.tx.txIndex,
          madeAt: edit.at.getTime(),
        });
      } else {
        result.set(key, null);
      }
    }

    return result;
  }

  /**
   * Find the oldest computed edit timestamp. This represents the time when
   * the computation was completed (all computed keys were set).
   * Returns null if any computed key has never been set.
   */
  getOldestComputedEdit(): EditInfo | null {
    const computedEdits = this.getComputedEdits();
    let oldestEdit: EditInfo | null = null;

    for (const edit of computedEdits.values()) {
      if (!edit) {
        // A computed property hasn't been set yet
        return null;
      }
      if (!oldestEdit || edit.txIndex < oldestEdit.txIndex) {
        oldestEdit = edit;
      }
    }

    return oldestEdit;
  }

  /**
   * Get the latest uncomputed edit that occurred before (or at) a given txIndex.
   * This is useful for finding the state of uncomputed values at the time
   * when a computation completed.
   */
  getLatestUncomputedEditBefore(beforeTxIndex: number): EditInfo | null {
    const schema = (this.coMap.constructor as any)._computedCoMapSchema;
    if (!schema) return null;

    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);

    // Track visited CoValues to prevent infinite recursion
    const visited = new Set<string>();
    visited.add(this.id);

    let latestEdit: EditInfo | null = null;

    for (const key of baseKeys) {
      // Look through all edits at this key to find the latest one before the cutoff
      for (const edit of this.raw.editsAt(key as string)) {
        if (edit.tx.txIndex <= beforeTxIndex) {
          if (!latestEdit || edit.tx.txIndex > latestEdit.txIndex) {
            latestEdit = {
              txIndex: edit.tx.txIndex,
              madeAt: edit.at.getTime(),
            };
          }
        }
      }

      // Check if this property is a loaded child CoValue
      const value = (this.coMap as any)[key];
      if (value?.$jazz?.id && typeof value === "object") {
        const childLatest = this.getLatestEditRecursiveBefore(
          value,
          beforeTxIndex,
          new Set(visited),
        );
        if (
          childLatest &&
          (!latestEdit || childLatest.txIndex > latestEdit.txIndex)
        ) {
          latestEdit = childLatest;
        }
      }
    }

    return latestEdit;
  }

  /**
   * Helper to get the latest edit time for a CoValue and its children recursively.
   */
  private getLatestEditRecursive(
    coValue: any,
    visitedSet: Set<string>,
  ): EditInfo | null {
    if (!coValue?.$jazz?.id) return null;

    // Prevent infinite recursion
    if (visitedSet.has(coValue.$jazz.id)) return null;
    visitedSet.add(coValue.$jazz.id);

    let latestEdit: EditInfo | null = null;

    // Check all properties of this CoValue
    for (const key of Object.keys(coValue)) {
      const edit = coValue.$jazz.raw.lastEditAt(key as string);
      if (edit?.tx.txIndex) {
        if (!latestEdit || edit.tx.txIndex > latestEdit.txIndex) {
          latestEdit = { txIndex: edit.tx.txIndex, madeAt: edit.at.getTime() };
        }

        // If this property is a loaded CoValue, check its edits recursively
        const value = coValue[key];
        if (value?.$jazz?.id && typeof value === "object") {
          const childLatest = this.getLatestEditRecursive(value, visitedSet);
          if (
            childLatest &&
            (!latestEdit || childLatest.txIndex > latestEdit.txIndex)
          ) {
            latestEdit = childLatest;
          }
        }
      }
    }

    return latestEdit;
  }

  /**
   * Helper to get the latest edit time (before a cutoff) for a CoValue and its children recursively.
   */
  private getLatestEditRecursiveBefore(
    coValue: any,
    beforeTxIndex: number,
    visitedSet: Set<string>,
  ): EditInfo | null {
    if (!coValue?.$jazz?.id) return null;

    // Prevent infinite recursion
    if (visitedSet.has(coValue.$jazz.id)) return null;
    visitedSet.add(coValue.$jazz.id);

    let latestEdit: EditInfo | null = null;

    // Check all properties of this CoValue
    for (const key of Object.keys(coValue)) {
      // Look through all edits to find ones before the cutoff
      for (const edit of coValue.$jazz.raw.editsAt(key as string)) {
        if (edit.tx.txIndex <= beforeTxIndex) {
          if (!latestEdit || edit.tx.txIndex > latestEdit.txIndex) {
            latestEdit = {
              txIndex: edit.tx.txIndex,
              madeAt: edit.at.getTime(),
            };
          }

          // If this property is a loaded CoValue, check its edits recursively
          const value = coValue[key];
          if (value?.$jazz?.id && typeof value === "object") {
            const childLatest = this.getLatestEditRecursiveBefore(
              value,
              beforeTxIndex,
              visitedSet,
            );
            if (
              childLatest &&
              (!latestEdit || childLatest.txIndex > latestEdit.txIndex)
            ) {
              latestEdit = childLatest;
            }
          }
        }
      }
    }

    return latestEdit;
  }

  /**
   * Get the last computed state of this ComputedCoMap.
   * Returns a time-filtered view of the CoMap at the moment when
   * the computation was last completed, including nested CoValues
   * in their state at that time.
   *
   * If a computation has never completed, returns the current state.
   */
  get lastComputedValue(): Simplify<
    ComputedCoMapInstanceShape<Shape, ComputedShape>
  > &
    ComputedCoMap<Shape, ComputedShape> {
    // Find when the computation was completed (oldest computed edit)
    const oldestComputedEdit = this.getOldestComputedEdit();
    if (!oldestComputedEdit) {
      // console.log("no computed edit, this.coMap = ", this.coMap)
      // Computation has never completed, return current state
      return this.coMap as any;
    }

    // Use the oldest computed edit's madeAt as the snapshot time
    // This is when the computation was valid
    const snapshotTime = oldestComputedEdit.madeAt;

    // Create a time-filtered view of the raw CoMap
    const timeFilteredRaw = this.raw.atTime(snapshotTime);

    // Create a new instance with the time-filtered raw
    const Constructor = this.coMap.constructor as new (options: {
      fromRaw: RawCoMap;
    }) => M;
    const timeFilteredCoMap = new Constructor({ fromRaw: timeFilteredRaw });

    // TODO: For nested CoValues, we'd also need to apply atTime() to them.
    // This current implementation returns the time-filtered root CoMap,
    // but nested CoValues accessed through it may still show current values.
    // A complete solution would require wrapping property access to return
    // time-filtered children as well.

    return timeFilteredCoMap as any;
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

  finishComputation(init: CoMapSchemaInit<ComputedShape>): void {
    this.applyDiff({ ...init /* $isComputed: true */ } as any);
  }
}
