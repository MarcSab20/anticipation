export default /* GraphQL */ `
# src/graphql/types/MediaReference.graphql.js
# Référence au type Media pour Catalog

type Media @shareable {
  mediaID: ID!
  authorID: ID
  mediaType: String
  originalName: String
  finalName: String
  url: String
  entityID: ID
  entityName: String
  size: String
  state: ObjectStatus
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime
}
`;