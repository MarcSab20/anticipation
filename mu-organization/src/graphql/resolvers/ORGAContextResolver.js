// src/graphql/resolvers/ORGAContextResolver.js
import 'smp-core-tools/src/middleware/monitor.js'

export default {
  Query: {
    organizationHello: async () => "Organization µ-service",
    organizationVersion: async () => { return "V0.0.2" },
    organizationHeartbeat: async () => { return global.heartbeat },
    organizationRequestCounter: async () => { return global.requestCounter.count }
  },
};
