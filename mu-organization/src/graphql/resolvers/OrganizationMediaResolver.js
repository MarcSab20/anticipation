// Import dependencies and utilities
import { OrganizationMedia, Media } from "../../index.js";
import {
  navigateEntityList,
  UserInputDataValidationError,
  db, SMPEvents,
  SMPError,saveAndPublishEntity
} from "smp-core-tools";

// Error codes for organizationMedia update and creation
const ERRORS = {
  // Update errors
  SERVER_ERR_ORGANIZATION_MEDIA_U_10: "SERVER_ERR_CATA010",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_47: "UIDVALIDATION_ERR_CATA052",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_48: "UIDVALIDATION_ERR_CATA053",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_49: "UIDVALIDATION_ERR_CATA054",
  // Creation errors
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_47: "SERVER_ERR_ORGA011",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_48: "UIDVALIDATION_ERR_ORGA042",
  ORGA_SERVER_ERR_ORGANIZATION_MEDIA_C_49: "UIDVALIDATION_ERR_ORGA043",
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

// --- Core logic for organizationMedias ---

/**
 * Searches for organizationMedias with specific options.
 * @param {Object} options - Search options (pagination, sorting, filtering, etc.).
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<OrganizationMedia>>} - List of found organizationMedias.
 */
async function findOrganizationMedias(options, context) {
  const organizationMedias = await OrganizationMedia.findAll({
    ...options,
    include: [
      {
        model: Media,
        as: 'media'
      }
    ]
  });
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.listed, organizationMedias);
  return organizationMedias;
}

/**
 * Searches for a organizationMedia by its ID.
 * @param {string} organizationMediaID - ID of the organizationMedia to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<OrganizationMedia>} - Found organizationMedia.
 */
