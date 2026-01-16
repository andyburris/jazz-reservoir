import { RawCoMap } from "cojson";
import { ComputedCoMapInstanceCoValuesMaybeLoaded } from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";
import { z } from "../implementation/zodSchema/zodReExport";
import {
  BranchDefinition,
  CoMapSchemaInit,
  parseSubscribeRestArgs,
  RefsToResolve,
  RefsToResolveStrict,
  Resolved,
  Simplify,
  SubscribeRestArgs,
} from "../internal";
import { CoMap, CoMapJazzApi } from "./coMap";

export class ComputedCoMap<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
> extends CoMap {
  declare $jazz: ComputedCoMapJazzApi<Shape, ComputedShape, this>;

  public get $isComputed(): boolean {
    // $isComputed is true when all of the properties in the computed shape have been set
    // more recently than any property in the base shape (including edits to loaded child CoValues)

    // Access the ComputedCoMapSchema to get shape information
    const schema = (this.constructor as any)._computedCoMapSchema;
    if (!schema) return false;

    const def = schema.getDefinition();
    const baseKeys = Object.keys(def.shape);
    const computedKeys = Object.keys(schema.computedShape);

    // Track visited CoValues to prevent infinite recursion
    const visited = new Set<string>();
    visited.add(this.$jazz.id);

    // Helper function to get the latest edit time for a CoValue and its children
    const getLatestEditRecursive = (
      coValue: any,
      visitedSet: Set<string>,
    ): number | null => {
      if (!coValue?.$jazz?.id) return null;

      // Prevent infinite recursion
      if (visitedSet.has(coValue.$jazz.id)) return null;
      visitedSet.add(coValue.$jazz.id);

      let latestEditIndex: number | null = null;

      // Check all properties of this CoValue
      for (const key of Object.keys(coValue)) {
        const edit = coValue.$jazz.raw.lastEditAt(key as string);
        if (edit?.tx.txIndex) {
          if (!latestEditIndex || edit.tx.txIndex > latestEditIndex) {
            latestEditIndex = edit.tx.txIndex;
          }

          // If this property is a loaded CoValue, check its edits recursively
          const value = coValue[key];
          if (value?.$jazz?.id && typeof value === "object") {
            const childLatest = getLatestEditRecursive(value, visitedSet);
            if (
              childLatest &&
              (!latestEditIndex || childLatest > latestEditIndex)
            ) {
              latestEditIndex = childLatest;
            }
          }
        }
      }

      return latestEditIndex;
    };

    // Find the most recent edit time in the base shape (including children)
    let latestBaseEditIndex: number | null = null;
    for (const key of baseKeys) {
      const edit = this.$jazz.raw.lastEditAt(key as string);
      if (edit?.tx.txIndex) {
        if (!latestBaseEditIndex || edit.tx.txIndex > latestBaseEditIndex) {
          latestBaseEditIndex = edit.tx.txIndex;
        }
      }

      // Check if this property is a loaded child CoValue
      const value = (this as any)[key];
      // console.log(`checking edits for this.${key} =`, value)
      if (value?.$jazz?.id && typeof value === "object") {
        const childLatest = getLatestEditRecursive(value, new Set(visited));
        if (
          childLatest &&
          (!latestBaseEditIndex || childLatest > latestBaseEditIndex)
        ) {
          latestBaseEditIndex = childLatest;
        }
      }
    }

    // Check if all computed properties exist and were set after the latest base edit
    for (const key of computedKeys) {
      const edit = this.$jazz.raw.lastEditAt(key as string);
      if (!edit?.tx) {
        // Computed property hasn't been set yet
        return false;
      }
      if (latestBaseEditIndex && edit.tx.txIndex <= latestBaseEditIndex) {
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
