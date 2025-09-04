// Import dependencies and utilities
import { UserOrganization } from "../../index.js";
import {
  entityListing, entityByID, entityByUniqKey, 
  db,
  SMPError,
  saveAndPublishEntity,
  entityListingByIDs,
  entityByUniqKeys, SMPEvents
} from "smp-core-tools";

// Error codes for userOrganization update and creation
const ERRORS = {
  // Update errors
  SERVER_ERR_USER_ORGANIZATION_U_10: "SERVER_ERR_CATA010",
  ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_47: "UIDVALIDATION_ERR_CATA052",
  ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_48: "UIDVALIDATION_ERR_CATA053",
  ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_49: "UIDVALIDATION_ERR_CATA054",
  // Creation errors
  ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_47: "SERVER_ERR_ORGA011",
  ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_48: "UIDVALIDATION_ERR_ORGA042",
  ORGA_SERVER_ERR_USER_ORGANIZATION_C_49: "UIDVALIDATION_ERR_ORGA043",
};

// --- Helper to publish events ---

/**
 * Publishes an event for a given entity.
 * @param {Object} context - GraphQL request context.
 * @param {Object} config - Configuration for the entity and event (entity name, event key, etc.).
 * @param {Object} message - Message or data to be published in the event.
 * @returns {Promise<void>}
 */
async function publishHelper(context, config, message) {
  try {
    await context.event.publish(config.eventKey, message);
    context.logger.info(`${config.entityName} event ${config.eventKey} published.`);
  } catch (error) {
    throw new Error(`Failed to publish ${config.entityName} event ${config.eventKey}: ` + error);
  }
}

// --- Core logic for userOrganizations ---

/**
 * Creates a new userOrganization.
 * @param {Object} input - Input data for userOrganization creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<UserOrganization>} - Created userOrganization.
 */
async function createUserOrganization(input, context) {
  
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating userOrganization via userOrganizationCreation
  const userOrganizationConf = {
    entityName: "userOrganization",
    entityIDName: "userOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => await UserOrganization.create(obj, opts),  // UserOrganization creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: UserOrganization,
    entitySlugGenerationFn: (entity) => UserOrganization.slug(entity.uniqRef),  // Generate slug based on userOrganization name
    // Validation and transaction management
    entityBuilderFn: userOrganizationCreationBuilder,  // Function to validate inputs before creation
    entityTransactionStartFn: undefined,  // Optional function to start a transaction
    entityTransactionCommitFn: async (tr) => { await tr.commit(); },  // Commit transaction
    entityTransactionRollbackFn: async (tr) => { await tr.rollback(); },  // Rollback transaction in case of errors
    entityDefinedTransaction: transaction,  // Define transaction at start
  
    // Specific error handling
    businessErrorHandlerFn: undefined,  // Domain-specific error handler
    errorCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_47,  // Error code for invalid inputs
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_48,  // Error code for missing inputs
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,  // Error code for creation failure

    // Caching (optional)
    entityCacheGetFn: undefined,
    entityCacheSetFn: undefined,
    entityCacheInvalidateFn: undefined,  // Function to invalidate cache if needed
    entityCacheTTL: context.config.sensitiveCachedDataDuration,
    entityCacheValue: undefined,
    entityCacheKey: undefined,
    entityCacheKeyFn: (entity) => `r:${entity.userOrganizationID}:${entity.uniqRef}`,

    // Publishing and logging
    eventKey: SMPEvents.Organization.UserOrganization.created,  // Event key for userOrganization creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) => appContext?.logger?.info("TODO: REPLACE WITH METRIC FUNCTION CALL : UserOrganizationResolver.createUserOrganization auditLogFn"),  // Logs userOrganization creation for auditing
  };

  // Save and publish the created userOrganization
  return await saveAndPublishEntity(userOrganizationConf, input, context).then(
    (userOrganization) => {
      return userOrganization;
    }
  ).catch(
    async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  );
}

/**
 * Updates an existing userOrganization.
 * @param {string} userOrganizationID - ID of the userOrganization to update.
 * @param {Object} input - Data to update for the userOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<UserOrganization>} - Updated userOrganization.
 */
