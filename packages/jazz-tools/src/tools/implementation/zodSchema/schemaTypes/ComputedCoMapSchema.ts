import { CoValueUniqueness } from "cojson";
import { ComputedCoMap } from "../../../coValues/computedCoMap.js";
import {
  Account,
  CoMapSchemaInit,
  DiscriminableCoreCoValueSchema,
  Group,
  hydrateCoreCoValueSchema,
  InstanceOrPrimitiveOfSchema,
  InstanceOrPrimitiveOfSchemaCoValuesMaybeLoaded,
  RefsToResolveForShape,
  Resolved,
  Simplify,
} from "../../../internal.js";
import { z } from "../zodReExport.js";
import { AnyZodOrCoValueSchema } from "../zodSchema";
import {
  CoMapSchema,
  CoMapSchemaDefinition,
  createCoreCoMapSchema,
} from "./CoMapSchema";
import { CoreResolveQuery } from "./CoValueSchema";

export class ComputedCoMapSchema<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape = z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown = unknown,
  Owner extends Account | Group = Account | Group,
  DefaultResolveQuery extends CoreResolveQuery = true,
  ResolvedDepsQuery extends RefsToResolveForShape<Shape> = true,
> extends CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> {
  // @ts-expect-error - necessary override to keep CoMapSchema's methods but match CoreComputedCoMapSchema in typescript
  builtin: "ComputedCoMap" = "ComputedCoMap";
  computedShape!: ComputedShape;
  resolvedDependenciesQuery: ResolvedDepsQuery = true as ResolvedDepsQuery;
  _computation?: (
    self: Resolved<
      Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> &
        ComputedCoMap<Shape, ComputedShape, ResolvedDepsQuery>,
      true
    >,
  ) => { stopListening: () => void };

  /**
   * Specify which dependencies must be resolved before the value is visible to consumers.
   * The query uses the same format as .resolved() but can also reference computed properties.
   */
  withResolvedDependencies<const R extends RefsToResolveForShape<Shape>>(
    resolvedDependenciesQuery: R,
  ): ComputedCoMapSchema<
    Shape,
    ComputedShape,
    CatchAll,
    Owner,
    DefaultResolveQuery,
    R
  > {
    // @ts-expect-error TS cannot infer that the resolvedDepsQuery type is valid
    const copy: ComputedCoMapSchema<
      Shape,
      ComputedShape,
      CatchAll,
      Owner,
      DefaultResolveQuery,
      R
      // @ts-expect-error overriding shape - ComputedCoMapSchema builtin is "ComputedCoMap" not "CoMap"
    > = withComputedShapeForSchema(this, this.computedShape);
    // @ts-expect-error - can't resolve computation type, but it should be preserved on the copy
    copy._computation = this._computation;
    copy.resolvedDependenciesQuery = resolvedDependenciesQuery as R;
    return copy;
  }

  /**
   * Set the computation function for this ComputedCoMap.
   * Preserves the existing computedShape.
   */
  // @ts-expect-error overriding shape
  withComputation(
    computation: (
      self: Resolved<
        Simplify<
          ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>
        > &
          // // @ts-expect-error ResolvedDepsQuery is CoreResolveQuery, ComputedCoMap expects RefsToResolve<Shape> — compatible at runtime
          ComputedCoMap<Shape, ComputedShape, ResolvedDepsQuery>,
        true
      >,
    ) => { stopListening: () => void },
  ): ComputedCoMapSchema<
    Shape,
    ComputedShape,
    CatchAll,
    Owner,
    DefaultResolveQuery,
    ResolvedDepsQuery
  > {
    const result = withComputationFunctionForSchema(
      // @ts-expect-error overriding shape
      this,
      this.computedShape,
      computation,
    );
    result.resolvedDependenciesQuery = this.resolvedDependenciesQuery as any;
    return result as any;
  }

  // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  override create(
    init: CoMapSchemaInit<Shape>,
    options?:
      | {
          owner?: Group;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Group,
  ): ComputedCoMapInstanceShape<Shape, ComputedShape, CatchAll> &
    ComputedCoMap<Shape, ComputedShape, ResolvedDepsQuery>;
  // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  override create(
    init: any,
    options?: any,
  ): ComputedCoMapInstanceShape<Shape, ComputedShape, CatchAll> &
    ComputedCoMap<Shape, ComputedShape, ResolvedDepsQuery>;
  // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  override create(init: any, options?: any) {
    const initWithComputed = { ...init, $internalComputationState: null };
    return super.create(initWithComputed, options) as any;
  }

  // // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  // override load<
  //   const R extends RefsToResolve<
  //     Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> & ComputedCoMap
  //   > = DefaultResolveQuery,
  // >(
  //   id: string,
  //   options?: {
  //     resolve?: RefsToResolveStrict<
  //       Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> & ComputedCoMap,
  //       R
  //     >;
  //     loadAs?: Account | AnonymousJazzAgent;
  //     skipRetry?: boolean;
  //     unstable_branch?: BranchDefinition;
  //   },
  // ): Promise<
  //   Settled<
  //     Resolved<Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> & ComputedCoMap, R>
  //   >
  // > {
  //   return super.load(id, options as any) as any;
  // }

  // // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  // override subscribe<
  //   const R extends RefsToResolve<
  //     Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> & ComputedCoMap
  //   > = DefaultResolveQuery,
  // >(
  //   id: string,
  //   options: SubscribeListenerOptions<
  //     Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> & ComputedCoMap,
  //     R
  //   >,
  //   listener: (
  //     value: Resolved<
  //       Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> & ComputedCoMap,
  //       R
  //     >,
  //     unsubscribe: () => void,
  //   ) => void,
  // ): () => void {
  //   return super.subscribe(id, options as any, listener as any);
  // }
}

