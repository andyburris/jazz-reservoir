import { beforeEach, describe, expect, test } from "vitest";
import { co, z } from "../exports";
import { ComputedCoMapInstanceShape } from "../implementation/zodSchema/schemaTypes/ComputedCoMapSchema";
import { createJazzTestAccount, setupJazzTestSync } from "../testing";

const Child = co.map({ text: z.string() });
const UnresolvedParent = co
  .map({
    child: Child,
  })
  .withComputed({ wordCount: z.number() });

const query = { child: true };
const ResolvedParent = UnresolvedParent.withResolvedDependencies(query);

const unresolvedDependencyQuery = UnresolvedParent.resolvedDependenciesQuery;
const resolvedDependencyQuery = ResolvedParent.resolvedDependenciesQuery;

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
