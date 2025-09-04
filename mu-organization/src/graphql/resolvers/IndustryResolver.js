// Import dependencies and utilities
import { Industry } from "../../index.js";
import {
  navigateEntityList,
  UserInputDataValidationError,
  db,SMPEvents

} from "smp-core-tools";

// Error codes for industry update and creation
const ERRORS = {
  // Update errors
  SERVER_ERR_INDUSTRY_U_10: "SERVER_ERR_CATA010",
  ORGA_UI_VALIDATION_ERR_INDUSTRY_C_47: "UIDVALIDATION_ERR_CATA052",
  ORGA_UI_VALIDATION_ERR_INDUSTRY_C_48: "UIDVALIDATION_ERR_CATA053",
  ORGA_UI_VALIDATION_ERR_INDUSTRY_C_49: "UIDVALIDATION_ERR_CATA054",
  // Creation errors
  ORGA_UI_VALIDATION_ERR_INDUSTRY_C_47: "SERVER_ERR_ORGA011",
  ORGA_UI_VALIDATION_ERR_INDUSTRY_C_48: "UIDVALIDATION_ERR_ORGA042",
  ORGA_SERVER_ERR_INDUSTRY_C_49: "UIDVALIDATION_ERR_ORGA043",
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

// --- Core logic for industrys ---

/**
 * Searches for industrys with specific options.
 * @param {Object} options - Search options (pagination, sorting, filtering, etc.).
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<Industry>>} - List of found industrys.
 */
async function findIndustrys(options, context) {
  const industrys = await Industry.findAll(options);
  await context.event.publish(SMPEvents.Organization.Industry.listed, industrys);
  return industrys;
}

/**
 * Searches for a industry by its ID.
 * @param {string} industryID - ID of the industry to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Industry>} - Found industry.
 */
async function findIndustryByID(industryID, context) {
  if (!industryID) {
    throw new UserInputDataValidationError("Industry ID not provided", "002");
  }
  const industry = await Industry.findByPk(industryID);
  if (!industry) {
    throw new UserInputDataValidationError(`Industry ID ${industryID} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.Industry.visited, industry);
  return industry;
}

/**
 * Searches for industrys by their IDs.
 * @param {Array<string|number>} industryIDs - List of industry IDs to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<Industry>>} - List of found industrys.
 */
async function findIndustrysByIDs(industryIDs, context) {
  if (!Array.isArray(industryIDs) || industryIDs.length === 0) {
    throw new UserInputDataValidationError("Industry IDs not provided or invalid format", "002");
  }
  const industrys = await Industry.findAll({ where: { industryID: industryIDs } });
  if (industrys.length === 0) {
    throw new UserInputDataValidationError(`No industrys found for provided IDs`, "003");
  }
  await context.event.publish(SMPEvents.Organization.Industry.listed, industrys);
  return industrys;
}

/**
 * Creates a new industry.
 * @param {Object} input - Input data for industry creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Industry>} - Created industry.
 */
async function createIndustry(input, context) {

    // Generate authorID if not provided but after we will create a function
    const authorID = input.authorID || 1;
    input.authorID = authorID;z
  
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating industry via industryCreation
  const industryConf = {
    entityName: "industry",
    entityIDName: "industryID",
    entityCommitCallBackFn: async (obj, opts) => await Industry.create(obj, opts),  // Industry creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: Industry,
    entitySlugGenerationFn: (entity) => entity.title,  // Generate slug based on industry name
    // Validation and transaction management
    entityBuilderFn: industryCreationBuilder,  // Function to validate inputs before creation
    entityTransactionStartFn: undefined,  // Optional function to start a transaction
    entityTransactionCommitFn: async (tr) => { await tr.commit(); },  // Commit transaction
    entityTransactionRollbackFn: async (tr) => { await tr.rollback(); },  // Rollback transaction in case of errors
    entityDefinedTransaction: transaction,  // Define transaction at start
  
    // Specific error handling
    businessErrorHandlerFn: undefined,  // Domain-specific error handler
    errorCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_INDUSTRY_C_47,  // Error code for invalid inputs
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_INDUSTRY_C_48,  // Error code for missing inputs
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_INDUSTRY_C_49,  // Error code for creation failure

    // Caching (optional)
    entityCacheGetFn: undefined,
    entityCacheSetFn: undefined,
    entityCacheInvalidateFn: undefined,  // Function to invalidate cache if needed
    entityCacheTTL: context.config.sensitiveCachedDataDuration,
    entityCacheValue: undefined,
    entityCacheKey: undefined,
    entityCacheKeyFn: (entity) => `r:${entity.industryID}:${entity.uniqRef}`,

    // Publishing and logging
    eventKey: SMPEvents.Organization.Industry.created,  // Event key for industry creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) => appContext?.logger?.info("TODO: REPLACE WITH METRIC FUNCTION CALL : IndustryResolver.createIndustry auditLogFn"),  // Logs industry creation for auditing
  };

  // Save and publish the created industry
  return await saveAndPublishEntity(industryConf, input, context).then(
    (industry) => {
      return industry;
    }
  ).catch(
    async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  );
}

/**
 * Updates an existing industry.
 * @param {string} industryID - ID of the industry to update.
 * @param {Object} input - Data to update for the industry.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Industry>} - Updated industry.
 */
async function updateIndustry(industryID, input, context) {
  console.log("okE",SMPEvents.Organization.Industry.updated)

  let transaction = await db.transaction();
  // Configuration for industry update via industryCreation
  const industryConf = {
    entityName: "industry",
    entityIDName: "industryID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedIndustrys] = await Industry.update(obj, { where: { industryID: industryID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`Industry with ID ${industryID} not found`); }
      return updatedIndustrys[0]; // Return updated object
    },    
    entityModel: Industry, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_INDUSTRY_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_INDUSTRY_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_INDUSTRY_C_49,

    eventKey: SMPEvents.Organization.Industry.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(industryConf, input, context).then(
    (industry) => { 
      if(industry) return industry;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a industry by its ID.
 * @param {string} industryID - ID of the industry to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteIndustry(industryID, context) {
  const industry = await Industry.findByPk(industryID);
  if (!industry) {
    throw new Error("Industry not found");
  }
  await industry.destroy();
  await context.event.publish(SMPEvents.Organization.Industry.deleted, industryID);
  return { success: true, message: "Industry deleted successfully" };
}

/**
 * Searches for industrys by their Slugs.
 * @param {Array<string>} slugs - List of slugs to search.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<Industry>>} - List of found industrys.
 */
async function findIndustrysBySlugs(slugs, context) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new UserInputDataValidationError("Industry Slugs not provided or empty", "002");
  }
  const industrys = await Industry.findAll({ where: { slug: slugs } });
  await context.event.publish(SMPEvents.Organization.Industry.listed, industrys);
  return industrys;
}

/**
 * Searches for a industry by its UniqRef.
 * @param {string} UniqRef - Unique Reference of the industry.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Industry>} - Found industry.
 */
async function findIndustryByUniqRef(UniqRef, context) {
  if (!UniqRef) {
    throw new UserInputDataValidationError("Industry UniqRef not provided", "002");
  }
  const industry = await Industry.findOne({ where: { uniqRef: UniqRef } });
  if (!industry) {
    throw new UserInputDataValidationError(`Industry UniqRef ${UniqRef} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.Industry.visited, industry);
  return industry;
}

/**
 * Searches for a industry by its Slug.
 * @param {string} Slug - Slug of the industry.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Industry>} - Found industry.
 */
async function findIndustryBySlug(Slug, context) {
  if (!Slug) {
    throw new UserInputDataValidationError("Industry Slug not provided", "002");
  }
  const industry = await Industry.findOne({ where: { slug: Slug } });
  if (!industry) {
    throw new UserInputDataValidationError(`Industry Slug ${Slug} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.Industry.visited, industry);
  return industry;
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to get a list of industrys.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<Industry>>} - List of found industrys.
 */
async function industrysResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  const filters = Array.isArray(filter) ? filter : [];
  return navigateEntityList(context, (options) => findIndustrys(options, context), filters, pagination, sort)
    .catch((error) => {
      throw new Error("Query::Error fetching industrys: " + error);
    });
}

/**
 * Resolver to create a new industry.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Industry>} - Created industry.
 */
async function createIndustryResolver(parent, { input }, context, infos) {
  return createIndustry(input, context);
}

/**
 * Resolver to update a industry.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the industry ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Industry>} - Updated industry.
 */
async function updateIndustryResolver(parent, { industryID, input }, context, infos) {
  return updateIndustry(industryID, input, context);
}

/**
 * Resolver to delete a industry.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the industry ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteIndustryResolver(parent, { industryID }, context, infos) {
  return deleteIndustry(industryID, context);
}

/**
 * Resolver to get a industry by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the industry ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Industry>} - Found industry.
 */
async function industryResolver(parent, { industryID }, context, infos) {
  return navigateEntityList(context, (options) => findIndustryByID(industryID, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching industry by ID: " + error);
    });
}

/**
 * Resolver to get industrys by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<Industry>>} - List of found industrys.
 */
async function industrysByIDsResolver(parent, { industryIDs }, context, infos) {
  return navigateEntityList(context, (options) => findIndustrysByIDs(industryIDs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching industrys by IDs: " + error);
    });
}

/**
 * Resolver to get industrys by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<Industry>>} - List of found industrys.
 */
async function industrysBySlugsResolver(_, { slugs }, context, info) {
  return navigateEntityList(context, (options) => findIndustrysBySlugs(slugs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching industrys by Slugs: " + error);
    });
}

/**
 * Resolver to get a industry by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the industry.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Industry>} - Found industry.
 */
async function industryByUniqRefResolver(_, { UniqRef }, context, infos) {
  return navigateEntityList(context, (options) => findIndustryByUniqRef(UniqRef, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching industry by UniqRef: " + error);
    });
}

/**
 * Resolver to get a industry by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the industry.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Industry>} - Found industry.
 */
async function industryBySlugResolver(_, { Slug }, context, info) {
  return navigateEntityList(context, (options) => findIndustryBySlug(Slug, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching industry by Slug: " + error);
    });
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new industry object from the provided data.
 * @param {Object} industry - Industry data.
 * @returns {Object} - New industry object.
 */
function industryCreationBuilder(_, industry ) {
  let newIndustry = {}
  
    if (updatedIndustry.state) {
      newIndustry.state = industry.state
    }
  
    if (industry.authorID ) {
      newIndustry.authorID = industry.authorID;
    }
   
    if (industry.title) {
      newIndustry.title = industry.title;
    }
    
    if (industry.description) {
      newIndustry.description = industry.description;
    }
    
    if (industry.level) {
      newIndustry.level = industry.level;
    }
    
    if (industry.parentIndustryID) {
      newIndustry.parentIndustryID = industry.parentIndustryID;
    }
    
    
  
    return newIndustry;
  };

export {
// Export resolvers
// [QUERIES]
  industrysResolver,
  industryResolver,
  industrysByIDsResolver,
  industrysBySlugsResolver,
  industryByUniqRefResolver,
  industryBySlugResolver,
// [MUTATIONS]
  createIndustryResolver,
  updateIndustryResolver,
  deleteIndustryResolver,
// Export utility functions
};
