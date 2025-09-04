
CREATE TYPE "UserType" AS ENUM (
  'robot',
  'client',
  'developer',
  'analyzer',
  'moderator',
  'administrator'
);
CREATE TYPE "EstimateStage" AS ENUM (
  'submit',
  'processing',
  'negociating',
  'validating',
  'concluded',
  'canceled',
  'saved'
);


CREATE TYPE "PlaceKind" AS ENUM (
  'unknown',
  'house',
  'alley',
  'villa',
  'domaine',
  'place',
  'street',
  'avenue',
  'boulevard',
  'road',
  'monument',
  'forest',
  'nbhood',
  'town',
  'city',
  'country',
  'state',
  'continent',
  'ocean'
);

CREATE TYPE "ObjectStatus" AS ENUM (
  'offline',
  'staging',
  'awaiting',
  'reviewed',
  'rejected',
  'signaled',
  'online',
  'archived'
);

CREATE TYPE "MediaType" AS ENUM (
  'unknown',
  'text',
  'image',
  'audio',
  'video',
  'archive',
  'binary',
  'document'
);



CREATE TYPE "ProfileGender" AS ENUM (
  'male',
  'female',
  'other',
  'neither'
);




CREATE TYPE "OrganizationEconomicSizeKind" AS ENUM (
  'division'
  'freelancer'
  'sb'
  'gb'
  'inc'
  'holding'
);

CREATE TYPE "ServicesAcceptedDevice" AS ENUM (
  'unknw',
  'eur',
  'usd',
  'gbp',
  'xaf',
  'xof'
);