async function updateUserOrganization(userOrganizationID, input, context) {
  console.log("okE",SMPEvents.Organization.UserOrganization.updated)

  let transaction = await db.transaction();
  // Configuration for userOrganization update via userOrganizationCreation
  const userOrganizationConf = {
    entityName: "userOrganization",
    entityIDName: "userOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedUserOrganizations] = await UserOrganization.update(obj, { where: { userOrganizationID: userOrganizationID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`UserOrganization with ID ${userOrganizationID} not found`); }
      return updatedUserOrganizations[0]; // Return updated object
    },    
    entityModel: UserOrganization, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_USER_ORGANIZATION_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,

    eventKey: SMPEvents.Organization.UserOrganization.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(userOrganizationConf, input, context).then(
    (userOrganization) => { 
      if(userOrganization) return userOrganization;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a userOrganization by its ID.
 * @param {string} userOrganizationID - ID of the userOrganization to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteUserOrganization(userOrganizationID, context) {
  const userOrganization = await UserOrganization.findByPk(userOrganizationID);
  if (!userOrganization) {
    throw new Error("UserOrganization not found");
  }
  await userOrganization.destroy();
  await context.event.publish(SMPEvents.Organization.UserOrganization.deleted, userOrganizationID);
  return { success: true, message: "UserOrganization deleted successfully" };
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to create a new userOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<UserOrganization>} - Created userOrganization.
 */
async function createUserOrganizationResolver(parent, { input }, context, infos) {
  const entity = {uniqRef: UserOrganization.uuid(), ...input};
  return createUserOrganization(entity, context);
}

/**
 * Resolver to update a userOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the userOrganization ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<UserOrganization>} - Updated userOrganization.
 */
async function updateUserOrganizationResolver(parent, { userOrganizationID, input }, context, infos) {
  return updateUserOrganization(userOrganizationID, input, context);
}

/**
 * Resolver to delete a userOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the userOrganization ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteUserOrganizationResolver(parent, { userOrganizationID }, context, infos) {
  return deleteUserOrganization(userOrganizationID, context);
}

/**
 * Resolver to get a list of userOrganizations.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<UserOrganization>>} - List of found userOrganizations.
 */
async function userOrganizationsResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  // Configuration for creating userOrganization via userOrganizationCreation
  const userOrganizationConf = {
    entityName: "UserOrganization", 
    entityModel: UserOrganization, 
    errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
    eventKey: SMPEvents.Organization.UserOrganization.listed,
    entityPublisherFn: async (ctxt, conf, msg) => await ctxt.event.publish(conf.eventKey, msg),
    auditLogFn: (_, appContext) => appContext.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  const entities = await entityListing(userOrganizationConf, {pagination, sort, filter} , context, infos)   
  .catch((error) => {
    context.logger.error(error);
      throw new Error("Query::userOrganizationsResolver: " + error);
    });
  return entities;
}

/**
 * Resolver to get a userOrganization by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the userOrganization ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<UserOrganization>} - Found userOrganization.
 */
async function userOrganizationResolver(parent, { userOrganizationID }, context, infos) {
  // Configuration to retrieve userOrganization via entityByID
  const userOrganizationConf = {
    entityName: "UserOrganization", 
    entityModel: UserOrganization, 
    errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
    eventKey: SMPEvents.Organization.UserOrganization.visited,
    entityPublisherFn: async (_, conf, msg) => await context.event.publish(conf.eventKey, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  const entity = await entityByID(userOrganizationConf, userOrganizationID, context);
  return entity;
}

/**
 * Resolver to get userOrganizations by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<UserOrganization>>} - List of found userOrganizations.
 */
async function userOrganizationsByIDsResolver(parent, { userOrganizationIDs, pagination = {}, sort = {}, filter = []  }, context, infos) {
  // Configuration to retrieve userOrganization via entityListingByIDs
  const userOrganizationConf = {
    entityName: "UserOrganization", 
    entityIDName: "userOrganizationID", 
    entityModel: UserOrganization, 
    errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
    eventKey: SMPEvents.Organization.UserOrganization.listed,
    entityPublisherFn: async (_, conf, msg) => await context.event.publish(conf.eventKey, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return entityListingByIDs(userOrganizationConf, { ids: userOrganizationIDs, pagination, sort, filter }, context, infos)
  .catch((error) => {
    throw new Error("Query::Error fetching userOrganizations by IDs: " + error);
  });
}

/**
 * Resolver to get userOrganizations by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<UserOrganization>>} - List of found userOrganizations.
 */
async function userOrganizationsBySlugsResolver(_, { slugs, pagination = {}, sort = {}, filter= [] }, context, info) {
    // Configuration to retrieve userOrganization via entityByUniqKey
    const userOrganizationConf = {
      entityName: "UserOrganization", 
      entityIDName: "userOrganizationID",
      entityUniqKeyName: "slug",
      entityUniqKeyValues: slugs, 
      entityModel: UserOrganization, 
      errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
      eventKey: SMPEvents.Organization.UserOrganization.listed,
      entityPublisherFn: async (_, conf, msg) => await context.event.publish(conf.eventKey, msg),
      auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
    }; 
    return entityByUniqKeys(userOrganizationConf, { pagination, sort, filter }, context)
    .catch((error) => {
      throw new Error("Query::Error resolving by slug: " + error);
    });
}

async function userOrganizationByUniqRefsResolver(_, { uniqRefs, pagination = {}, sort = {}, filter= [] }, context, info) {
  // Configuration to retrieve userOrganization via entityByUniqKey
  const userOrganizationConf = {
    entityName: "UserOrganization", 
    entityIDName: "userOrganizationID",
    entityUniqKeyName: "uniqRef",
    entityUniqKeyValues: uniqRefs, 
    entityModel: UserOrganization, 
    errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
    eventKey: SMPEvents.Organization.UserOrganization.listed,
    entityPublisherFn: async (_, conf, msg) => await context.event.publish(conf.eventKey, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return entityByUniqKeys(userOrganizationConf, { pagination, sort, filter }, context)
  .catch((error) => {
    throw new Error("Query::Error resolving by slug: " + error);
  });
}

/**
 * Resolver to get a userOrganization by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the userOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<UserOrganization>} - Found userOrganization.
 */
async function userOrganizationByUniqRefResolver(_, { uniqRef }, context, infos) {
    // Configuration to retrieve userOrganization via entityByUniqKey
    const userOrganizationConf = {
      entityName: "UserOrganization", 
      entityUniqKeyName: "uniqRef",
      entityUniqKeyValue: uniqRef, 
      entityModel: UserOrganization, 
      errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
      eventKey: SMPEvents.Organization.UserOrganization.listed,
      entityPublisherFn: async (_, conf, msg) => await context.event.publish(conf.eventKey, msg),
      auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
    }; 
    return entityByUniqKey(userOrganizationConf, context)
    .catch((error) => {
      throw new Error("Query::Error resolving by slug: " + error);
    });
}

/**
 * Resolver to get a userOrganization by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the userOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<UserOrganization>} - Found userOrganization.
 */
async function userOrganizationBySlugResolver(_, { slug }, context, info) {
    // Configuration to retrieve userOrganization via entityByUniqKey
    const userOrganizationConf = {
      entityName: "UserOrganization", 
      entityUniqKeyName: "slug",
      entityUniqKeyValue: slug, 
      entityModel: UserOrganization, 
      errorCodeEntityListingFaillure: ERRORS.ORGA_SERVER_ERR_USER_ORGANIZATION_C_49,
      eventKey: SMPEvents.Organization.UserOrganization.listed,
      entityPublisherFn: async (_, conf, msg) => await context.event.publish(conf.eventKey, msg),
      auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
    }; 
    return entityByUniqKey(userOrganizationConf, context)
    .catch((error) => {
      throw new Error("Query::Error resolving by slug: " + error);
    });
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new userOrganization object from the provided data.
 * @param {Object} userOrganization - UserOrganization data.
 * @returns {Object} - New userOrganization object.
 */
function userOrganizationCreationBuilder(_, userOrganization ) {
  let newUserOrganization = {};

  if (userOrganization.state) {
    newUserOrganization.state = userOrganization.state;
  }

  if (userOrganization.legend) {
    newUserOrganization.legend = userOrganization.legend;
  }

  if (userOrganization.authorID) {
    newUserOrganization.authorID = userOrganization.authorID;
  }

  if (userOrganization.userID) {
    newUserOrganization.userID = userOrganization.userID;
  }

  if (userOrganization.roleID) {
    newUserOrganization.roleID = userOrganization.roleID;
  }

  if (userOrganization.organizationID) {
    newUserOrganization.organizationID = userOrganization.organizationID;
  }

  return newUserOrganization;
}

export {
// Export resolvers
// [QUERIES]
  userOrganizationsResolver,
  userOrganizationResolver,
  userOrganizationsByIDsResolver,
  userOrganizationsBySlugsResolver,
  userOrganizationByUniqRefResolver,
  userOrganizationByUniqRefsResolver,
  userOrganizationBySlugResolver,
// [MUTATIONS]
  createUserOrganizationResolver,
  updateUserOrganizationResolver,
  deleteUserOrganizationResolver,
// Export utility functions
};
