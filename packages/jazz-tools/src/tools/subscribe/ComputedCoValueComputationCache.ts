// TODO: make this a part of LocalNode in the cojson package in the future
// and store one in each LocalNode instance

import { LocalNode, RawCoValue } from "cojson";
import { ID, RefEncoded, SubscriptionScope } from "../internal";
import { ComputedCoMap } from "../coValues/computedCoMap";
import { get } from "svelte/store";

class ComputedCoValueComputationCache {
  nodes = new WeakMap<
    LocalNode,
    Map<ID<ComputedCoMap<any, any>>, ComputedCoValueComputationState>
  >();

  startComputation(
    subscriptionScope: SubscriptionScope<ComputedCoMap<any, any>>,
    coValue: ComputedCoMap<any, any>,
  ) {
    const computation = getComputationFromCoValue(coValue);

    // If no computation function (withComputed only, no withComputation),
    // skip automatic computation - user will call finishComputation manually
    if (!computation) {
      return;
    }

    const nodeCache = getOrCreateWeak(
      this.nodes,
      subscriptionScope.node,
      () =>
        new Map<ID<ComputedCoMap<any, any>>, ComputedCoValueComputationState>(),
    );
    const currentSubscriptionState = getOrCreate(
      nodeCache,
      coValue.$jazz.id,
      () => new ComputedCoValueComputationState(computation),
    );

    currentSubscriptionState.addSubscriber(subscriptionScope, coValue);
  }

  removeComputationSubscription(
    subscriptionScope: SubscriptionScope<ComputedCoMap<any, any>>,
    coValue: ComputedCoMap<any, any>,
  ) {
    const nodeCache = this.nodes.get(subscriptionScope.node);
    if (!nodeCache) return;

    const currentSubscriptionState = nodeCache.get(coValue.$jazz.id);
    if (!currentSubscriptionState) return;

    currentSubscriptionState.removeSubscriber(subscriptionScope);

    if (
      currentSubscriptionState["pendingSubscribers"].size === 0 &&
      !currentSubscriptionState["currentComputation"]
    ) {
      nodeCache.delete(coValue.$jazz.id);
    }

    if (nodeCache.size === 0) {
      this.nodes.delete(subscriptionScope.node);
    }
  }
}

class ComputedCoValueComputationState {
  constructor(
    private computation: (coMap: ComputedCoMap<any, any>) => {
      stopListening: () => void;
    },
  ) {}
  private currentComputationKey: SubscriptionScope<
    ComputedCoMap<any, any>
  > | null = null;
  private currentComputation: { stopListening: () => void } | null = null;
  private pendingSubscribers = new Map<
    SubscriptionScope<ComputedCoMap<any, any>>,
    ComputedCoMap<any, any>
  >();

  startNextComputation(): void {
    if (this.currentComputation) {
      throw new Error(
        "Computation should never be running when starting the next computation",
      );
    }

    const nextComputationId = this.pendingSubscribers.keys().next().value;
    if (nextComputationId) {
      // console.log("Starting computation for ComputedCoMap<any, any>, pending subscribers =", this.pendingSubscribers.size);
      const coValue = this.pendingSubscribers.get(nextComputationId)!;
      this.pendingSubscribers.delete(nextComputationId);
      this.currentComputationKey = nextComputationId;
      this.currentComputation = this.computation(coValue);
    } else {
      // console.log("Skipping computation start because there are no pending subscribers");
    }
  }

  addSubscriber(
    subscriptionScope: SubscriptionScope<ComputedCoMap<any, any>>,
    coValue: ComputedCoMap<any, any>,
  ) {
    // console.log(
    //     "addSubscriber called, this.pendingSubscribers =", this.pendingSubscribers.size,
    //     "this.currentComputation is running =", !!this.currentComputation,
    //     "this.currentComputation is queued =", !!this.currentComputationKey && !this.currentComputation,
    // );

    // TODO: do we need to check if already present?
    // I think since child updates create whole new CoMaps, we should not recreate the computation when it changes
    if (this.currentComputationKey === subscriptionScope) {
      return;
    }

    this.pendingSubscribers.set(subscriptionScope, coValue);

    if (!this.currentComputationKey) {
      this.startNextComputation();
    }
  }

  removeSubscriber(
    subscriptionScope: SubscriptionScope<ComputedCoMap<any, any>>,
  ): void {
    // console.log(
    //     "removeSubscriber called, this.pendingSubscribers =", this.pendingSubscribers.size,
    //     "this.currentComputation is running =", !!this.currentComputation,
    //     "this.currentComputation is queued =", !!this.currentComputationKey && !this.currentComputation,
    // );

    if (this.currentComputationKey == subscriptionScope) {
      this.currentComputationKey = null;
      this.currentComputation?.stopListening();
      this.currentComputation = null;

      this.startNextComputation();
    } else {
      this.pendingSubscribers.delete(subscriptionScope);
    }
  }
}

function getComputationFromCoValue(
  coValue: ComputedCoMap<any, any>,
):
  | ((coMap: ComputedCoMap<any, any>) => { stopListening: () => void })
  | undefined {
  const schema = (coValue.constructor as any)._computedCoMapSchema;
  if (schema === undefined) {
    throw new Error("ComputedCoMap class is missing _computedCoMapSchema");
  }
  // _computation may be undefined if only withComputed was used (no withComputation)
  return schema._computation;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, createValue: () => V): V {
  let value = map.get(key);
  if (!value) {
    value = createValue();
    map.set(key, value);
  }
  return value;
}
function getOrCreateWeak<K extends WeakKey, V>(
  map: WeakMap<K, V>,
  key: K,
  createValue: () => V,
): V {
  let value = map.get(key);
  if (!value) {
    value = createValue();
    map.set(key, value);
  }
  return value;
}

export const COMPUTATION_CACHE = new ComputedCoValueComputationCache();