/*TABLE DU MICRO SERVICES ORGANIZATION*/
CREATE TABLE "Organization" (
  "organizationID" SERIAL PRIMARY KEY,
  "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "authorID" INTEGER NOT NULL,
  "ownerID" INTEGER,
  "orgRef" VARCHAR(32),
  "sectorID" INTEGER,
  "legalName" VARCHAR(64),
  "brand" VARCHAR(32),
  "sigle" VARCHAR(8),
  "smallLogo" INTEGER,
  "bigLogo" INTEGER,
  "banner" INTEGER,
  "oSize" "OrganizationEconomicSizeKind" ,
  "juridicForm" VARCHAR(8),
  "juridicCatLabel" VARCHAR(64),
  "juridicCatCode" VARCHAR(8),
  "currency" "ServicesAcceptedDevice" DEFAULT 'eur',
  "legalUniqIdentifier" VARCHAR(64),
  "vatNumber" VARCHAR(32),
  "communityVATNumber" VARCHAR(32),
  "capital" INTEGER,
  "insuranceRef" VARCHAR(64),
  "insuranceName" VARCHAR(64),
  "activityStartedAt" TIMESTAMP,
  "activityEndedAt" TIMESTAMP,
  "description" TEXT,
  "summary" TEXT,
  "locationID" INTEGER,
  "parentOrganizationID" INTEGER,
  "advancedAttributes" JSON,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "OrganizationMedia" (
  "organizationMediaID" SERIAL PRIMARY KEY,
  "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "authorID" INTEGER NOT NULL,
  "mediaID" INTEGER NOT NULL,
  "organizationID" INTEGER NOT NULL,
  "legend" VARCHAR(255),
  "listingPosition" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "TagOrganization" (
  "tagOrganizationID" SERIAL PRIMARY KEY,
  "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "tagID" INTEGER NOT NULL,
  "organizationID" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "TopicOrganization" (
  "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "topicOrganizationID" SERIAL PRIMARY KEY,
  "topicID" INTEGER NOT NULL,
  "organizationID" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "UserOrganization" (
  "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "userOrganizationID" SERIAL PRIMARY KEY,
  "legend" VARCHAR(64),
  "authorID" INTEGER,
  "userID" INTEGER NOT NULL,
  "roleID" INTEGER NOT NULL,
  "organizationID" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "Media" (
  "mediaID" SERIAL PRIMARY KEY,
  "authorID" INTEGER NOT NULL,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "mediaType" "MediaType" NOT NULL,
  "url" VARCHAR(255),
  "legend" VARCHAR(64),
  "state" "ObjectStatus",
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP
);
/*TABLES ORGADB*/

CREATE TABLE "Comment" (
    "commentID" INTEGER PRIMARY KEY,
    "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
    "slug" VARCHAR(255) NOT NULL UNIQUE,
    "commentContent" TEXT,
    "authorID" INTEGER NOT NULL,
    "serviceID" INTEGER,
    "organizationID" INTEGER,
    "feedback" INTEGER,
    "state" "ObjectStatus" NOT NULL,
    "createdAt" TIMESTAMP,
    "updatedAt" TIMESTAMP
);

CREATE TABLE "Criteria" (
  "criteriaID" INTEGER,
  "uniqRef" VARCHAR(36) NOT NULL UNIQUE,
  "slug" VARCHAR(255) NOT NULL UNIQUE,
  "authorID" INTEGER NOT NULL,
  "title" VARCHAR(255),
  "criteriaDescription" TEXT,
  "targetedEntityCriteria" TEXT NOT NULL,
  "state" "ObjectStatus" NOT NULL,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);

CREATE TABLE "Estimate" (
  "estimateID" INTEGER PRIMARY KEY,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "operatorUserID" INTEGER,
  "authorID" INTEGER NOT NULL,
  "buyerOrganizationID" INTEGER,
  "sellerOrganizationID" INTEGER,
  "serviceID" INTEGER,
  "referencePrice" INTEGER,
  "previewPrice" INTEGER,
  "commentaire" TEXT,
  "negociatedPrice" INTEGER,
  "stage" "EstimateStage",
  "state" "ObjectStatus" NOT NULL,
  "updatedAt" TIMESTAMP
);

CREATE TABLE "Place" (
  "placeID" INTEGER PRIMARY KEY,
  "uniqRef" VARCHAR(36) UNIQUE,
  "slug" VARCHAR(255) UNIQUE,
  "country" VARCHAR(32),
  "region" VARCHAR(64),
  "pstate" VARCHAR(64),
  "city" VARCHAR(32),
  "postalCode" VARCHAR(16),
  "placeKind" "PlaceKind" DEFAULT 'unknown',
  "addressLine1" VARCHAR(255),
  "coordinates" GEOMETRY(POINT),
  "state" "ObjectStatus",
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "Profile" (
  "profileID" INTEGER PRIMARY KEY ,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "firstName" VARCHAR(64),
  "lastName" VARCHAR(64),
  "dateOfBirth" TIMESTAMP,
  "gender" "ProfileGender",
  "nationality" VARCHAR(32),
  "phoneNumber" VARCHAR(32),
  "locationID" INTEGER,
  "idCardNumber" VARCHAR(32),
  "passportNumber" VARCHAR(32),
  "socialSecurityNumber" VARCHAR(16),
  "createdAt" TIMESTAMP ,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "Role" (
  "roleID" INTEGER PRIMARY KEY ,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "authorID" INTEGER NOT NULL,
  "roleName" VARCHAR(32),
  "description" TEXT,
  "permissions" JSON,
  "state" "ObjectStatus" NOT NULL,
  "updatedAt" TIMESTAMP
);

CREATE TABLE "Service" (
  "serviceID" INTEGER PRIMARY KEY ,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "authorID" INTEGER NOT NULL,
  "title" VARCHAR(128),
  "description" TEXT,
  "mediaBannerID" INTEGER,
  "termsAndConditionsID" INTEGER,
  "categoryID" INTEGER,
  "organizationID" INTEGER,
  "locationID" INTEGER,
  "negotiable" BOOLEAN,
  "state" "ObjectStatus" NOT NULL,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE TABLE "Tag" (
  "tagID" SERIAL PRIMARY KEY,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "authorID" INTEGER NOT NULL,
  "value" VARCHAR(32),
  "topicID" INTEGER,
  "state" "ObjectStatus" NOT NULL,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP 
);

CREATE TABLE "Topic" (
  "topicID" INTEGER PRIMARY KEY,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "authorID" INTEGER NOT NULL,
  "title" VARCHAR(255),
  "description" TEXT,
  "level" INTEGER,
  "parentTopicID" INTEGER ,
  "state" "ObjectStatus" NOT NULL,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);

CREATE TABLE "User" (
  "userID" INTEGER PRIMARY KEY,
  "uniqRef" VARCHAR(36) UNIQUE NOT NULL,
  "slug" VARCHAR(255) UNIQUE NOT NULL,
  "username" VARCHAR(16) UNIQUE NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "profileID" INTEGER UNIQUE NOT NULL,
  "userKind" "UserType" NOT NULL,
  "lastLogin" TIMESTAMP,
  "state" "ObjectStatus" NOT NULL,
  "createdAt" TIMESTAMP ,
  "updatedAt" TIMESTAMP,
  "deletedAt" TIMESTAMP
);
-- Insertion de seeds pour la table Organization
INSERT INTO "Organization" (
  "uniqRef", "slug", "authorID", "ownerID", "orgRef", "sectorID", "legalName", "brand", "sigle", "smallLogo", "bigLogo", "banner", "oSize", "juridicForm", "juridicCatLabel", "juridicCatCode", "currency", "legalUniqIdentifier", "vatNumber", "communityVATNumber", "capital", "insuranceRef", "insuranceName", "activityStartedAt", "activityEndedAt", "description", "summary", "locationID", "parentOrganizationID", "advancedAttributes", "createdAt", "updatedAt"
) VALUES 
  ('123e4567-e89b-12d3-a456-426614174000', 'org-1', 1, 1, 'ORG001', 1, 'Legal Name 1', 'Brand 1', 'SIG1', 1, 2, 3, 'ge', 'SARL', 'Category 1', 'CAT1', 'eur', 'LUI001', 'VAT001', 'CVAT001', 100000, 'INS001', 'Insurance 1', '2020-01-01', NULL, 'Description 1', 'Summary 1', 1, NULL, 'Attributes 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('123e4567-e89b-12d3-a456-426614174001', 'org-2', 2, 2, 'ORG002', 2, 'Legal Name 2', 'Brand 2', 'SIG2', 2, 3, 4, 'eti', 'SA', 'Category 2', 'CAT2', 'usd', 'LUI002', 'VAT002', 'CVAT002', 200000, 'INS002', 'Insurance 2', '2021-02-01', NULL, 'Description 2', 'Summary 2', 2, NULL, 'Attributes 2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('123e4567-e89b-12d3-a456-426614174002', 'org-3', 3, 3, 'ORG003', 3, 'Legal Name 3', 'Brand 3', 'SIG3', 3, 4, 5, 'pe', 'EURL', 'Category 3', 'CAT3', 'gbp', 'LUI003', 'VAT003', 'CVAT003', 300000, 'INS003', 'Insurance 3', '2022-03-01', NULL, 'Description 3', 'Summary 3', 3, NULL, 'Attributes 3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('123e4567-e89b-12d3-a456-426614174003', 'org-4', 4, 4, 'ORG004', 4, 'Legal Name 4', 'Brand 4', 'SIG4', 4, 5, 6, 'me', 'SAS', 'Category 4', 'CAT4', 'xaf', 'LUI004', 'VAT004', 'CVAT004', 400000, 'INS004', 'Insurance 4', '2023-04-01', NULL, 'Description 4', 'Summary 4', 4, NULL, 'Attributes 4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('123e4567-e89b-12d3-a456-426614174004', 'org-5', 5, 5, 'ORG005', 5, 'Legal Name 5', 'Brand 5', 'SIG5', 5, 6, 7, 'ge', 'SARL', 'Category 5', 'CAT5', 'eur', 'LUI005', 'VAT005', 'CVAT005', 500000, 'INS005', 'Insurance 5', '2024-05-01', NULL, 'Description 5', 'Summary 5', 5, NULL, 'Attributes 5', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table OrganizationMedia
INSERT INTO "OrganizationMedia" (
  "uniqRef", "slug", "authorID", "mediaID", "organizationID", "legend", "listingPosition", "createdAt", "updatedAt"
) VALUES 
  ('223e4567-e89b-12d3-a456-426614174001', 'org-media-1', 1, 1, 1, 'Legend 1', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('223e4567-e89b-12d3-a456-426614174002', 'org-media-2', 2, 2, 2, 'Legend 2', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('223e4567-e89b-12d3-a456-426614174003', 'org-media-3', 3, 3, 3, 'Legend 3', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('223e4567-e89b-12d3-a456-426614174004', 'org-media-4', 4, 4, 4, 'Legend 4', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('223e4567-e89b-12d3-a456-426614174005', 'org-media-5', 5, 5, 5, 'Legend 5', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table TagOrganization
INSERT INTO "TagOrganization" (
  "uniqRef", "slug", "tagID", "organizationID", "createdAt", "updatedAt"
) VALUES 
  ('323e4567-e89b-12d3-a456-426614174002', 'tag-org-1', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('323e4567-e89b-12d3-a456-426614174003', 'tag-org-2', 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('323e4567-e89b-12d3-a456-426614174004', 'tag-org-3', 3, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('323e4567-e89b-12d3-a456-426614174005', 'tag-org-4', 4, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('323e4567-e89b-12d3-a456-426614174006', 'tag-org-5', 5, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table TopicOrganization
INSERT INTO "TopicOrganization" (
  "uniqRef", "slug", "topicID", "organizationID", "createdAt", "updatedAt"
) VALUES 
  ('423e4567-e89b-12d3-a456-426614174003', 'topic-org-1', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('423e4567-e89b-12d3-a456-426614174004', 'topic-org-2', 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('423e4567-e89b-12d3-a456-426614174005', 'topic-org-3', 3, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('423e4567-e89b-12d3-a456-426614174006', 'topic-org-4', 4, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('423e4567-e89b-12d3-a456-426614174007', 'topic-org-5', 5, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table UserOrganization
INSERT INTO "UserOrganization" (
  "uniqRef", "slug", "legend", "authorID", "userID", "roleID", "organizationID", "createdAt", "updatedAt"
) VALUES 
  ('523e4567-e89b-12d3-a456-426614174004', 'user-org-1', 'Legend 1', 1, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('523e4567-e89b-12d3-a456-426614174005', 'user-org-2', 'Legend 2', 2, 2, 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('523e4567-e89b-12d3-a456-426614174006', 'user-org-3', 'Legend 3', 3, 3, 3, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('523e4567-e89b-12d3-a456-426614174007', 'user-org-4', 'Legend 4', 4, 4, 4, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('523e4567-e89b-12d3-a456-426614174008', 'user-org-5', 'Legend 5', 5, 5, 5, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Media
INSERT INTO "Media" (
  "slug", "authorID", "mediaType", "url", "legend", "state", "createdAt", "updatedAt"
) VALUES 
  ( 'media-1', 1, 'image', 'https://example.com/image1.jpg', 'Legend 1', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ( 'media-2', 2, 'video', 'https://example.com/video1.mp4', 'Legend 2', 'staging', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ( 'media-3', 3, 'audio', 'https://example.com/audio1.mp3', 'Legend 3', 'offline', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ( 'media-4', 4, 'document', 'https://example.com/document1.pdf', 'Legend 4', 'awaiting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ( 'media-5', 5, 'image', 'https://example.com/image2.jpg', 'Legend 5', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Comment
INSERT INTO "Comment" (
  "commentID", "uniqRef", "slug", "commentContent", "authorID", "serviceID", "organizationID", "feedback", "state", "createdAt", "updatedAt"
) VALUES 
  (1, '623e4567-e89b-12d3-a456-426614174005', 'comment-1', 'Comment Content 1', 1, 1, 1, 5, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, '623e4567-e89b-12d3-a456-426614174006', 'comment-2', 'Comment Content 2', 2, 2, 2, 4, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, '623e4567-e89b-12d3-a456-426614174007', 'comment-3', 'Comment Content 3', 3, 3, 3, 3, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, '623e4567-e89b-12d3-a456-426614174008', 'comment-4', 'Comment Content 4', 4, 4, 4, 2, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, '623e4567-e89b-12d3-a456-426614174009', 'comment-5', 'Comment Content 5', 5, 5, 5, 1, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Criteria
INSERT INTO "Criteria" (
  "criteriaID", "uniqRef", "slug", "authorID", "title", "criteriaDescription", "targetedEntityCriteria", "state", "createdAt", "updatedAt"
) VALUES 
  (1, '723e4567-e89b-12d3-a456-426614174006', 'criteria-1', 1, 'Title 1', 'Description 1', 'Entity 1', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, '723e4567-e89b-12d3-a456-426614174007', 'criteria-2', 2, 'Title 2', 'Description 2', 'Entity 2', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, '723e4567-e89b-12d3-a456-426614174008', 'criteria-3', 3, 'Title 3', 'Description 3', 'Entity 3', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, '723e4567-e89b-12d3-a456-426614174009', 'criteria-4', 4, 'Title 4', 'Description 4', 'Entity 4', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, '723e4567-e89b-12d3-a456-426614174010', 'criteria-5', 5, 'Title 5', 'Description 5', 'Entity 5', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Estimate
INSERT INTO "Estimate" (
  "estimateID", "uniqRef", "slug", "operatorUserID", "authorID", "buyerOrganizationID", "sellerOrganizationID", "serviceID", "referencePrice", "previewPrice", "commentaire", "negociatedPrice", "stage", "state", "updatedAt"
) VALUES 
  (1, '823e4567-e89b-12d3-a456-426614174007', 'estimate-1', 1, 1, 1, 1, 1, 1000, 900, 'Commentaire 1', 850, 'processing', 'awaiting', CURRENT_TIMESTAMP),
  (2, '823e4567-e89b-12d3-a456-426614174008', 'estimate-2', 2, 2, 2, 2, 2, 2000, 1800, 'Commentaire 2', 1700, 'negociating', 'staging', CURRENT_TIMESTAMP),
  (3, '823e4567-e89b-12d3-a456-426614174009', 'estimate-3', 3, 3, 3, 3, 3, 3000, 2700, 'Commentaire 3', 2500, 'validating', 'reviewed', CURRENT_TIMESTAMP),
  (4, '823e4567-e89b-12d3-a456-426614174010', 'estimate-4', 4, 4, 4, 4, 4, 4000, 3600, 'Commentaire 4', 3400, 'concluded', 'online', CURRENT_TIMESTAMP),
  (5, '823e4567-e89b-12d3-a456-426614174011', 'estimate-5', 5, 5, 5, 5, 5, 5000, 4500, 'Commentaire 5', 4200, 'canceled', 'offline', CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Place
INSERT INTO "Place" (
  "placeID", "uniqRef", "slug", "country", "region", "pstate", "city", "postalCode", "placeKind", "addressLine1", "coordinates", "state", "createdAt", "updatedAt", "deletedAt"
) VALUES 
  (1, '923e4567-e89b-12d3-a456-426614174008', 'place-1', 'USA', 'California', 'CA', 'San Francisco', '94103', 'house', '123 Main St', NULL, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (2, '923e4567-e89b-12d3-a456-426614174009', 'place-2', 'UK', 'England', 'ENG', 'London', 'E1 6AN', 'villa', '456 High St', NULL, 'offline', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (3, '923e4567-e89b-12d3-a456-426614174010', 'place-3', 'Canada', 'Ontario', 'ON', 'Toronto', 'M5V 2T6', 'town', '789 King St', NULL, 'staging', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (4, '923e4567-e89b-12d3-a456-426614174011', 'place-4', 'Australia', 'New South Wales', 'NSW', 'Sydney', '2000', 'city', '101 George St', NULL, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (5, '923e4567-e89b-12d3-a456-426614174012', 'place-5', 'France', 'Île-de-France', 'IDF', 'Paris', '75001', 'monument', '102 Champs-Élysées', NULL, 'awaiting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Insertion de seeds pour la table Profile
INSERT INTO "Profile" (
  "profileID", "uniqRef", "slug", "firstName", "lastName", "dateOfBirth", "gender", "nationality", "phoneNumber", "locationID", "idCardNumber", "passportNumber", "socialSecurityNumber", "createdAt", "updatedAt"
) VALUES 
  (1, 'a23e4567-e89b-12d3-a456-426614174009', 'john-doe', 'John', 'Doe', '1980-01-01', 'male', 'USA', '1234567890', 1, 'ID123456', 'P123456', 'SSN123456', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 'a23e4567-e89b-12d3-a456-426614174010', 'jane-smith', 'Jane', 'Smith', '1990-02-02', 'female', 'UK', '2345678901', 2, 'ID654321', 'P654321', 'SSN654321', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 'a23e4567-e89b-12d3-a456-426614174011', 'alex-jones', 'Alex', 'Jones', '1975-03-03', 'other', 'Canada', '3456789012', 3, 'ID789123', 'P789123', 'SSN789123', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 'a23e4567-e89b-12d3-a456-426614174012', 'sam-taylor', 'Sam', 'Taylor', '2000-04-04', 'neither', 'Australia', '4567890123', 4, 'ID456789', 'P456789', 'SSN456789', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, 'a23e4567-e89b-12d3-a456-426614174013', 'chris-lee', 'Chris', 'Lee', '1985-05-05', 'male', 'France', '5678901234', 5, 'ID123789', 'P123789', 'SSN123789', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Role
INSERT INTO "Role" (
  "roleID", "uniqRef", "slug", "authorID", "roleName", "description", "permissions", "state", "updatedAt"
) VALUES 
  (1, 'b23e4567-e89b-12d3-a456-426614174010', 'role-1', 1, 'Admin', 'Admin role', '{}', 'online', CURRENT_TIMESTAMP),
  (2, 'b23e4567-e89b-12d3-a456-426614174011', 'role-2', 2, 'Moderator', 'Moderator role', '{}', 'online', CURRENT_TIMESTAMP),
  (3, 'b23e4567-e89b-12d3-a456-426614174012', 'role-3', 3, 'User', 'User role', '{}', 'online', CURRENT_TIMESTAMP),
  (4, 'b23e4567-e89b-12d3-a456-426614174013', 'role-4', 4, 'Guest', 'Guest role', '{}', 'online', CURRENT_TIMESTAMP),
  (5, 'b23e4567-e89b-12d3-a456-426614174014', 'role-5', 5, 'Developer', 'Developer role', '{}', 'online', CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Service
INSERT INTO "Service" (
  "serviceID", "uniqRef", "slug", "authorID", "title", "description", "mediaBannerID", "termsAndConditionsID", "categoryID", "organizationID", "locationID", "negotiable", "state", "createdAt", "updatedAt", "deletedAt"
) VALUES 
  (1, 'c23e4567-e89b-12d3-a456-426614174011', 'service-1', 1, 'Service Title 1', 'Service Description 1', 1, 1, 1, 1, 1, TRUE, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (2, 'c23e4567-e89b-12d3-a456-426614174012', 'service-2', 2, 'Service Title 2', 'Service Description 2', 2, 2, 2, 2, 2, FALSE, 'offline', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (3, 'c23e4567-e89b-12d3-a456-426614174013', 'service-3', 3, 'Service Title 3', 'Service Description 3', 3, 3, 3, 3, 3, TRUE, 'staging', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (4, 'c23e4567-e89b-12d3-a456-426614174014', 'service-4', 4, 'Service Title 4', 'Service Description 4', 4, 4, 4, 4, 4, FALSE, 'awaiting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  (5, 'c23e4567-e89b-12d3-a456-426614174015', 'service-5', 5, 'Service Title 5', 'Service Description 5', 5, 5, 5, 5, 5, TRUE, 'reviewed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Insertion de seeds pour la table Tag
INSERT INTO "Tag" (
  "uniqRef", "slug", "authorID", "value", "topicID", "state", "createdAt", "updatedAt"
) VALUES 
  ('d23e4567-e89b-12d3-a456-426614174012', 'tag-1', 1, 'Tag Value 1', 1, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d23e4567-e89b-12d3-a456-426614174013', 'tag-2', 2, 'Tag Value 2', 2, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d23e4567-e89b-12d3-a456-426614174014', 'tag-3', 3, 'Tag Value 3', 3, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d23e4567-e89b-12d3-a456-426614174015', 'tag-4', 4, 'Tag Value 4', 4, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d23e4567-e89b-12d3-a456-426614174016', 'tag-5', 5, 'Tag Value 5', 5, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table Topic
INSERT INTO "Topic" (
  "topicID", "uniqRef", "slug", "authorID", "title", "description", "level", "parentTopicID", "state", "createdAt", "updatedAt"
) VALUES 
  (1, 'e23e4567-e89b-12d3-a456-426614174013', 'topic-1', 1, 'Topic Title 1', 'Topic Description 1', 1, NULL, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 'e23e4567-e89b-12d3-a456-426614174014', 'topic-2', 2, 'Topic Title 2', 'Topic Description 2', 2, 1, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 'e23e4567-e89b-12d3-a456-426614174015', 'topic-3', 3, 'Topic Title 3', 'Topic Description 3', 3, 2, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 'e23e4567-e89b-12d3-a456-426614174016', 'topic-4', 4, 'Topic Title 4', 'Topic Description 4', 4, 3, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, 'e23e4567-e89b-12d3-a456-426614174017', 'topic-5', 5, 'Topic Title 5', 'Topic Description 5', 5, 4, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insertion de seeds pour la table User
INSERT INTO "User" (
  "userID", "uniqRef", "slug", "username", "email", "profileID", "userKind", "lastLogin", "state", "createdAt", "updatedAt"
) VALUES 
  (1, 'f23e4567-e89b-12d3-a456-426614174014', 'user-1', 'johndoe', 'john.doe@example.com', 1, 'client', CURRENT_TIMESTAMP, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 'f23e4567-e89b-12d3-a456-426614174015', 'user-2', 'janesmith', 'jane.smith@example.com', 2, 'administrator', CURRENT_TIMESTAMP, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 'f23e4567-e89b-12d3-a456-426614174016', 'user-3', 'alexjones', 'alex.jones@example.com', 3, 'moderator', CURRENT_TIMESTAMP, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 'f23e4567-e89b-12d3-a456-426614174017', 'user-4', 'samtaylor', 'sam.taylor@example.com', 4, 'developer', CURRENT_TIMESTAMP, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, 'f23e4567-e89b-12d3-a456-426614174018', 'user-5', 'chrislee', 'chris.lee@example.com', 5, 'client', CURRENT_TIMESTAMP, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);