async function findOrganizationMediaByID(organizationMediaID, context) {
  if (!organizationMediaID) {
    throw new UserInputDataValidationError("OrganizationMedia ID not provided", "002");
  }
  const organizationMedia = await OrganizationMedia.findByPk(organizationMediaID, {
    include: [
      {
        model: Media,
        as: 'media'
      }
    ]
  });
  if (!organizationMedia) {
    throw new UserInputDataValidationError(`OrganizationMedia ID ${organizationMediaID} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.visited, organizationMedia);
  return organizationMedia;
}

/**
 * Searches for organizationMedias by their IDs.
 * @param {Array<string|number>} organizationMediaIDs - List of organizationMedia IDs to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<OrganizationMedia>>} - List of found organizationMedias.
 */
async function findOrganizationMediasByIDs(organizationMediaIDs, context) {
  if (!Array.isArray(organizationMediaIDs) || organizationMediaIDs.length === 0) {
    throw new UserInputDataValidationError("OrganizationMedia IDs not provided or invalid format", "002");
  }
  const organizationMedias = await OrganizationMedia.findAll({ 
    where: { organizationMediaID: organizationMediaIDs },
    include: [
      {
        model: Media,
        as: 'media'
      }
    ]
  });
  if (organizationMedias.length === 0) {
    throw new UserInputDataValidationError(`No organizationMedias found for provided IDs`, "003");
  }
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.listed, organizationMedias);
  return organizationMedias;
}

/**
 * Creates a new organizationMedia.
 * @param {Object} input - Input data for organizationMedia creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<OrganizationMedia>} - Created organizationMedia.
 */
async function createOrganizationMedia(input, context) {

  // Generate authorID if not provided but after we will create a function
  const authorID = input.authorID || 1;
  input.authorID = authorID;
  
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating organizationMedia via organizationMediaCreation
  const organizationMediaConf = {
    entityName: "organizationMedia",
    entityIDName: "organizationMediaID",
    entityCommitCallBackFn: async (obj, opts) => await OrganizationMedia.create(obj, opts),  // OrganizationMedia creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: OrganizationMedia,
    entitySlugGenerationFn: (entity) => entity.uniqRef,  // Generate slug based on organizationMedia name
    // Validation and transaction management
    entityBuilderFn: organizationMediaCreationBuilder,  // Function to validate inputs before creation
    entityTransactionStartFn: undefined,  // Optional function to start a transaction
    entityTransactionCommitFn: async (tr) => { await tr.commit(); },  // Commit transaction
    entityTransactionRollbackFn: async (tr) => { await tr.rollback(); },  // Rollback transaction in case of errors
    entityDefinedTransaction: transaction,  // Define transaction at start
  
    // Specific error handling
    businessErrorHandlerFn: undefined,  // Domain-specific error handler
    errorCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_47,  // Error code for invalid inputs
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_48,  // Error code for missing inputs
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_ORGANIZATION_MEDIA_C_49,  // Error code for creation failure

    // Caching (optional)
    entityCacheGetFn: undefined,
    entityCacheSetFn: undefined,
    entityCacheInvalidateFn: undefined,  // Function to invalidate cache if needed
    entityCacheTTL: context.config.sensitiveCachedDataDuration,
    entityCacheValue: undefined,
    entityCacheKey: undefined,
    entityCacheKeyFn: (entity) => `r:${entity.organizationMediaID}:${entity.uniqRef}`,

    // Publishing and logging
    eventKey: SMPEvents.Organization.OrganizationMedia.created,  // Event key for organizationMedia creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) => appContext?.logger?.info("TODO: REPLACE WITH METRIC FUNCTION CALL : OrganizationMediaResolver.createOrganizationMedia auditLogFn"),  // Logs organizationMedia creation for auditing
  };

  // Save and publish the created organizationMedia
  return await saveAndPublishEntity(organizationMediaConf, input, context).then(
    (organizationMedia) => {
      return organizationMedia;
    }
  ).catch(
    async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  );
}

/**
 * Updates an existing organizationMedia.
 * @param {string} organizationMediaID - ID of the organizationMedia to update.
 * @param {Object} input - Data to update for the organizationMedia.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<OrganizationMedia>} - Updated organizationMedia.
 */
async function updateOrganizationMedia(organizationMediaID, input, context) {
  console.log("okE",SMPEvents.Organization.OrganizationMedia.updated)

  let transaction = await db.transaction();
  // Configuration for organizationMedia update via organizationMediaCreation
  const organizationMediaConf = {
    entityName: "organizationMedia",
    entityIDName: "organizationMediaID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedOrganizationMedias] = await OrganizationMedia.update(obj, { where: { organizationMediaID: organizationMediaID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`OrganizationMedia with ID ${organizationMediaID} not found`); }
      return updatedOrganizationMedias[0]; // Return updated object
    },    
    entityModel: OrganizationMedia, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_MEDIA_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_ORGANIZATION_MEDIA_C_49,

    eventKey: SMPEvents.Organization.OrganizationMedia.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(organizationMediaConf, input, context).then(
    (organizationMedia) => { 
      if(organizationMedia) return organizationMedia;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a organizationMedia by its ID.
 * @param {string} organizationMediaID - ID of the organizationMedia to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteOrganizationMedia(organizationMediaID, context) {
  const organizationMedia = await OrganizationMedia.findByPk(organizationMediaID);
  if (!organizationMedia) {
    throw new Error("OrganizationMedia not found");
  }
  await organizationMedia.destroy();
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.deleted, organizationMediaID);
  return { success: true, message: "OrganizationMedia deleted successfully" };
}

/**
 * Searches for organizationMedias by their Slugs.
 * @param {Array<string>} slugs - List of slugs to search.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<OrganizationMedia>>} - List of found organizationMedias.
 */
async function findOrganizationMediasBySlugs(slugs, context) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new UserInputDataValidationError("OrganizationMedia Slugs not provided or empty", "002");
  }
  const organizationMedias = await OrganizationMedia.findAll({ 
    where: { slug: slugs },
    include: [
      {
        model: Media,
        as: 'media'
      }
    ]
  });
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.listed, organizationMedias);
  return organizationMedias;
}

/**
 * Searches for a organizationMedia by its UniqRef.
 * @param {string} UniqRef - Unique Reference of the organizationMedia.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<OrganizationMedia>} - Found organizationMedia.
 */
async function findOrganizationMediaByUniqRef(UniqRef, context) {
  if (!UniqRef) {
    throw new UserInputDataValidationError("OrganizationMedia UniqRef not provided", "002");
  }
  const organizationMedia = await OrganizationMedia.findOne({ 
    where: { uniqRef: UniqRef },
    include: [
      {
        model: Media,
        as: 'media'
      }
    ]
  });
  if (!organizationMedia) {
    throw new UserInputDataValidationError(`OrganizationMedia UniqRef ${UniqRef} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.visited, organizationMedia);
  return organizationMedia;
}

/**
 * Searches for a organizationMedia by its Slug.
 * @param {string} Slug - Slug of the organizationMedia.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<OrganizationMedia>} - Found organizationMedia.
 */
async function findOrganizationMediaBySlug(Slug, context) {
  if (!Slug) {
    throw new UserInputDataValidationError("OrganizationMedia Slug not provided", "002");
  }
  const organizationMedia = await OrganizationMedia.findOne({ 
    where: { slug: Slug },
    include: [
      {
        model: Media,
        as: 'media'
      }
    ]
  });
  if (!organizationMedia) {
    throw new UserInputDataValidationError(`OrganizationMedia Slug ${Slug} not found`, "001");
  }
  await context.event.publish(SMPEvents.Organization.OrganizationMedia.visited, organizationMedia);
  return organizationMedia;
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to get a list of organizationMedias.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<OrganizationMedia>>} - List of found organizationMedias.
 */
async function organizationMediasResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  const filters = Array.isArray(filter) ? filter : [];
  return navigateEntityList(context, (options) => findOrganizationMedias(options, context), filters, pagination, sort)
    .catch((error) => {
      throw new Error("Query::Error fetching organizationMedias: " + error);
    });
}