// less precise version to avoid circularity issues and allow matching against
export interface CoreComputedCoMapSchema<
  Shape extends z.core.$ZodLooseShape = z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape = z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown = unknown,
> extends DiscriminableCoreCoValueSchema {
  builtin: "ComputedCoMap";
  shape: Shape;
  computedShape: ComputedShape;
  catchAll?: CatchAll;
  getDefinition: () => CoMapSchemaDefinition;
}

/**
 * Creates a ComputedCoMapSchema with only computed shape (no computation function).
 * Used by CoMapSchema.withComputed()
 */
export function withComputedShapeForSchema<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown,
  Owner extends Account | Group,
  DefaultResolveQuery extends CoreResolveQuery,
>(
  baseSchema: CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery>,
  computedShape: ComputedShape,
): ComputedCoMapSchema<
  Shape,
  ComputedShape,
  CatchAll,
  Owner,
  DefaultResolveQuery
> {
  const coreSchema = createCoreCoMapSchema(
    baseSchema.shape,
    baseSchema.catchAll,
  );

  // @ts-expect-error TS cannot infer that the resolveQuery type is valid
  const copy: ComputedCoMapSchema<
    Shape,
    ComputedShape,
    CatchAll,
    Owner,
    DefaultResolveQuery
  > = hydrateCoreCoValueSchema({
    ...coreSchema,
    builtin: "ComputedCoMap",
    computedShape,
  });

  copy.resolveQuery = baseSchema.resolveQuery;
  copy.setPermissions(baseSchema.permissions);
  copy.computedShape = computedShape;
  // Preserve resolvedDependenciesQuery if the base schema is a ComputedCoMapSchema
  if (baseSchema instanceof ComputedCoMapSchema) {
    copy.resolvedDependenciesQuery = (
      baseSchema as any
    ).resolvedDependenciesQuery;
  }
  // _computation is left undefined

  return copy;
}

/**
 * Creates a ComputedCoMapSchema with a computation function.
 * Used by CoMapSchema.withComputation() and ComputedCoMapSchema.withComputation()
 */
export function withComputationFunctionForSchema<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown,
  Owner extends Account | Group,
  DefaultResolveQuery extends CoreResolveQuery,
  ResolvedDepsQuery extends RefsToResolveForShape<Shape>,
