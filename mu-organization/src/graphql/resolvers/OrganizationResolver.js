// Import dependencies and utilities
import { Organization, OrganizationMedia, Media } from "../../index.js";
import {
  navigateEntityList,
  UserInputDataValidationError,
  db, saveAndPublishEntity, SMPError, SMPEvents

} from "smp-core-tools";
import {assignSuperAdminToOrganization} from "./MemberOrganizationResolver.js";

// Error codes for organization update and creation
const ERRORS = {
  // Update errors
  SERVER_ERR_ORGANIZATION_U_10: "SERVER_ERR_CATA010",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_47: "UIDVALIDATION_ERR_CATA052",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_48: "UIDVALIDATION_ERR_CATA053",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_49: "UIDVALIDATION_ERR_CATA054",
  // Creation errors
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_47: "SERVER_ERR_ORGA011",
  ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_48: "UIDVALIDATION_ERR_ORGA042",
  ORGA_SERVER_ERR_ORGANIZATION_C_49: "UIDVALIDATION_ERR_ORGA043",
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

// --- Core logic for organizations ---

/**
 * Attache les médias aux organisations
 * @param {Array<Organization>|Organization} organizations - Organisation(s) à enrichir avec les médias
 * @returns {Promise<Array<Organization>|Organization>} - Organisation(s) avec les médias attachés
 */
async function attachMediaToOrganizations(organizations) {
  // Convertir en tableau si une seule organisation
  const orgsArray = Array.isArray(organizations) ? organizations : [organizations];
  
  // Récupérer tous les IDs de médias nécessaires
  const mediaIDs = orgsArray.reduce((ids, org) => {
    if (org.smallLogo) ids.push(org.smallLogo);
    if (org.bigLogo) ids.push(org.bigLogo);
    if (org.banner) ids.push(org.banner);
    return ids;
  }, []);

  // Si aucun média n'est nécessaire, retourner les organisations telles quelles
  if (mediaIDs.length === 0) {
    return organizations;
  }

  // Récupérer tous les médias nécessaires
  const media = await OrganizationMedia.findAll({
    where: {
      organizationMediaID: mediaIDs,
      state: 'online'
    },
    include: [
      {
        model: Media,
        as: 'media',
        attributes: ['mediaID', 'url']
      }
    ]
  });

  // Attacher les médias aux organisations
  const enrichedOrgs = orgsArray.map(org => {
    const orgMedia = media.filter(m => 
      m.organizationID === org.organizationID && (
        m.organizationMediaID === org.smallLogo || 
        m.organizationMediaID === org.bigLogo || 
        m.organizationMediaID === org.banner
      )
    );

    return {
      ...org.toJSON(),
      organizationMedia: orgMedia
    };
  });

  // Retourner un seul objet si une seule organisation était fournie
  return Array.isArray(organizations) ? enrichedOrgs : enrichedOrgs[0];
}

/**
 * Récupère les URLs des médias d'une organisation à partir de leurs IDs
 * @param {Organization} organization - L'objet organisation
 * @returns {Object} - Organisation avec les URLs des médias (smallLogo, bigLogo, banner)
 */
function getOrganizationMediaURL(organization) {
  if (!organization) return organization;

  const formattedOrg = organization.toJSON ? organization.toJSON() : organization;
  
  // Créer un map des Media par leur ID
  const mediaMap = {};
  if (formattedOrg.organizationMedia && Array.isArray(formattedOrg.organizationMedia)) {
    formattedOrg.organizationMedia.forEach(orgMedia => {
      if (orgMedia.media && orgMedia.organizationID === formattedOrg.organizationID) {
        mediaMap[orgMedia.organizationMediaID] = orgMedia.media.url;
      }
    });
  }

  // Vérifier si les champs media existent dans l'organisation
  if (!formattedOrg.smallLogo && !formattedOrg.bigLogo && !formattedOrg.banner) {
    return formattedOrg;
  }

  // Mapper les URLs directement depuis les IDs des médias
  formattedOrg.smallLogoUrl = formattedOrg.smallLogo ? mediaMap[formattedOrg.smallLogo] || null : null;
  formattedOrg.bigLogoUrl = formattedOrg.bigLogo ? mediaMap[formattedOrg.bigLogo] || null : null;
  formattedOrg.bannerUrl = formattedOrg.banner ? mediaMap[formattedOrg.banner] || null : null;

  return formattedOrg;
}

/**
 * Searches for organizations with specific options.
 * @param {Object} options - Search options (pagination, sorting, filtering, etc.).
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<Organization>>} - List of found organizations.
 */
async function findOrganizations(options, context) {
  const organizations = await Organization.findAll(options);
  return attachMediaToOrganizations(organizations);
}

/**
 * Searches for a organization by its ID.
 * @param {string} organizationID - ID of the organization to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Organization>} - Found organization.
 */
async function findOrganizationByID(organizationID, context) {
  if (!organizationID) {
    throw new UserInputDataValidationError("Organization ID not provided", "002");
  }

  const organization = await Organization.findByPk(organizationID);
  if (!organization) {
    throw new UserInputDataValidationError(`Organization with ID ${organizationID} not found`, "001");
  }

  return attachMediaToOrganizations(organization);
}

/**
 * Searches for organizations by their IDs.
 * @param {Array<string|number>} organizationIDs - List of organization IDs to retrieve.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<Organization>>} - List of found organizations.
 */
async function findOrganizationsByIDs(organizationIDs, context) {
  if (!Array.isArray(organizationIDs) || organizationIDs.length === 0) {
    throw new UserInputDataValidationError("Organization IDs not provided or invalid format", "002");
  }

  const organizations = await Organization.findAll({
    where: { organizationID: organizationIDs }
  });

  return attachMediaToOrganizations(organizations);
}

/**
 * Creates a new organization.
 * @param {Object} input - Input data for organization creation.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Organization>} - Created organization.
 */
async function createOrganization(input, context) {
  let transaction = await db.transaction();  // Begin transaction

  // Configuration for creating organization via organizationCreation
  const organizationConf = {
    entityName: "organization",
    entityIDName: "organizationID",
    entityCommitCallBackFn: async (obj, opts) => await Organization.create(obj, opts),  // Organization creation function in the database
    slugAggregateUUIDRight: false,
    entityModel: Organization,
    entityModelUUIDFn: () => Organization.uuid(), // Generate UUID for organization
    entitySlugGenerationFn: (entity) => Organization.slug(entity.uniqRef),  // Generate slug based on organization's uniqRef
    // Validation and transaction management
    entityBuilderFn: organizationCreationBuilder,  // Function to validate inputs before creation
    entityTransactionStartFn: undefined,  // Optional function to start a transaction
    entityTransactionCommitFn: async (tr) => { await tr.commit(); },  // Commit transaction
    entityTransactionRollbackFn: async (tr) => { await tr.rollback(); },  // Rollback transaction in case of errors
    entityDefinedTransaction: transaction,  // Define transaction at start
  
    // Specific error handling
    businessErrorHandlerFn: undefined,  // Domain-specific error handler
    errorCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_47,  // Error code for invalid inputs
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_48,  // Error code for missing inputs
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_ORGANIZATION_C_49,  // Error code for creation failure

    // Caching (optional)
    entityCacheGetFn: undefined,
    entityCacheSetFn: undefined,
    entityCacheInvalidateFn: undefined,  // Function to invalidate cache if needed
    entityCacheTTL: context.config.sensitiveCachedDataDuration,
    entityCacheValue: undefined,
    entityCacheKey: undefined,
    // Ici on suppose que la clé de cache est basée sur l'identifiant de l'organisation
    entityCacheKeyFn: (ent) => cacheKey.organization(ent.organizationID),

    // Publishing and logging
    eventKey: SMPEvents.Organization.Organization.created,  // Event key for organization creation
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),  // Event publishing function
    auditLogFn: (entity, appContext) =>
      appContext?.logger?.info("Organization created: " + entity.organizationID),
  };

  // Save and publish the created organization, then assign the super admin role if an authorID is provided.
  return await saveAndPublishEntity(organizationConf, input, context)
    .then(async (organization) => {
      if (input.authorID) {
        await assignSuperAdminToOrganization(organization.organizationID, input.authorID, context);
      }
      return organization;
    })
    .catch(async (reason) => {
      context.logger.error(reason);
      throw new SMPError(reason);
    });
}