/**
 * Resolver to create a new organizationMedia.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<OrganizationMedia>} - Created organizationMedia.
 */
async function createOrganizationMediaResolver(parent, { input }, context, infos) {
  return createOrganizationMedia(input, context);
}

/**
 * Resolver to update a organizationMedia.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the organizationMedia ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<OrganizationMedia>} - Updated organizationMedia.
 */
async function updateOrganizationMediaResolver(parent, { organizationMediaID, input }, context, infos) {
  return updateOrganizationMedia(organizationMediaID, input, context);
}

/**
 * Resolver to delete a organizationMedia.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the organizationMedia ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteOrganizationMediaResolver(parent, { organizationMediaID }, context, infos) {
  return deleteOrganizationMedia(organizationMediaID, context);
}

/**
 * Resolver to get a organizationMedia by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the organizationMedia ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<OrganizationMedia>} - Found organizationMedia.
 */
async function organizationMediaResolver(parent, { organizationMediaID }, context, infos) {
  return navigateEntityList(context, (options) => findOrganizationMediaByID(organizationMediaID, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizationMedia by ID: " + error);
    });
}

/**
 * Resolver to get organizationMedias by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<OrganizationMedia>>} - List of found organizationMedias.
 */
async function organizationMediasByIDsResolver(parent, { organizationMediaIDs }, context, infos) {
  return navigateEntityList(context, (options) => findOrganizationMediasByIDs(organizationMediaIDs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizationMedias by IDs: " + error);
    });
}

/**
 * Resolver to get organizationMedias by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<OrganizationMedia>>} - List of found organizationMedias.
 */
async function organizationMediasBySlugsResolver(_, { slugs }, context, info) {
  return navigateEntityList(context, (options) => findOrganizationMediasBySlugs(slugs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizationMedias by Slugs: " + error);
    });
}

/**
 * Resolver to get a organizationMedia by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the organizationMedia.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<OrganizationMedia>} - Found organizationMedia.
 */
async function organizationMediaByUniqRefResolver(_, { UniqRef }, context, infos) {
  return navigateEntityList(context, (options) => findOrganizationMediaByUniqRef(UniqRef, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizationMedia by UniqRef: " + error);
    });
}

/**
 * Resolver to get a organizationMedia by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the organizationMedia.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<OrganizationMedia>} - Found organizationMedia.
 */
async function organizationMediaBySlugResolver(_, { Slug }, context, info) {
  return navigateEntityList(context, (options) => findOrganizationMediaBySlug(Slug, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizationMedia by Slug: " + error);
    });
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new organizationMedia object from the provided data.
 * @param {Object} organizationMedia - OrganizationMedia data.
 * @returns {Object} - New organizationMedia object.
 */
function organizationMediaCreationBuilder(_, organizationMedia) {
  let newOrganizationMedia = {};

  if (organizationMedia.state) {
    newOrganizationMedia.state = organizationMedia.state;
  }

  if (organizationMedia.authorID) {
    newOrganizationMedia.authorID = organizationMedia.authorID;
  }
  if (organizationMedia.organizationID) {
    newOrganizationMedia.organizationID = organizationMedia.organizationID;
  }

  // Le champ legend est obligatoire pour le mapping des médias
  if (!organizationMedia.legend) {
    throw new UserInputDataValidationError("Legend is required for OrganizationMedia", "002");
  }
  newOrganizationMedia.legend = organizationMedia.legend;

  if (organizationMedia.mediaID) {
    newOrganizationMedia.mediaID = organizationMedia.mediaID;
  }

  if (organizationMedia.listingPosition) {
    newOrganizationMedia.listingPosition = organizationMedia.listingPosition;
  }

  return newOrganizationMedia;
}

export {
// Export resolvers
// [QUERIES]
  organizationMediasResolver,
  organizationMediaResolver,
  organizationMediasByIDsResolver,
  organizationMediasBySlugsResolver,
  organizationMediaByUniqRefResolver,
  organizationMediaBySlugResolver,
// [MUTATIONS]
  createOrganizationMediaResolver,
  updateOrganizationMediaResolver,
  deleteOrganizationMediaResolver,
// Export utility functions
};
