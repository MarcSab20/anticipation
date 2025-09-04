// Import dependencies and utilities
import { FaqOrganization } from "../../index.js";
import {
  navigateEntityList,
  UserInputDataValidationError,
  db, SMPEvents

} from "smp-core-tools";

// Error codes for faqOrganization update and creation
const ERRORS = {
  // Update errors
  SERVER_ERR_FAQ_ORGANIZATION_U_10: "SERVER_ERR_CATA010",
  ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_47: "UIDVALIDATION_ERR_CATA052",
  ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_48: "UIDVALIDATION_ERR_CATA053",
  ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_49: "UIDVALIDATION_ERR_CATA054",
  // Creation errors
  ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_47: "SERVER_ERR_ORGA011",
  ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_48: "UIDVALIDATION_ERR_ORGA042",
  ORGA_SERVER_ERR_FAQ_ORGANIZATION_C_49: "UIDVALIDATION_ERR_ORGA043",
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

// --- Core logic for faqOrganizations ---

/**
 * Searches for faqOrganizations with specific options.
 * @param {Object} options - Search options (pagination, sorting, filtering, etc.).
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<FaqOrganization>>} - List of found faqOrganizations.
 */
async function findFaqOrganizations(options, context) {
  const faqOrganizations = await FaqOrganization.findAll(options);
  await context.event.publish(SMPEvents.Organization.FaqOrganization.listed, faqOrganizations);
  return faqOrganizations;
}

/**
 * Searches for a faqOrganization by its ID.
 * @param {string} faqOrganizationID - ID of the faqOrganization to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<FaqOrganization>} - Found faqOrganization.
 */
async function findFaqOrganizationByID(faqOrganizationID, context) {
  if (!faqOrganizationID) {
    throw new UserInputDataValidationError("FaqOrganization ID not provided", "002");
  }
  const faqOrganization = await FaqOrganization.findByPk(faqOrganizationID);
  if (!faqOrganization) {
    throw new UserInputDataValidationError(`FaqOrganization ID ${faqOrganizationID} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.FaqOrganization.visited, faqOrganization);
  return faqOrganization;
}

/**
 * Searches for faqOrganizations by their IDs.
 * @param {Array<string|number>} faqOrganizationIDs - List of faqOrganization IDs to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<FaqOrganization>>} - List of found faqOrganizations.
 */
async function findFaqOrganizationsByIDs(faqOrganizationIDs, context) {
  if (!Array.isArray(faqOrganizationIDs) || faqOrganizationIDs.length === 0) {
    throw new UserInputDataValidationError("FaqOrganization IDs not provided or invalid format", "002");
  }
  const faqOrganizations = await FaqOrganization.findAll({ where: { faqOrganizationID: faqOrganizationIDs } });
  if (faqOrganizations.length === 0) {
    throw new UserInputDataValidationError(`No faqOrganizations found for provided IDs`, "003");
  }
  await context.event.publish(SMPEvents.Organization.FaqOrganization.listed, faqOrganizations);
  return faqOrganizations;
}

/**
 * Creates a new faqOrganization.
 * @param {Object} input - Input data for faqOrganization creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<FaqOrganization>} - Created faqOrganization.
 */
async function createFaqOrganization(input, context) {

  // Generate authorID if not provided but after we will create a function
  const authorID = input.authorID || 1;
  input.authorID = authorID;
  
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating faqOrganization via faqOrganizationCreation
  const faqOrganizationConf = {
    entityName: "faqOrganization",
    entityIDName: "faqOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => await FaqOrganization.create(obj, opts),  // FaqOrganization creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: FaqOrganization,
    entitySlugGenerationFn: (entity) => "entity.faqOrganizationName",  // Generate slug based on faqOrganization name
    // Validation and transaction management
    entityBuilderFn: faqOrganizationCreationBuilder,  // Function to validate inputs before creation
    entityTransactionStartFn: undefined,  // Optional function to start a transaction
    entityTransactionCommitFn: async (tr) => { await tr.commit(); },  // Commit transaction
    entityTransactionRollbackFn: async (tr) => { await tr.rollback(); },  // Rollback transaction in case of errors
    entityDefinedTransaction: transaction,  // Define transaction at start
  
    // Specific error handling
    businessErrorHandlerFn: undefined,  // Domain-specific error handler
    errorCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_47,  // Error code for invalid inputs
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_48,  // Error code for missing inputs
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_FAQ_ORGANIZATION_C_49,  // Error code for creation failure

    // Caching (optional)
    entityCacheGetFn: undefined,
    entityCacheSetFn: undefined,
    entityCacheInvalidateFn: undefined,  // Function to invalidate cache if needed
    entityCacheTTL: context.config.sensitiveCachedDataDuration,
    entityCacheValue: undefined,
    entityCacheKey: undefined,
    entityCacheKeyFn: (entity) => `r:${entity.faqOrganizationID}:${entity.uniqRef}`,

    // Publishing and logging
    eventKey: SMPEvents.Organization.FaqOrganization.created,  // Event key for faqOrganization creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) => appContext?.logger?.info("TODO: REPLACE WITH METRIC FUNCTION CALL : FaqOrganizationResolver.createFaqOrganization auditLogFn"),  // Logs faqOrganization creation for auditing
  };

  // Save and publish the created faqOrganization
  return await saveAndPublishEntity(faqOrganizationConf, input, context).then(
    (faqOrganization) => {
      return faqOrganization;
    }
  ).catch(
    async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  );
}

/**
 * Updates an existing faqOrganization.
 * @param {string} faqOrganizationID - ID of the faqOrganization to update.
 * @param {Object} input - Data to update for the faqOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<FaqOrganization>} - Updated faqOrganization.
 */
async function updateFaqOrganization(faqOrganizationID, input, context) {
  console.log("okE",SMPEvents.Organization.FaqOrganization.updated)

  let transaction = await db.transaction();
  // Configuration for faqOrganization update via faqOrganizationCreation
  const faqOrganizationConf = {
    entityName: "faqOrganization",
    entityIDName: "faqOrganizationID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedFaqOrganizations] = await FaqOrganization.update(obj, { where: { faqOrganizationID: faqOrganizationID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`FaqOrganization with ID ${faqOrganizationID} not found`); }
      return updatedFaqOrganizations[0]; // Return updated object
    },    
    entityModel: FaqOrganization, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_FAQ_ORGANIZATION_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_FAQ_ORGANIZATION_C_49,

    eventKey: SMPEvents.Organization.FaqOrganization.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(faqOrganizationConf, input, context).then(
    (faqOrganization) => { 
      if(faqOrganization) return faqOrganization;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a faqOrganization by its ID.
 * @param {string} faqOrganizationID - ID of the faqOrganization to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteFaqOrganization(faqOrganizationID, context) {
  const faqOrganization = await FaqOrganization.findByPk(faqOrganizationID);
  if (!faqOrganization) {
    throw new Error("FaqOrganization not found");
  }
  await faqOrganization.destroy();
  await context.event.publish(SMPEvents.Organization.FaqOrganization.deleted, faqOrganizationID);
  return { success: true, message: "FaqOrganization deleted successfully" };
}

/**
 * Searches for faqOrganizations by their Slugs.
 * @param {Array<string>} slugs - List of slugs to search.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<FaqOrganization>>} - List of found faqOrganizations.
 */
async function findFaqOrganizationsBySlugs(slugs, context) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new UserInputDataValidationError("FaqOrganization Slugs not provided or empty", "002");
  }
  const faqOrganizations = await FaqOrganization.findAll({ where: { slug: slugs } });
  await context.event.publish(SMPEvents.Organization.FaqOrganization.listed, faqOrganizations);
  return faqOrganizations;
}

/**
 * Searches for a faqOrganization by its UniqRef.
 * @param {string} UniqRef - Unique Reference of the faqOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<FaqOrganization>} - Found faqOrganization.
 */
async function findFaqOrganizationByUniqRef(UniqRef, context) {
  if (!UniqRef) {
    throw new UserInputDataValidationError("FaqOrganization UniqRef not provided", "002");
  }
  const faqOrganization = await FaqOrganization.findOne({ where: { uniqRef: UniqRef } });
  if (!faqOrganization) {
    throw new UserInputDataValidationError(`FaqOrganization UniqRef ${UniqRef} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.FaqOrganization.visited, faqOrganization);
  return faqOrganization;
}

/**
 * Searches for a faqOrganization by its Slug.
 * @param {string} Slug - Slug of the faqOrganization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<FaqOrganization>} - Found faqOrganization.
 */
async function findFaqOrganizationBySlug(Slug, context) {
  if (!Slug) {
    throw new UserInputDataValidationError("FaqOrganization Slug not provided", "002");
  }
  const faqOrganization = await FaqOrganization.findOne({ where: { slug: Slug } });
  if (!faqOrganization) {
    throw new UserInputDataValidationError(`FaqOrganization Slug ${Slug} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.FaqOrganization.visited, faqOrganization);
  return faqOrganization;
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to get a list of faqOrganizations.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<FaqOrganization>>} - List of found faqOrganizations.
 */
async function faqOrganizationsResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  const filters = Array.isArray(filter) ? filter : [];
  return navigateEntityList(context, (options) => findFaqOrganizations(options, context), filters, pagination, sort)
    .catch((error) => {
      throw new Error("Query::Error fetching faqOrganizations: " + error);
    });
}

/**
 * Resolver to create a new faqOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<FaqOrganization>} - Created faqOrganization.
 */
async function createFaqOrganizationResolver(parent, { input }, context, infos) {
  return createFaqOrganization(input, context);
}

/**
 * Resolver to update a faqOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the faqOrganization ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<FaqOrganization>} - Updated faqOrganization.
 */
async function updateFaqOrganizationResolver(parent, { faqOrganizationID, input }, context, infos) {
  return updateFaqOrganization(faqOrganizationID, input, context);
}

/**
 * Resolver to delete a faqOrganization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the faqOrganization ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteFaqOrganizationResolver(parent, { faqOrganizationID }, context, infos) {
  return deleteFaqOrganization(faqOrganizationID, context);
}

/**
 * Resolver to get a faqOrganization by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the faqOrganization ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<FaqOrganization>} - Found faqOrganization.
 */
async function faqOrganizationResolver(parent, { faqOrganizationID }, context, infos) {
  return navigateEntityList(context, (options) => findFaqOrganizationByID(faqOrganizationID, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching faqOrganization by ID: " + error);
    });
}

/**
 * Resolver to get faqOrganizations by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<FaqOrganization>>} - List of found faqOrganizations.
 */
async function faqOrganizationsByIDsResolver(parent, { faqOrganizationIDs }, context, infos) {
  return navigateEntityList(context, (options) => findFaqOrganizationsByIDs(faqOrganizationIDs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching faqOrganizations by IDs: " + error);
    });
}

/**
 * Resolver to get faqOrganizations by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<FaqOrganization>>} - List of found faqOrganizations.
 */
async function faqOrganizationsBySlugsResolver(_, { slugs }, context, info) {
  return navigateEntityList(context, (options) => findFaqOrganizationsBySlugs(slugs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching faqOrganizations by Slugs: " + error);
    });
}

/**
 * Resolver to get a faqOrganization by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the faqOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<FaqOrganization>} - Found faqOrganization.
 */
async function faqOrganizationByUniqRefResolver(_, { UniqRef }, context, infos) {
  return navigateEntityList(context, (options) => findFaqOrganizationByUniqRef(UniqRef, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching faqOrganization by UniqRef: " + error);
    });
}

/**
 * Resolver to get a faqOrganization by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the faqOrganization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<FaqOrganization>} - Found faqOrganization.
 */
async function faqOrganizationBySlugResolver(_, { Slug }, context, info) {
  return navigateEntityList(context, (options) => findFaqOrganizationBySlug(Slug, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching faqOrganization by Slug: " + error);
    });
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new faqOrganization object from the provided data.
 * @param {Object} faqOrganization - FaqOrganization data.
 * @returns {Object} - New faqOrganization object.
 */
function faqOrganizationCreationBuilder(_, faqOrganization ) {
  let newFaqOrganization = {};
  
  if (faqOrganization.state) {
    newFaqOrganization.state = faqOrganization.state;
  }

  if (faqOrganization.authorID) {
    newFaqOrganization.authorID = faqOrganization.authorID;
  }

  if (faqOrganization.organizationID) {
    newFaqOrganization.organizationID = faqOrganization.organizationID;
  }

  if (faqOrganization.faqQuestionID) {
    newFaqOrganization.faqQuestionID = faqOrganization.faqQuestionID;
  }

  if (faqOrganization.faqAnswerID) {
    newFaqOrganization.faqAnswerID = faqOrganization.faqAnswerID;
  }
  if (faqOrganization.order) {
    newFaqOrganization.order = faqOrganization.order;
  }
 

  return newFaqOrganization;
}

export {
// Export resolvers
// [QUERIES]
  faqOrganizationsResolver,
  faqOrganizationResolver,
  faqOrganizationsByIDsResolver,
  faqOrganizationsBySlugsResolver,
  faqOrganizationByUniqRefResolver,
  faqOrganizationBySlugResolver,
// [MUTATIONS]
  createFaqOrganizationResolver,
  updateFaqOrganizationResolver,
  deleteFaqOrganizationResolver,
// Export utility functions
};
