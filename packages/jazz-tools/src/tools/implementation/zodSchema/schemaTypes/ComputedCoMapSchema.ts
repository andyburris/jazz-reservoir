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
> extends CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> {
  // @ts-expect-error - necessary override to keep CoMapSchema's methods but match CoreComputedCoMapSchema in typescript
  builtin: "ComputedCoMap" = "ComputedCoMap";
  computedShape!: ComputedShape;
  _computation!: (
    self: Resolved<
      Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> &
        ComputedCoMap<Shape, ComputedShape>,
      true
    >,
  ) => { stopListening: () => void };

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
    ComputedCoMap<Shape, ComputedShape>;
  // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  override create(
    init: any,
    options?: any,
  ): ComputedCoMapInstanceShape<Shape, ComputedShape, CatchAll> &
    ComputedCoMap<Shape, ComputedShape>;
  // @ts-expect-error - ComputedCoMapSchema intentionally narrows return types to discriminated union
  override create(init: any, options?: any) {
    const initWithComputed = { ...init /*$isComputed: false*/ };
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

export function withComputationForSchema<
  Shape extends z.core.$ZodLooseShape,
  ComputedShape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown,
  Owner extends Account | Group,
  DefaultResolveQuery extends CoreResolveQuery,
>(
  baseSchema: CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery>,
  computedShape: ComputedShape,
  computation: (
    self: Resolved<
      Simplify<ComputedCoMapInstanceCoValuesMaybeLoaded<Shape, ComputedShape>> &
        ComputedCoMap<Shape, ComputedShape>,
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
  copy.permissions = baseSchema.permissions;
  copy.computedShape = computedShape;
  copy._computation = computation;

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