/**
 * Updates an existing organization.
 * @param {string} organizationID - ID of the organization to update.
 * @param {Object} input - Data to update for the organization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Organization>} - Updated organization.
 */
async function updateOrganization(organizationID, input, context) {
  console.log("okE",SMPEvents.Organization.Organization.updated)

  let transaction = await db.transaction();
  // Configuration for organization update via organizationCreation
  const organizationConf = {
    entityName: "organization",
    entityIDName: "organizationID",
    entityCommitCallBackFn: async (obj, opts) => {
      const [numberOfAffectedRows, updatedOrganizations] = await Organization.update(obj, { where: { organizationID: organizationID }, returning: true, ...opts });
      if (numberOfAffectedRows === 0) {
          context.logger.error(`Organization with ID ${organizationID} not found`); }
      return updatedOrganizations[0]; // Return updated object
    },    
    entityModel: Organization, 
    // Validation and transaction management
    entityTransactionCommitFn: async (tr) => {await tr.commit()}, // Commits the transaction
    entityTransactionRollbackFn: async (tr) => {await tr.rollback()}, // Rolls back the transaction in case of errors
    entityDefinedTransaction: transaction, // Rolls back the transaction in case of errors
  
    // Error handling
    erroCodeInvalidInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_47,
    errorCodeMissingInputs: ERRORS.ORGA_UI_VALIDATION_ERR_ORGANIZATION_C_48,
    errorCodeEntityCreationFailure: ERRORS.ORGA_SERVER_ERR_ORGANIZATION_C_49,

    eventKey: SMPEvents.Organization.Organization.updated,
    entityPublisherFn: async (ctxt, conf, msg) => await publishHelper(ctxt, conf, msg),
    auditLogFn: (_, appContext) => appContext?.logger?.info("TODO REPLACE WITH METRIC FUNCTION CALL : AuthenticationResolver.updateUser auditLogFn"), // Logs the update event for auditing
  }; 
  return await saveAndPublishEntity(organizationConf, input, context).then(
    (organization) => { 
      if(organization) return organization;
    }
  ).catch(
    async (reason) => { 
      context.logger.error(reason);
      throw new SMPError(reason);
    }
  ); 
}

