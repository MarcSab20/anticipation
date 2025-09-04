export default `
 #src/graphql/types/ORGAContext.gql.js

type Query {
  organizationHello: String
  organizationVersion: String
  organizationHeartbeat: Heartbeat
  organizationRequestCounter: Int
}
`;  