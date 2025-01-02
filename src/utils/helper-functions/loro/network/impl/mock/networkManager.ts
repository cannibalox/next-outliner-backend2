import { MockServerNetwork } from "./server";
import { MockClientNetwork } from "./client";
import { ServerNetwork } from "../../../../../../common/loro/network/server";
import { ClientNetwork } from "../../../../../../common/loro/network/client";

export class MockNetworkManager {
  private serverNetwork: MockServerNetwork = new MockServerNetwork();

  getServerNetwork(): ServerNetwork {
    return this.serverNetwork;
  }

  getClientNetwork(): ClientNetwork {
    return new MockClientNetwork(this.serverNetwork);
  }
}