>(
  baseSchema: CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery>,
  computedShape: ComputedShape,
  computation: (
    self: Resolved<
      Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> &
        ComputedCoMap<Shape, ComputedShape, ResolvedDepsQuery>,
      true
    >,
  ) => {
    stopListening: () => void;
  },
): ComputedCoMapSchema<
  Shape,
  ComputedShape,
  CatchAll,
  Owner,
  DefaultResolveQuery
> {
  const coreSchema = createCoreCoMapSchema(
    baseSchema.shape,
    baseSchema.catchAll,
  );

  // @ts-expect-error TS cannot infer that the resolveQuery type is valid
  const copy: ComputedCoMapSchema<
    Shape,
    ComputedShape,
    CatchAll,
    Owner,
    DefaultResolveQuery
  > = hydrateCoreCoValueSchema({
    ...coreSchema,
    builtin: "ComputedCoMap",
    computedShape,
  });

  copy.resolveQuery = baseSchema.resolveQuery;
  copy.setPermissions(baseSchema.permissions);
  copy.computedShape = computedShape;
  // @ts-expect-error - can't resolve computation type, but it should be preserved on the copy
  copy._computation = computation;
  // Preserve resolvedDependenciesQuery if the base schema is a ComputedCoMapSchema
  if (baseSchema instanceof ComputedCoMapSchema) {
    copy.resolvedDependenciesQuery = (
      baseSchema as any
    ).resolvedDependenciesQuery;
  }

  return copy;
}

export type ComputedCoMapInstanceShape<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown = unknown,
> = (
  | Simplify<
      {
        readonly [key in keyof Shape]: InstanceOrPrimitiveOfSchema<Shape[key]>;
      } & {
        readonly $isComputed: false;
      }
    >
  | Simplify<
      {
        readonly [key in keyof Shape]: InstanceOrPrimitiveOfSchema<Shape[key]>;
      } & {
        readonly [key in keyof ComputedShape]: InstanceOrPrimitiveOfSchema<
          ComputedShape[key]
        >;
      } & {
        readonly $isComputed: true;
      }
    >
) &
  (CatchAll extends AnyZodOrCoValueSchema
    ? {
        readonly [key: string]: InstanceOrPrimitiveOfSchema<CatchAll>;
      }
    : {});

export type ComputedCoMapInstanceCoValuesMaybeLoaded<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
> =
  | Simplify<
      {
        readonly [key in keyof Shape]: InstanceOrPrimitiveOfSchemaCoValuesMaybeLoaded<
          Shape[key]
        >;
      } & {
        readonly $isComputed: false;
      }
    >
  | Simplify<
      {
        readonly [key in keyof Shape]: InstanceOrPrimitiveOfSchemaCoValuesMaybeLoaded<
          Shape[key]
        >;
      } & {
        readonly [key in keyof ComputedShape]: InstanceOrPrimitiveOfSchemaCoValuesMaybeLoaded<
          ComputedShape[key]
        >;
      } & {
        readonly $isComputed: true;
      }
    >;

// /**
//  * Type representing the full shape of a ComputedCoMap with both base and computed properties merged.
//  * Used only for typing the `withResolvedDependencies` query parameter and `RefsToResolve` key derivation.
//  * This does NOT replace the discriminated union instance types.
//  */
// export type ComputedCoMapFullShape<
//   Shape extends z.core.$ZodLooseShape,
//   ComputedShape extends z.core.$ZodLooseShape,
// > = Simplify<
//   {
//     readonly [key in keyof Shape]: InstanceOrPrimitiveOfSchemaCoValuesMaybeLoaded<
//       Shape[key]
//     >;
//   } & {
//     readonly [key in keyof ComputedShape]: InstanceOrPrimitiveOfSchemaCoValuesMaybeLoaded<
//       ComputedShape[key]
//     >;
//   }
// > &
//   Omit<ComputedCoMap<Shape, ComputedShape>, "$isComputed">;
