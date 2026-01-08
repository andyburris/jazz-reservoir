import { CoMap } from "./coMap";

export class ComputedCoMap extends CoMap {
  declare isComputed: true;
  static {
    this.prototype["isComputed"] = true;
  }
}
