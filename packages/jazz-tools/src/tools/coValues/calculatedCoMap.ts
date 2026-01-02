import { CoValueUniqueness, RawCoMap } from "cojson";
import { Account, BranchDefinition, Group, Simplify } from "../internal";
import { CoMap, CoMapInit_DEPRECATED, CoMapJazzApi } from "./coMap";
import { RefsToResolve, RefsToResolveStrict, Resolved } from "./deepLoading";
import { SubscribeRestArgs, parseSubscribeRestArgs } from "./interfaces";

export class ComputedCoMap extends CoMap {
  declare $jazz: ComputedCoMapJazzApi<this>;
  declare $computation: ComputedCoValueComputation<this>;

  /** @internal */
  constructor(options: { fromRaw: RawCoMap } | undefined) {
    super(options);

    if (options && "fromRaw" in options) {
      const raw = options.fromRaw;
      Object.defineProperties(this, {
        $jazz: {
          value: new ComputedCoMapJazzApi(
            this,
            () => raw,
            () => this.$computation,
          ),
          enumerable: false,
        },
      });
    }
  }

  /** @internal */
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
    const created = CoMap._createCoMap(instance, init, options) as M;
    const raw = (created.$jazz as CoMapJazzApi<M>).raw;

    if (created instanceof ComputedCoMap) {
      Object.defineProperties(created, {
        $jazz: {
          value: new ComputedCoMapJazzApi(
            created,
            () => raw,
            () => created.$computation,
          ),
          enumerable: false,
        },
      });
    }

    return created;
  }
}

export class ComputedCoValueComputation<M extends ComputedCoMap> {
  private currentComputation: { stopListening: () => void } | null = null;
  private subscriberCount = 0;

  constructor(
    private computation: (coMap: M) => { stopListening: () => void },
  ) {}

  addSubscriber(coMap: M): void {
    this.subscriberCount++;
    if (this.subscriberCount === 1) {
      if (this.currentComputation) {
        this.currentComputation.stopListening();
      }
      this.currentComputation = this.computation(coMap);
    }
  }

  removeSubscriber(): void {
    if (this.subscriberCount === 0) return;
    this.subscriberCount--;
    if (this.subscriberCount === 0 && this.currentComputation) {
      this.currentComputation.stopListening();
      this.currentComputation = null;
    }
  }
}

export class ComputedCoMapJazzApi<
  M extends ComputedCoMap,
> extends CoMapJazzApi<M> {
  // separate from original CoMapJazzApi's coMap to avoid type conflicts
  private _coMap: M;

  constructor(
    coMap: M,
    getRaw: () => RawCoMap,
    private getComputation: () => ComputedCoValueComputation<M>,
  ) {
    super(coMap, getRaw);
    this._coMap = coMap;
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
    Map extends ComputedCoMap,
    const R extends RefsToResolve<Map> = true,
  >(
    this: ComputedCoMapJazzApi<Map>,
    listener: (value: Resolved<Map, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<
    Map extends ComputedCoMap,
    const R extends RefsToResolve<Map> = true,
  >(
    this: ComputedCoMapJazzApi<Map>,
    options: {
      resolve?: RefsToResolveStrict<Map, R>;
      unstable_branch?: BranchDefinition;
    },
    listener: (value: Resolved<Map, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<Map extends ComputedCoMap, const R extends RefsToResolve<Map>>(
    this: ComputedCoMapJazzApi<Map>,
    ...args: SubscribeRestArgs<Map, R>
  ): () => void {
    this.getComputation().addSubscriber(this._coMap);
    const { options, listener } = parseSubscribeRestArgs(args);
    const onStop = super.subscribe(options, listener);
    return () => {
      this.getComputation().removeSubscriber();
      onStop();
    };
  }
}