/**
 * Deletes a organization by its ID.
 * @param {string} organizationID - ID of the organization to delete.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteOrganization(organizationID, context) {
  const organization = await Organization.findByPk(organizationID);
  if (!organization) {
    throw new Error("Organization not found");
  }
  await organization.destroy();
  await context.event.publish(SMPEvents.Organization.Organization.deleted, organizationID);
  return { success: true, message: "Organization deleted successfully" };
}

/**
 * Searches for organizations by their Slugs.
 * @param {Array<string>} slugs - List of slugs to search.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Array<Organization>>} - List of found organizations.
 */
async function findOrganizationsBySlugs(slugs, context) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new UserInputDataValidationError("Organization Slugs not provided or empty", "002");
  }

  const organizations = await Organization.findAll({
    where: { slug: slugs }
  });

  return attachMediaToOrganizations(organizations);
}

/**
 * Searches for a organization by its UniqRef.
 * @param {string} UniqRef - Unique Reference of the organization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Organization>} - Found organization.
 */
async function findOrganizationByUniqRef(UniqRef, context) {
  if (!UniqRef) {
    throw new UserInputDataValidationError("Organization UniqRef not provided", "002");
  }

  const organization = await Organization.findOne({
    where: { uniqRef }
  });

  if (!organization) {
    throw new UserInputDataValidationError(`Organization with UniqRef ${UniqRef} not found`, "001");
  }

  return attachMediaToOrganizations(organization);
}

