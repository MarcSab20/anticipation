// Import dependencies and utilities
import { TopicOrganization } from "../../index.js";
import {
  navigateEntityList,
  UserInputDataValidationError,
  db, SMPEvents
} from "smp-core-tools";

// Error codes for topicOrganization update and creation
const ERRORS = {
  // Update errors
  SERVER_ERR_TAG_ORGANIZATION_U_10: "SERVER_ERR_CATA010",
  ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_47: "UIDVALIDATION_ERR_CATA052",
  ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_48: "UIDVALIDATION_ERR_CATA053",
  ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_49: "UIDVALIDATION_ERR_CATA054",
  // Creation errors
  ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_47: "SERVER_ERR_ORGA011",
  ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_48: "UIDVALIDATION_ERR_ORGA042",
  ORGA_SERVER_ERR_TAG_ORGANIZATION_C_49: "UIDVALIDATION_ERR_ORGA043",
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

// --- Core logic for topicOrganizations ---

/**
 * Searches for topicOrganizations with specific options.
 * @param {Object} options - Search options (pagination, sorting, filtering, etc.).
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<TopicOrganization>>} - List of found topicOrganizations.
 */
async function findTopicOrganizations(options, context) {
  const topicOrganizations = await TopicOrganization.findAll(options);
  await context.event.publish(SMPEvents.Organization.TopicOrganization.listed, topicOrganizations);
  return topicOrganizations;
}

/**
 * Searches for a topicOrganization by its ID.
 * @param {string} topicOrganizationID - ID of the topicOrganization to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TopicOrganization>} - Found topicOrganization.
 */
async function findTopicOrganizationByID(topicOrganizationID, context) {
  if (!topicOrganizationID) {
    throw new UserInputDataValidationError("TopicOrganization ID not provided", "002");
  }
  const topicOrganization = await TopicOrganization.findByPk(topicOrganizationID);
  if (!topicOrganization) {
    throw new UserInputDataValidationError(`TopicOrganization ID ${topicOrganizationID} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.TopicOrganization.visited, topicOrganization);
  return topicOrganization;
}

/**
 * Searches for topicOrganizations by their IDs.
 * @param {Array<string|number>} topicOrganizationIDs - List of topicOrganization IDs to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<TopicOrganization>>} - List of found topicOrganizations.
 */
async function findTopicOrganizationsByIDs(topicOrganizationIDs, context) {
  if (!Array.isArray(topicOrganizationIDs) || topicOrganizationIDs.length === 0) {
    throw new UserInputDataValidationError("TopicOrganization IDs not provided or invalid format", "002");
  }
  const topicOrganizations = await TopicOrganization.findAll({ where: { topicOrganizationID: topicOrganizationIDs } });
  if (topicOrganizations.length === 0) {
    throw new UserInputDataValidationError(`No topicOrganizations found for provided IDs`, "003");
  }
  await context.event.publish(SMPEvents.Organization.TopicOrganization.listed, topicOrganizations);
  return topicOrganizations;
}

/**
 * Creates a new topicOrganization.
 * @param {Object} input - Input data for topicOrganization creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TopicOrganization>} - Created topicOrganization.
 */
async function createTopicOrganization(input, context) {
  
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating topicOrganization via topicOrganizationCreation
  const topicOrganizationConf = {
    entityName: "topicOrganization",
    entityIDName: "topicOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => await TopicOrganization.create(obj, opts),  // TopicOrganization creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: TopicOrganization,
    entitySlugGenerationFn: (entity) => "entity.topicOrganizationName",  // Generate slug based on topicOrganization name
    // Validation and transaction management
    entityBuilderFn: topicOrganizationCreationBuilder,  // Function to validate inputs before creation
    entityTransactionStartFn: undefined,  // Optional function to start a transaction
    entityTransactionCommitFn: async (tr) => { await tr.commit(); },  // Commit transaction
    entityTransactionRollbackFn: async (tr) => { await tr.rollback(); },  // Rollback transaction in case of errors
    entityDefinedTransaction: transaction,  // Define transaction at start
  
    // Specific error handling
    businessErrorHandlerFn: undefined,  // Domain-specific error handler
    errorCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_47,  // Error code for invalid inputs
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_48,  // Error code for missing inputs
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_TAG_ORGANIZATION_C_49,  // Error code for creation failure

    // Caching (optional)
    entityCacheGetFn: undefined,
    entityCacheSetFn: undefined,
    entityCacheInvalidateFn: undefined,  // Function to invalidate cache if needed
    entityCacheTTL: context.config.sensitiveCachedDataDuration,
    entityCacheValue: undefined,
    entityCacheKey: undefined,
    entityCacheKeyFn: (entity) => `r:${entity.topicOrganizationID}:${entity.uniqRef}`,

    // Publishing and logging
    eventKey: SMPEvents.Organization.TopicOrganization.created,  // Event key for topicOrganization creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) => appContext?.logger?.info("TODO: REPLACE WITH METRIC FUNCTION CALL : TopicOrganizationResolver.createTopicOrganization auditLogFn"),  // Logs topicOrganization creation for auditing
  };

  // Save and publish the created topicOrganization
  return await saveAndPublishEntity(topicOrganizationConf, input, context).then(
    (topicOrganization) => {
      return topicOrganization;
    }
  ).catch(
    async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  );
}

/**
 * Updates an existing topicOrganization.
 * @param {string} topicOrganizationID - ID of the topicOrganization to update.
 * @param {Object} input - Data to update for the topicOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TopicOrganization>} - Updated topicOrganization.
 */
async function updateTopicOrganization(topicOrganizationID, input, context) {
  console.log("okE",SMPEvents.Organization.TopicOrganization.updated)

  let transaction = await db.transaction();
  // Configuration for topicOrganization update via topicOrganizationCreation
  const topicOrganizationConf = {
    entityName: "topicOrganization",
    entityIDName: "topicOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedTopicOrganizations] = await TopicOrganization.update(obj, { where: { topicOrganizationID: topicOrganizationID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`TopicOrganization with ID ${topicOrganizationID} not found`); }
      return updatedTopicOrganizations[0]; // Return updated object
    },    
    entityModel: TopicOrganization, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_TAG_ORGANIZATION_C_49,

    eventKey: SMPEvents.Organization.TopicOrganization.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(topicOrganizationConf, input, context).then(
    (topicOrganization) => { 
      if(topicOrganization) return topicOrganization;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a topicOrganization by its ID.
 * @param {string} topicOrganizationID - ID of the topicOrganization to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteTopicOrganization(topicOrganizationID, context) {
  const topicOrganization = await TopicOrganization.findByPk(topicOrganizationID);
  if (!topicOrganization) {
    throw new Error("TopicOrganization not found");
  }
  await topicOrganization.destroy();
  await context.event.publish(SMPEvents.Organization.TopicOrganization.deleted, topicOrganizationID);
  return { success: true, message: "TopicOrganization deleted successfully" };
}

/**
 * Searches for topicOrganizations by their Slugs.
 * @param {Array<string>} slugs - List of slugs to search.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<TopicOrganization>>} - List of found topicOrganizations.
 */
async function findTopicOrganizationsBySlugs(slugs, context) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new UserInputDataValidationError("TopicOrganization Slugs not provided or empty", "002");
  }
  const topicOrganizations = await TopicOrganization.findAll({ where: { slug: slugs } });
  await context.event.publish(SMPEvents.Organization.TopicOrganization.listed, topicOrganizations);
  return topicOrganizations;
}

/**
 * Searches for a topicOrganization by its UniqRef.
 * @param {string} UniqRef - Unique Reference of the topicOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TopicOrganization>} - Found topicOrganization.
 */
async function findTopicOrganizationByUniqRef(UniqRef, context) {
  if (!UniqRef) {
    throw new UserInputDataValidationError("TopicOrganization UniqRef not provided", "002");
  }
  const topicOrganization = await TopicOrganization.findOne({ where: { uniqRef: UniqRef } });
  if (!topicOrganization) {
    throw new UserInputDataValidationError(`TopicOrganization UniqRef ${UniqRef} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.TopicOrganization.visited, topicOrganization);
  return topicOrganization;
}

/**
 * Searches for a topicOrganization by its Slug.
 * @param {string} Slug - Slug of the topicOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TopicOrganization>} - Found topicOrganization.
 */
async function findTopicOrganizationBySlug(Slug, context) {
  if (!Slug) {
    throw new UserInputDataValidationError("TopicOrganization Slug not provided", "002");
  }
  const topicOrganization = await TopicOrganization.findOne({ where: { slug: Slug } });
  if (!topicOrganization) {
    throw new UserInputDataValidationError(`TopicOrganization Slug ${Slug} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.TopicOrganization.visited, topicOrganization);
  return topicOrganization;
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to get a list of topicOrganizations.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<TopicOrganization>>} - List of found topicOrganizations.
 */
async function topicOrganizationsResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  const filters = Array.isArray(filter) ? filter : [];
  return navigateEntityList(context, (options) => findTopicOrganizations(options, context), filters, pagination, sort)
    .catch((error) => {
      throw new Error("Query::Error fetching topicOrganizations: " + error);
    });
}

/**
 * Resolver to create a new topicOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TopicOrganization>} - Created topicOrganization.
 */
async function createTopicOrganizationResolver(parent, { input }, context, infos) {
  return createTopicOrganization(input, context);
}

/**
 * Resolver to update a topicOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the topicOrganization ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TopicOrganization>} - Updated topicOrganization.
 */
async function updateTopicOrganizationResolver(parent, { topicOrganizationID, input }, context, infos) {
  return updateTopicOrganization(topicOrganizationID, input, context);
}

/**
 * Resolver to delete a topicOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the topicOrganization ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteTopicOrganizationResolver(parent, { topicOrganizationID }, context, infos) {
  return deleteTopicOrganization(topicOrganizationID, context);
}

/**
 * Resolver to get a topicOrganization by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the topicOrganization ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TopicOrganization>} - Found topicOrganization.
 */
async function topicOrganizationResolver(parent, { topicOrganizationID }, context, infos) {
  return navigateEntityList(context, (options) => findTopicOrganizationByID(topicOrganizationID, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching topicOrganization by ID: " + error);
    });
}

/**
 * Resolver to get topicOrganizations by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<TopicOrganization>>} - List of found topicOrganizations.
 */
async function topicOrganizationsByIDsResolver(parent, { topicOrganizationIDs }, context, infos) {
  return navigateEntityList(context, (options) => findTopicOrganizationsByIDs(topicOrganizationIDs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching topicOrganizations by IDs: " + error);
    });
}

/**
 * Resolver to get topicOrganizations by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<TopicOrganization>>} - List of found topicOrganizations.
 */
async function topicOrganizationsBySlugsResolver(_, { slugs }, context, info) {
  return navigateEntityList(context, (options) => findTopicOrganizationsBySlugs(slugs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching topicOrganizations by Slugs: " + error);
    });
}

/**
 * Resolver to get a topicOrganization by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the topicOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TopicOrganization>} - Found topicOrganization.
 */
async function topicOrganizationByUniqRefResolver(_, { UniqRef }, context, infos) {
  return navigateEntityList(context, (options) => findTopicOrganizationByUniqRef(UniqRef, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching topicOrganization by UniqRef: " + error);
    });
}

/**
 * Resolver to get a topicOrganization by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the topicOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TopicOrganization>} - Found topicOrganization.
 */
async function topicOrganizationBySlugResolver(_, { Slug }, context, info) {
  return navigateEntityList(context, (options) => findTopicOrganizationBySlug(Slug, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching topicOrganization by Slug: " + error);
    });
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new topicOrganization object from the provided data.
 * @param {Object} topicOrganization - TopicOrganization data.
 * @returns {Object} - New topicOrganization object.
 */
function topicOrganizationCreationBuilder(_, topicOrganization ) {
  let newTopicOrganization = {};

  if (topicOrganization.state) {
    newTopicOrganization.state = topicOrganization.state;
  }

  if (topicOrganization.topicID) {
    newTopicOrganization.topicID = topicOrganization.topicID;
  }

  if (topicOrganization.organizationID) {
    newTopicOrganization.organizationID = topicOrganization.organizationID;
  }

  return newTopicOrganization;
}

export {
// Export resolvers
// [QUERIES]
  topicOrganizationsResolver,
  topicOrganizationResolver,
  topicOrganizationsByIDsResolver,
  topicOrganizationsBySlugsResolver,
  topicOrganizationByUniqRefResolver,
  topicOrganizationBySlugResolver,
// [MUTATIONS]
  createTopicOrganizationResolver,
  updateTopicOrganizationResolver,
  deleteTopicOrganizationResolver,
// Export utility functions
};
