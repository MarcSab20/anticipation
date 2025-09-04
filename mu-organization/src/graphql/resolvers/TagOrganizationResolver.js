// Import dependencies and utilities
import { TagOrganization } from "../../index.js";
import {
  navigateEntityList,
  UserInputDataValidationError,
  db, SMPEvents

} from "smp-core-tools";

// Error codes for tagOrganization update and creation
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

// --- Core logic for tagOrganizations ---

/**
 * Searches for tagOrganizations with specific options.
 * @param {Object} options - Search options (pagination, sorting, filtering, etc.).
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<TagOrganization>>} - List of found tagOrganizations.
 */
async function findTagOrganizations(options, context) {
  const tagOrganizations = await TagOrganization.findAll(options);
  await context.event.publish(SMPEvents.Organization.TagOrganization.listed, tagOrganizations);
  return tagOrganizations;
}

/**
 * Searches for a tagOrganization by its ID.
 * @param {string} tagOrganizationID - ID of the tagOrganization to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TagOrganization>} - Found tagOrganization.
 */
async function findTagOrganizationByID(tagOrganizationID, context) {
  if (!tagOrganizationID) {
    throw new UserInputDataValidationError("TagOrganization ID not provided", "002");
  }
  const tagOrganization = await TagOrganization.findByPk(tagOrganizationID);
  if (!tagOrganization) {
    throw new UserInputDataValidationError(`TagOrganization ID ${tagOrganizationID} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.TagOrganization.visited, tagOrganization);
  return tagOrganization;
}

/**
 * Searches for tagOrganizations by their IDs.
 * @param {Array<string|number>} tagOrganizationIDs - List of tagOrganization IDs to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<TagOrganization>>} - List of found tagOrganizations.
 */
async function findTagOrganizationsByIDs(tagOrganizationIDs, context) {
  if (!Array.isArray(tagOrganizationIDs) || tagOrganizationIDs.length === 0) {
    throw new UserInputDataValidationError("TagOrganization IDs not provided or invalid format", "002");
  }
  const tagOrganizations = await TagOrganization.findAll({ where: { tagOrganizationID: tagOrganizationIDs } });
  if (tagOrganizations.length === 0) {
    throw new UserInputDataValidationError(`No tagOrganizations found for provided IDs`, "003");
  }
  await context.event.publish(SMPEvents.Organization.TagOrganization.listed, tagOrganizations);
  return tagOrganizations;
}

/**
 * Creates a new tagOrganization.
 * @param {Object} input - Input data for tagOrganization creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TagOrganization>} - Created tagOrganization.
 */
async function createTagOrganization(input, context) {
  
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating tagOrganization via tagOrganizationCreation
  const tagOrganizationConf = {
    entityName: "tagOrganization",
    entityIDName: "tagOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => await TagOrganization.create(obj, opts),  // TagOrganization creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: TagOrganization,
    entitySlugGenerationFn: (entity) => entity.tagID,  // Generate slug based on tagOrganization name
    // Validation and transaction management
    entityBuilderFn: tagOrganizationCreationBuilder,  // Function to validate inputs before creation
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
    entityCacheKeyFn: (entity) => `r:${entity.tagOrganizationID}:${entity.uniqRef}`,

    // Publishing and logging
    eventKey: SMPEvents.Organization.TagOrganization.created,  // Event key for tagOrganization creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) => appContext?.logger?.info("TODO: REPLACE WITH METRIC FUNCTION CALL : TagOrganizationResolver.createTagOrganization auditLogFn"),  // Logs tagOrganization creation for auditing
  };

  // Save and publish the created tagOrganization
  return await saveAndPublishEntity(tagOrganizationConf, input, context).then(
    (tagOrganization) => {
      return tagOrganization;
    }
  ).catch(
    async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  );
}

/**
 * Updates an existing tagOrganization.
 * @param {string} tagOrganizationID - ID of the tagOrganization to update.
 * @param {Object} input - Data to update for the tagOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TagOrganization>} - Updated tagOrganization.
 */
async function updateTagOrganization(tagOrganizationID, input, context) {
  console.log("okE",SMPEvents.Organization.TagOrganization.updated)

  let transaction = await db.transaction();
  // Configuration for tagOrganization update via tagOrganizationCreation
  const tagOrganizationConf = {
    entityName: "tagOrganization",
    entityIDName: "tagOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedTagOrganizations] = await TagOrganization.update(obj, { where: { tagOrganizationID: tagOrganizationID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`TagOrganization with ID ${tagOrganizationID} not found`); }
      return updatedTagOrganizations[0]; // Return updated object
    },    
    entityModel: TagOrganization, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_TAG_ORGANIZATION_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_TAG_ORGANIZATION_C_49,

    eventKey: SMPEvents.Organization.TagOrganization.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(tagOrganizationConf, input, context).then(
    (tagOrganization) => { 
      if(tagOrganization) return tagOrganization;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a tagOrganization by its ID.
 * @param {string} tagOrganizationID - ID of the tagOrganization to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteTagOrganization(tagOrganizationID, context) {
  const tagOrganization = await TagOrganization.findByPk(tagOrganizationID);
  if (!tagOrganization) {
    throw new Error("TagOrganization not found");
  }
  await tagOrganization.destroy();
  await context.event.publish(SMPEvents.Organization.TagOrganization.deleted, tagOrganizationID);
  return { success: true, message: "TagOrganization deleted successfully" };
}

/**
 * Searches for tagOrganizations by their Slugs.
 * @param {Array<string>} slugs - List of slugs to search.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<TagOrganization>>} - List of found tagOrganizations.
 */
async function findTagOrganizationsBySlugs(slugs, context) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new UserInputDataValidationError("TagOrganization Slugs not provided or empty", "002");
  }
  const tagOrganizations = await TagOrganization.findAll({ where: { slug: slugs } });
  await context.event.publish(SMPEvents.Organization.TagOrganization.listed, tagOrganizations);
  return tagOrganizations;
}

/**
 * Searches for a tagOrganization by its UniqRef.
 * @param {string} UniqRef - Unique Reference of the tagOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TagOrganization>} - Found tagOrganization.
 */
async function findTagOrganizationByUniqRef(UniqRef, context) {
  if (!UniqRef) {
    throw new UserInputDataValidationError("TagOrganization UniqRef not provided", "002");
  }
  const tagOrganization = await TagOrganization.findOne({ where: { uniqRef: UniqRef } });
  if (!tagOrganization) {
    throw new UserInputDataValidationError(`TagOrganization UniqRef ${UniqRef} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.TagOrganization.visited, tagOrganization);
  return tagOrganization;
}

/**
 * Searches for a tagOrganization by its Slug.
 * @param {string} Slug - Slug of the tagOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<TagOrganization>} - Found tagOrganization.
 */
async function findTagOrganizationBySlug(Slug, context) {
  if (!Slug) {
    throw new UserInputDataValidationError("TagOrganization Slug not provided", "002");
  }
  const tagOrganization = await TagOrganization.findOne({ where: { slug: Slug } });
  if (!tagOrganization) {
    throw new UserInputDataValidationError(`TagOrganization Slug ${Slug} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.TagOrganization.visited, tagOrganization);
  return tagOrganization;
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to get a list of tagOrganizations.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<TagOrganization>>} - List of found tagOrganizations.
 */
async function tagOrganizationsResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  const filters = Array.isArray(filter) ? filter : [];
  return navigateEntityList(context, (options) => findTagOrganizations(options, context), filters, pagination, sort)
    .catch((error) => {
      throw new Error("Query::Error fetching tagOrganizations: " + error);
    });
}

/**
 * Resolver to create a new tagOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TagOrganization>} - Created tagOrganization.
 */
async function createTagOrganizationResolver(parent, { input }, context, infos) {
  return createTagOrganization(input, context);
}

/**
 * Resolver to update a tagOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the tagOrganization ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TagOrganization>} - Updated tagOrganization.
 */
async function updateTagOrganizationResolver(parent, { tagOrganizationID, input }, context, infos) {
  return updateTagOrganization(tagOrganizationID, input, context);
}

/**
 * Resolver to delete a tagOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the tagOrganization ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteTagOrganizationResolver(parent, { tagOrganizationID }, context, infos) {
  return deleteTagOrganization(tagOrganizationID, context);
}

/**
 * Resolver to get a tagOrganization by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the tagOrganization ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TagOrganization>} - Found tagOrganization.
 */
async function tagOrganizationResolver(parent, { tagOrganizationID }, context, infos) {
  return navigateEntityList(context, (options) => findTagOrganizationByID(tagOrganizationID, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching tagOrganization by ID: " + error);
    });
}

/**
 * Resolver to get tagOrganizations by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<TagOrganization>>} - List of found tagOrganizations.
 */
async function tagOrganizationsByIDsResolver(parent, { tagOrganizationIDs }, context, infos) {
  return navigateEntityList(context, (options) => findTagOrganizationsByIDs(tagOrganizationIDs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching tagOrganizations by IDs: " + error);
    });
}

/**
 * Resolver to get tagOrganizations by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<TagOrganization>>} - List of found tagOrganizations.
 */
async function tagOrganizationsBySlugsResolver(_, { slugs }, context, info) {
  return navigateEntityList(context, (options) => findTagOrganizationsBySlugs(slugs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching tagOrganizations by Slugs: " + error);
    });
}

/**
 * Resolver to get a tagOrganization by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the tagOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TagOrganization>} - Found tagOrganization.
 */
async function tagOrganizationByUniqRefResolver(_, { UniqRef }, context, infos) {
  return navigateEntityList(context, (options) => findTagOrganizationByUniqRef(UniqRef, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching tagOrganization by UniqRef: " + error);
    });
}

/**
 * Resolver to get a tagOrganization by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the tagOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<TagOrganization>} - Found tagOrganization.
 */
async function tagOrganizationBySlugResolver(_, { Slug }, context, info) {
  return navigateEntityList(context, (options) => findTagOrganizationBySlug(Slug, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching tagOrganization by Slug: " + error);
    });
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new tagOrganization object from the provided data.
 * @param {Object} tagOrganization - TagOrganization data.
 * @returns {Object} - New tagOrganization object.
 */
function tagOrganizationCreationBuilder(_, tagOrganization ) {
  let newTagOrganization = {};
  
  if (updatedTagOrganization.state) {
    newTagOrganization.state = tagOrganization.state;
  }

  if (tagOrganization.organizationID) {
    newTagOrganization.organizationID = tagOrganization.organizationID;
  }

  if (tagOrganization.tagID) {
    newTagOrganization.tagID = tagOrganization.tagID;
  }

  return newTagOrganization;
}

export {
// Export resolvers
// [QUERIES]
  tagOrganizationsResolver,
  tagOrganizationResolver,
  tagOrganizationsByIDsResolver,
  tagOrganizationsBySlugsResolver,
  tagOrganizationByUniqRefResolver,
  tagOrganizationBySlugResolver,
// [MUTATIONS]
  createTagOrganizationResolver,
  updateTagOrganizationResolver,
  deleteTagOrganizationResolver,
// Export utility functions
};