/**
 * Searches for a organization by its Slug.
 * @param {string} Slug - Slug of the organization.
 * @param {Object} context - GraphQL request context.
 * @returns {Promise<Organization>} - Found organization.
 */
async function findOrganizationBySlug(Slug, context) {
  if (!Slug) {
    throw new UserInputDataValidationError("Organization Slug not provided", "002");
  }

  const organization = await Organization.findOne({
    where: { slug: Slug }
  });

  if (!organization) {
    throw new UserInputDataValidationError(`Organization with Slug ${Slug} not found`, "001");
  }

  return attachMediaToOrganizations(organization);
}

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver to get a list of organizations.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing pagination, sorting, and filters.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<Organization>>} - List of found organizations.
 */
async function organizationsResolver(parent, { pagination = {}, sort = {}, filter = [] }, context, infos) {
  const filters = Array.isArray(filter) ? filter : [];
  const organizations = await navigateEntityList(context, (options) => findOrganizations(options, context), filters, pagination, sort)
    .catch((error) => {
      throw new Error("Query::Error fetching organizations: " + error);
    });
  
  // Appliquer getOrganizationMediaURL à chaque organisation
  return organizations.map(org => getOrganizationMediaURL(org));
}

/**
 * Resolver to create a new organization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing input data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Organization>} - Created organization.
 */
async function createOrganizationResolver(parent, { input }, context, infos) {
  return createOrganization(input, context);
}

/**
 * Resolver to update a organization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the organization ID and update data.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Organization>} - Updated organization.
 */
async function updateOrganizationResolver(parent, { organizationID, input }, context, infos) {
  return updateOrganization(organizationID, input, context);
}

/**
 * Resolver to delete a organization.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the organization ID to delete.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Object>} - Confirmation of deletion.
 */
async function deleteOrganizationResolver(parent, { organizationID }, context, infos) {
  return deleteOrganization(organizationID, context);
}

/**
 * Resolver to get a organization by its ID.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the organization ID.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Organization>} - Found organization.
 */
async function organizationResolver(parent, { organizationID }, context, infos) {
  const organization = await navigateEntityList(context, (options) => findOrganizationByID(organizationID, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organization by ID: " + error);
    });
  
  return getOrganizationMediaURL(organization);
}

/**
 * Resolver to get organizations by their IDs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of IDs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<Organization>>} - List of found organizations.
 */
async function organizationsByIDsResolver(parent, { organizationIDs }, context, infos) {
  const organizations = await navigateEntityList(context, (options) => findOrganizationsByIDs(organizationIDs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizations by IDs: " + error);
    });
  
  return organizations.map(org => getOrganizationMediaURL(org));
}

/**
 * Resolver to get organizations by their slugs.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing a list of slugs.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Array<Organization>>} - List of found organizations.
 */
async function organizationsBySlugsResolver(_, { slugs }, context, info) {
  const organizations = await navigateEntityList(context, (options) => findOrganizationsBySlugs(slugs, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organizations by Slugs: " + error);
    });
  
  return organizations.map(org => getOrganizationMediaURL(org));
}

/**
 * Resolver to get a organization by its UniqRef.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the unique reference of the organization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Organization>} - Found organization.
 */
async function organizationByUniqRefResolver(_, { UniqRef }, context, infos) {
  const organization = await navigateEntityList(context, (options) => findOrganizationByUniqRef(UniqRef, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organization by UniqRef: " + error);
    });
  
  return getOrganizationMediaURL(organization);
}

/**
 * Resolver to get a organization by its slug.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments containing the slug of the organization.
 * @param {Object} context - GraphQL context.
 * @param {Object} infos - Additional information about the query.
 * @returns {Promise<Organization>} - Found organization.
 */
