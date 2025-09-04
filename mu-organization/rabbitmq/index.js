import { SMPEvents } from 'smp-core-tools';
// import { handleUserCreatedForOrganization } from "./handleEvent/authentication/handleUserCreatedForOrganization.js";

/**
 * Configuration des consommateurs RabbitMQ pour le microservice Organization.
 * 
 * Chaque domaine (location, catalog, userSpace, accounting, reviewComment, authentication) 
 * définit un tableau "routingKeys" qui est constitué des wildcards de chaque entité 
 * (utilisation de la propriété "stars" pour écouter toutes les opérations) ou d'événements spécifiques.
 *
 * Exemple :
 * - SMPEvents.Organization.Organization.stars renvoie "rk.organization.organization.*"
 * - SMPEvents.Authentication.UserInvited.created renvoie "rk.authentication.userinvited.created"
 */
const muConsumers = {

  document: {
    routingKeys:[
      SMPEvents.Document.Media.created,
      SMPEvents.Document.Media.updated,
      SMPEvents.Document.Media.deleted
    ]
  },

  location: {
    routingKeys: [
      SMPEvents.Location.Place.stars, // Toutes les opérations pour Place
    ],
  },
  catalog: {
    routingKeys: [
      SMPEvents.Catalog.Criteria.stars,
      SMPEvents.Catalog.Service.stars,
      SMPEvents.Catalog.Topic.stars,
      SMPEvents.Catalog.Tag.stars,
    ],
  },
  userSpace: {
    routingKeys: [
      SMPEvents.UserSpace.Role.stars,
      SMPEvents.UserSpace.UserRole.created,
      SMPEvents.UserSpace.UserRole.deleted,
      SMPEvents.UserSpace.UserRole.updated,
      SMPEvents.UserSpace.Profile.stars,
      
    ],
  },
  accounting: {
    routingKeys: [
      SMPEvents.Accounting.Estimate.stars,
    ],
  },
  reviewComment: {
    routingKeys: [
      SMPEvents.ReviewComment.Comment.stars,
    ],
  },
  authentication: {
    routingKeys: [
      SMPEvents.Authentication.User.created,
      SMPEvents.Authentication.UserInvited.created
    ],
    // specialEvents: {
    //   [SMPEvents.Authentication.UserInvited.created]: [
    //     handleUserCreatedForOrganization
    //   ],
    // },
  },
};

export { muConsumers };
