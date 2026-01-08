import { CoValueUniqueness, RawCoMap } from "cojson";
import {
  Account,
  BranchDefinition,
  Group,
  Simplify,
  TypeSym,
} from "../internal";
import { CoMap, CoMapInit_DEPRECATED, CoMapJazzApi } from "./coMap";
import { RefsToResolve, RefsToResolveStrict, Resolved } from "./deepLoading";
import {
  CoValueClass,
  SubscribeRestArgs,
  parseCoValueCreateOptions,
  parseSubscribeRestArgs,
} from "./interfaces";

export class ComputedCoMap extends CoMap {
  declare $jazz: ComputedCoMapJazzApi<this>;
  declare $computation: ComputedCoValueComputation<this>;

  declare isComputed: true;
  static {
    this.prototype["isComputed"] = true;
  }

  /** @internal */
  constructor(options: { fromRaw: RawCoMap } | undefined) {
    super(options);

    if (options && "fromRaw" in options) {
      const raw = options.fromRaw;
      const schema = (this.constructor as any)._computedCoMapSchema;
      const computation = schema?._computation;

      Object.defineProperties(this, {
        $jazz: {
          value: new ComputedCoMapJazzApi(
            this,
            () => raw,
            () => this.$computation,
          ),
          enumerable: false,
        },
        $computation: {
          value: new ComputedCoValueComputation(this, computation as any),
          writable: false,
          enumerable: false,
          configurable: false,
        },
      });
    }
  }

  /** @internal */
  static _createComputedCoMap<M extends ComputedCoMap>(
    instance: M,
    init: Simplify<CoMapInit_DEPRECATED<M>>,
    // computation: (coMap: M) => { stopListening: () => void },
    options?:
      | {
          owner?: Account | Group;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Account
      | Group,
  ): M {
    const { owner, uniqueness } = parseCoValueCreateOptions(options);

    const schema = (instance.constructor as any)._computedCoMapSchema;
    const computation = schema?._computation;

    Object.defineProperties(instance, {
      $jazz: {
        value: new ComputedCoMapJazzApi(
          instance,
          () => raw,
          () => instance.$computation,
        ),
        enumerable: false,
      },
      $computation: {
        value: new ComputedCoValueComputation<M>(instance, computation),
      },
    });

    const raw = CoMap.rawFromInit(instance, init, owner, uniqueness);

    return instance;
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
  static createComputed<M extends ComputedCoMap>(
    this: CoValueClass<M>,
    init: Simplify<CoMapInit_DEPRECATED<M>>,
    computation: (coMap: M) => { stopListening: () => void },
    options?:
      | {
          owner?: Account | Group;
          unique?: CoValueUniqueness["uniqueness"];
        }
      | Account
      | Group,
  ) {
    const instance = new this();

    return ComputedCoMap._createComputedCoMap(
      instance,
      init,
      // computation,
      options,
    );
  }
}

export class ComputedCoValueComputation<M extends ComputedCoMap> {
  // private currentComputation: { id: string, stopListening: () => void } | null = null;
  // private subscriberCount = 0;

  // constructor(
  //   private coMap: M,
  //   private computation: (coMap: M) => { stopListening: () => void },
  // ) {}

  // addSubscriber(): string {
  //   const id = crypto.randomUUID();

  //   this.subscriberCount++;
  //   // if (this.subscriberCount === 1) {
  //   if (!this.currentComputation) {
  //     this.currentComputation = { id, ...this.computation(this.coMap) };
  //   }

  //   return id;
  // }

  // removeSubscriber(id: string): void {
  //   console.log(
  //     "removeSubscriber called, this.subscriberCount =",
  //     this.subscriberCount,
  //     "this.currentComputation is running =",
  //     !!this.currentComputation,
  //   );
  //   if (this.subscriberCount === 0) return;
  //   this.subscriberCount--;
  //   if (this.subscriberCount === 0 && this.currentComputation) {
  //     this.currentComputation.stopListening();
  //     this.currentComputation = null;
  //   }
  // }

  private currentComputationID: string | null = null;
  private currentComputation: { stopListening: () => void } | null = null;
  private pendingSubscribers = new Set<string>();

  constructor(
    private coMap: M,
    private computation: (coMap: M) => { stopListening: () => void },
  ) {}

  startNextComputation(): void {
    if (this.currentComputation) {
      throw new Error(
        "Computation should never be running when starting the next computation",
      );
    }

    const nextComputationId = this.pendingSubscribers.values().next().value;
    if (nextComputationId) {
      console.log(
        "Starting computation for ComputedCoMap, pending subscribers =",
        this.pendingSubscribers.size,
      );
      this.pendingSubscribers.delete(nextComputationId);
      this.currentComputationID = nextComputationId;
      this.currentComputation = this.computation(this.coMap);
    } else {
      console.log(
        "Skipping computation start because there are no pending subscribers",
      );
    }
  }

  addSubscriber(): string {
    console.log(
      "addSubscriber called, this.pendingSubscribers =",
      this.pendingSubscribers.size,
      "this.currentComputation is running =",
      !!this.currentComputation,
      "this.currentComputation is queued =",
      !!this.currentComputationID && !this.currentComputation,
    );

    const id = crypto.randomUUID();
    this.pendingSubscribers.add(id);

    if (!this.currentComputationID) {
      this.startNextComputation();
    }

    return id;
  }

  removeSubscriber(id: string): void {
    console.log(
      "removeSubscriber called, this.pendingSubscribers =",
      this.pendingSubscribers.size,
      "this.currentComputation is running =",
      !!this.currentComputation,
      "this.currentComputation is queued =",
      !!this.currentComputationID && !this.currentComputation,
    );

    if (this.currentComputationID == id) {
      this.currentComputationID = null;
      this.currentComputation?.stopListening();
      this.currentComputation = null;

      this.startNextComputation();
    } else {
      this.pendingSubscribers.delete(id);
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
    // const subscriptionID = this.getComputation().addSubscriber();
    const { options, listener } = parseSubscribeRestArgs(args);
    const onStop = super.subscribe(options, listener);
    return () => {
      // this.getComputation().removeSubscriber(subscriptionID);
      onStop();
    };
  }
}
