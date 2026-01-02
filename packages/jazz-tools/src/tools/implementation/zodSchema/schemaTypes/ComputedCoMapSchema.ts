import { CoValueUniqueness } from "cojson";
import { ComputedCoMap } from "../../../coValues/calculatedCoMap.js";
import { Account, CoMap, Group } from "../../../internal.js";
import { CoMapSchemaInit } from "../typeConverters/CoFieldSchemaInit.js";
import { z } from "../zodReExport.js";
import { AnyZodOrCoValueSchema } from "../zodSchema";
import { CoMapInstanceShape, CoMapSchema } from "./CoMapSchema";
import { CoreResolveQuery } from "./CoValueSchema";

export class ComputedCoMapSchema<
  Shape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown = unknown,
  Owner extends Account | Group = Account | Group,
  DefaultResolveQuery extends CoreResolveQuery = true,
> extends CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> {
  create(
    init: CoMapSchemaInit<Shape>,
    options?:
      | {
          owner?: Group;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Group,
  ): CoMapInstanceShape<Shape, CatchAll> & CoMap;
  /** @deprecated Creating CoValues with an Account as owner is deprecated. Use a Group instead. */
  create(
    init: CoMapSchemaInit<Shape>,
    options?:
      | {
          owner?: Owner;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Owner,
  ): CoMapInstanceShape<Shape, CatchAll> & CoMap;
  create(init: any, options?: any) {
    return super.create(init, options);
  }
}

export function withComputationForSchema<
  Shape extends z.core.$ZodLooseShape,
  CatchAll extends AnyZodOrCoValueSchema | unknown,
  Owner extends Account | Group,
  DefaultResolveQuery extends CoreResolveQuery,
>(
  baseSchema: CoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery>,
  computation: (self: CoMapInstanceShape<Shape, CatchAll> & ComputedCoMap) => {
    stopListening: () => void;
  },
): ComputedCoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery> {
  const coreSchema = {
    builtin: "CoMap" as const,
    collaborative: true as const,
    shape: baseSchema.shape,
    catchAll: baseSchema.catchAll,
    getDefinition: baseSchema.getDefinition,
  };

  const computedSchema = new ComputedCoMapSchema(
    coreSchema as any,
    ComputedCoMap as typeof CoMap,
  ) as ComputedCoMapSchema<Shape, CatchAll, Owner, DefaultResolveQuery>;

  (computedSchema as any).resolveQuery = (baseSchema as any).resolveQuery;
  (computedSchema as any).permissions = (baseSchema as any).permissions;
  (computedSchema as any)._computation = computation;

  return computedSchema;
}
