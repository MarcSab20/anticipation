// src/index.js

// Importez les modèles nécessaires
import {
  modelDocumentation,
  modelFaqOrganization,
  modelOrganizationMedia,
  modelOrganization,
  modelFaqAnswer,
  modelIndustry,
  modelTagOrganization,
  modelTopicOrganization,
  modelUserOrganization,
} from "smp-core-schema";
import { db } from "smp-core-tools";
import modelPlace from "../src/models/orgaPlace.js";
import modelTopic from "../src/models/orgaTopic.js";
import modelRole from "../src/models/orgaRole.js";
import modelTag from "../src/models/orgaTag.js";
import modelComment from "../src/models/orgaComment.js";
import modelCriteria from "../src/models/orgaCriteria.js";
import modelService from "../src/models/orgaService.js";
import modelDevis from "../src/models/orgaEstimate.js";
import modelUser from "../src/models/orgaUser.js";
import modelProfile from "../src/models/orgaProfile.js";
import modelMedia from "../src/models/orgaMedia.js";

// Initialisation des modèles
const Documentation = modelDocumentation(db);
const FaqAnswer = modelFaqAnswer(db);
const OrganizationMedia = modelOrganizationMedia(db);
const Organization = modelOrganization(db);
const FaqOrganization = modelOrganization(db);
const Industry = modelIndustry(db);
const TagOrganization = modelTagOrganization(db);
const TopicOrganization = modelTopicOrganization(db);
const UserOrganization = modelUserOrganization(db);

// Modèles orgaDB
const Place = modelPlace(db);
const Topic = modelTopic(db);
const Role = modelRole(db);
const Tag = modelTag(db);
const Comment = modelComment(db);
const Criteria = modelCriteria(db);
const Service = modelService(db);
const Devis = modelDevis(db);
const User = modelUser(db);
const Profile = modelProfile(db);
const Media = modelMedia(db);

// Définir les associations entre les modèles
UserOrganization.belongsTo(User, { foreignKey: 'userID', as: 'user' });
UserOrganization.belongsTo(Organization, { foreignKey: 'organizationID', as: 'organization' });
UserOrganization.belongsTo(Role, { foreignKey: 'roleID', as: 'role' });

User.hasMany(UserOrganization, { foreignKey: 'userID', as: 'organizations' });

Organization.hasMany(UserOrganization, { foreignKey: 'organizationID', as: 'members' });
Role.hasMany(UserOrganization, { foreignKey: 'roleID', as: 'assignments' });

// Associations pour OrganizationMedia (table de jointure)
Organization.hasMany(OrganizationMedia, { foreignKey: 'organizationID', as: 'organizationMedia' });
OrganizationMedia.belongsTo(Organization, { foreignKey: 'organizationID', as: 'organization' });
OrganizationMedia.belongsTo(Media, { foreignKey: 'mediaID', as: 'media' });
Media.hasMany(OrganizationMedia, { foreignKey: 'mediaID', as: 'organizationMedia' });

// Association many-to-many via OrganizationMedia
Organization.belongsToMany(Media, { 
  through: OrganizationMedia,
  foreignKey: 'organizationID',
  otherKey: 'mediaID',
  as: 'medias'
});

Media.belongsToMany(Organization, { 
  through: OrganizationMedia,
  foreignKey: 'mediaID',
  otherKey: 'organizationID',
  as: 'organizations'
});

// Associations pour User et Profile
User.hasOne(Profile, { foreignKey: 'userID', as: 'profile' });
Profile.belongsTo(User, { foreignKey: 'userID', as: 'user' });

// Association pour la photo de profil
Profile.belongsTo(Media, { foreignKey: 'profilePictureID', as: 'profilePicture' });
Media.hasMany(Profile, { foreignKey: 'profilePictureID', as: 'profiles' });

// Exporter les modèles et les associations
const models = {
  Place,
  Service,
  Topic,
  Tag,
  Comment,
  Criteria,
  Role,
  Devis,
  User,
  Profile,
  UserOrganization,
  Organization,
  Media
};

export {
  db,
  Documentation,
  FaqAnswer,
  OrganizationMedia,
  Organization,
  FaqOrganization,
  Industry,
  TagOrganization,
  TopicOrganization,
  UserOrganization,
  // Modèles orgaDB
  Place,
  Service,
  Topic,
  Tag,
  Comment,
  Criteria,
  Role,
  Devis,
  User,
  Profile,
  Media,
  models,
};