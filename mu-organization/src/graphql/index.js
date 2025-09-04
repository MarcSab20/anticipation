// src/graphql/index.js
import {
  ObjectStatus,
  BaseType,
  MutationError,
  FilterInput,
  PaginationInput,
  SortInput,
  Organization,
  TagOrganization,
  OrganizationEconomicSizeKind,
  OrganizationMedia,
  UserOrganization,
  FaqOrganization,
  Industry,
  TopicOrganization, 
  Heartbeat,
} from "smp-gql-schema";
// const { types, resolvers } = loadGraphQLComponents()
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { default as ORGAContext } from "./types/ORGAContext.gql.js";
import MemberOrganizationGql from "./types/MemberOrganization.gql.js";
import  MediaOrganization from "./types/@shareable.gql.js"
import { resolvers } from "./Resolvers.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { mergeTypeDefs } from "@graphql-tools/merge";
 

const typesArray = [
  ObjectStatus,
  MemberOrganizationGql,
  BaseType,
  ORGAContext,
  FilterInput,
  MutationError,
  PaginationInput,
  SortInput,
  MediaOrganization,
  OrganizationEconomicSizeKind,
  OrganizationMedia,
  Organization,
  UserOrganization,
  FaqOrganization,
  Industry,
  TagOrganization,
  TopicOrganization, 
  Heartbeat,
];

// // Build the typeDefs from files defined types
const typeDefs = mergeTypeDefs(typesArray);

export { typeDefs, resolvers };
