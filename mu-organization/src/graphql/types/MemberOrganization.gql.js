// src/graphql/resolvers/memberorganization.gql.js

export default /* GraphQL */ `
"""
Response type for adding a user to an organization.
"""
type AddUserToOrganizationResponse {
  success: Boolean!
  message: String!
}

"""
Details of a member in an organization.
"""
type OrganizationMember {
  userID: ID!
  role: String!
  username: String!
  email: String!
  name: String!
  lastname: String!
  joinedAt: DateTime!
  profilePicture: String
  userOrganization: UserOrganization
}

"""
Input type for adding a user to an organization.
"""
input AddUserToOrganizationInput {
  userID: ID!
  organizationID: ID!
  role: String!
}

"""
Response type for removing a user from an organization.
"""
type RemoveUserFromOrganizationResponse {
  success: Boolean!
  message: String!
}

"""
Input type for removing a user from an organization.
"""
input RemoveUserFromOrganizationInput {
  userID: ID!
  organizationID: ID!
}

"""
Response type for updating a user's role in an organization.
"""
type UpdateUserRoleInOrganizationResponse {
  success: Boolean!
  message: String!
}

"""
Input type for updating a user's role in an organization.
"""
input UpdateUserRoleInOrganizationInput {
  userID: ID!
  organizationID: ID!
  newRoleID: ID!
}

"""
Input type for inviting a user to an organization.
"""
input InviteUserToOrganizationInput {
  email: String!
  organizationID: ID!
  message: String
  firstName: String
  lastName: String
}

"""
Response type for verifying an invitation token.
"""
type InvitationResponse {
  success: Boolean!
  message: String!
  email: String!
  organizationID: String!
  userExists: Boolean!
  userID: String
  firstName: String
  lastName: String
}

"""
Response type for removing an invitation.
"""
type RemoveInvitationResponse {
  success: Boolean!
  message: String!
}

"""
Input type for removing an invitation.
"""
input RemoveInvitationInput {
  email: String!
  organizationID: ID!
}

"""
Response type for removing an invitation.
"""
type OrganizationMemberList {
  members: [OrganizationMember!]!
  totalMembers: Int!
}

"""
Details of a user's role in an organization.
"""
type UserRoleInOrganization {
  roleID: ID!
  roleName: String!
}

"""
Details of an organization with the user's role.
"""
type OrganizationsByUserResponse {
  organizationID: ID!
  organizationName: String!
  smallLogoUrl: String
  userRole: UserRoleInOrganization!
}

"""
Input type for verifying an invitation token.
"""
input VerifyInvitationTokenInput {
  token: String!
}

"""
Query type for listing organization members and checking membership.
"""
type Query {
  listOrganizationMembers(organizationID: ID!): OrganizationMemberList!
  isUserInOrganization(userID: ID!, organizationID: ID!): Boolean!
  getUserOrganizations(userID: ID!): [OrganizationsByUserResponse]!
}

"""
Mutation type for member-organization-related operations.
"""
type Mutation {
  addUserToOrganization(input: AddUserToOrganizationInput!): AddUserToOrganizationResponse!
  removeUserFromOrganization(input: RemoveUserFromOrganizationInput!): RemoveUserFromOrganizationResponse!
  updateUserRoleInOrganization(input: UpdateUserRoleInOrganizationInput!): UpdateUserRoleInOrganizationResponse!
  inviteUserToOrganization(input: InviteUserToOrganizationInput!): AddUserToOrganizationResponse!
  verifyInvitationToken(input: VerifyInvitationTokenInput!): InvitationResponse!
  removeInvitation(input: RemoveInvitationInput!): RemoveInvitationResponse!
}
`;