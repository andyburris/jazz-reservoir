import { CoValueUniqueness } from "cojson";
import { ComputedCoMap } from "../../../coValues/computedCoMap.js";
import {
  Account,
  CoMapSchemaInit,
  DiscriminableCoreCoValueSchema,
  Group,
  hydrateCoreCoValueSchema,
  Resolved,
  Simplify,
  withSchemaPermissions,
} from "../../../internal.js";
import { z } from "../zodReExport.js";
import { AnyZodOrCoValueSchema } from "../zodSchema";
import {
  CoMapInstanceCoValuesMaybeLoaded,
  CoMapInstanceShape,
  CoMapSchema,
  CoMapSchemaDefinition,
  CoreCoMapSchema,
  createCoreCoMapSchema,
} from "./CoMapSchema";
import { CoreResolveQuery } from "./CoValueSchema";

export class ComputedCoMapSchema<
  Shape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown = unknown,
  Owner extends Account | Group = Account | Group,
  DefaultResolveQuery extends CoreResolveQuery = true,
> extends CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> {
  _computation!: (
    self: Resolved<
      Simplify<CoMapInstanceCoValuesMaybeLoaded<Shape>> & ComputedCoMap,
      true
    >,
  ) => { stopListening: () => void };
}

// less precise version to avoid circularity issues and allow matching against
export interface CoreComputedCoMapSchema<
  Shape extends z.core.$ZodLooseShape = z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown = unknown,
> extends DiscriminableCoreCoValueSchema {
  builtin: "ComputedCoMap";
  shape: Shape;
  catchAll?: CatchAll;
  getDefinition: () => CoMapSchemaDefinition;
}

export function withComputationForSchema<
  Shape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown,
  Owner extends Account | Group,
  DefaultResolveQuery extends CoreResolveQuery,
>(
  baseSchema: CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery>,
  computation: (
    self: Resolved<
      Simplify<CoMapInstanceCoValuesMaybeLoaded<Shape>> & ComputedCoMap,
      true
    >,
  ) => {
    stopListening: () => void;
  },
): ComputedCoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> {
  const coreSchema = createCoreCoMapSchema(
    baseSchema.shape,
    baseSchema.catchAll,
  );
  const copy: ComputedCoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> =
    hydrateCoreCoValueSchema({ ...coreSchema, builtin: "ComputedCoMap" });

  copy.resolveQuery = baseSchema.resolveQuery;
  copy.permissions = baseSchema.permissions;
  copy._computation = computation;

  return copy;
}