async function organizationBySlugResolver(_, { Slug }, context, info) {
  const organization = await navigateEntityList(context, (options) => findOrganizationBySlug(Slug, context), {}, {}, [])
    .catch((error) => {
      throw new Error("Query::Error fetching organization by Slug: " + error);
    });
  
  return getOrganizationMediaURL(organization);
}

// --- ADDITIONAL FUNCTIONS ---

/**
 * Builds a new organization object from the provided data.
 * @param {Object} organization - Organization data.
 * @returns {Object} - New organization object.
 */
function organizationCreationBuilder(_, organization ) {
  let newOrganization = {}

  if (organization.state) {
    newOrganization.state = organization.state
  }

  if (organization.authorID ) {
    newOrganization.authorID = organization.authorID;
  }
  if (organization.ownerID) {
    newOrganization.ownerID = organization.ownerID;
  }
  
  if (organization.orgRef) {
    newOrganization.orgRef = organization.orgRef;
  }
  
  if (organization.sectorID) {
    newOrganization.sectorID = organization.sectorID;
  }
  
  if (organization.legalName) {
    newOrganization.legalName = organization.legalName;
  }
  
  if (organization.brand) {
    newOrganization.brand = organization.brand;
  }

  if (organization.organizationID) {
    newOrganization.organizationID = organization.organizationID;
  }
  
  if (organization.sigle) {
    newOrganization.sigle = organization.sigle;
  }
  
  if (organization.smallLogo) {
    newOrganization.smallLogo = organization.smallLogo;
  }
  
  if (organization.bigLogo) {
    newOrganization.bigLogo = organization.bigLogo;
  }
  
  if (organization.banner) {
    newOrganization.banner = organization.banner;
  }
  
  if (organization.oSize) {
    newOrganization.oSize = organization.oSize;
  }
  
  if (organization.juridicForm) {
    newOrganization.juridicForm = organization.juridicForm;
  }
  
  if (organization.juridicCatLabel) {
    newOrganization.juridicCatLabel = organization.juridicCatLabel;
  }
  
  if (organization.juridicCatCode) {
    newOrganization.juridicCatCode = organization.juridicCatCode;
  }
  
  if (organization.currency) {
    newOrganization.currency = organization.currency;
  }
  
  if (organization.legalUniqIdentifier) {
    newOrganization.legalUniqIdentifier = organization.legalUniqIdentifier;
  }
  
  if (organization.vatNumber) {
    newOrganization.vatNumber = organization.vatNumber;
  }
  
  if (organization.communityVATNumber) {
    newOrganization.communityVATNumber = organization.communityVATNumber;
  }
  
  if (organization.capital) {
    newOrganization.capital = organization.capital;
  }
  
  if (organization.insuranceRef) {
    newOrganization.insuranceRef = organization.insuranceRef;
  }
  
  if (organization.insuranceName) {
    newOrganization.insuranceName = organization.insuranceName;
  }
  
  if (organization.activityStartedAt) {
    newOrganization.activityStartedAt = organization.activityStartedAt;
  }
  
  if (organization.activityEndedAt) {
    newOrganization.activityEndedAt = organization.activityEndedAt;
  }
  
  if (organization.description) {
    newOrganization.description = organization.description;
  }
  
  if (organization.summary) {
    newOrganization.summary = organization.summary;
  }
  
  if (organization.locationID) {
    newOrganization.locationID = organization.locationID;
  }
  
  if (organization.parentOrganizationID) {
    newOrganization.parentOrganizationID = organization.parentOrganizationID;
  }
  
  if (organization.advancedAttributes) {
    newOrganization.advancedAttributes = organization.advancedAttributes;
  }
  

  return newOrganization;
};

export {
// Export resolvers
// [QUERIES]
  organizationsResolver,
  organizationResolver,
  organizationsByIDsResolver,
  organizationsBySlugsResolver,
  organizationByUniqRefResolver,
  organizationBySlugResolver,
// [MUTATIONS]
  createOrganizationResolver,
  updateOrganizationResolver,
  deleteOrganizationResolver,
// Export utility functions
  getOrganizationMediaURL
};
