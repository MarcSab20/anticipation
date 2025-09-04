import {
    faqOrganizationsResolver,
    faqOrganizationResolver,
    faqOrganizationsByIDsResolver,
    faqOrganizationsBySlugsResolver,
    faqOrganizationByUniqRefResolver,
    faqOrganizationBySlugResolver,
    createFaqOrganizationResolver,
    updateFaqOrganizationResolver,
    deleteFaqOrganizationResolver,
} from './resolvers/FaqOrganizationResolver.js';

import { 
    organizationsResolver,
    organizationResolver,
    organizationsByIDsResolver,
    organizationsBySlugsResolver,
    organizationByUniqRefResolver,
    organizationBySlugResolver,
    createOrganizationResolver,
    updateOrganizationResolver,
    deleteOrganizationResolver
} from './resolvers/OrganizationResolver.js';

import {
    industrysResolver,
    industryResolver,
    industrysByIDsResolver,
    industrysBySlugsResolver,
    industryByUniqRefResolver,
    industryBySlugResolver,
    createIndustryResolver,
    updateIndustryResolver,
    deleteIndustryResolver
} from './resolvers/IndustryResolver.js';

import {
    organizationMediasResolver,
    organizationMediaResolver,
    organizationMediasByIDsResolver,
    organizationMediasBySlugsResolver,
    organizationMediaByUniqRefResolver,
    organizationMediaBySlugResolver,
    createOrganizationMediaResolver,
    updateOrganizationMediaResolver,
    deleteOrganizationMediaResolver
} from './resolvers/OrganizationMediaResolver.js';

import {
    tagOrganizationsResolver,
    tagOrganizationResolver,
    tagOrganizationsByIDsResolver,
    tagOrganizationsBySlugsResolver,
    tagOrganizationByUniqRefResolver,
    tagOrganizationBySlugResolver,
    createTagOrganizationResolver,
    updateTagOrganizationResolver,
    deleteTagOrganizationResolver
} from './resolvers/TagOrganizationResolver.js';

import {
    topicOrganizationsResolver,
    topicOrganizationResolver,
    topicOrganizationsByIDsResolver,
    topicOrganizationsBySlugsResolver,
    topicOrganizationByUniqRefResolver,
    topicOrganizationBySlugResolver,
    createTopicOrganizationResolver,
    updateTopicOrganizationResolver,
    deleteTopicOrganizationResolver
} from './resolvers/TopicOrganizationResolver.js';


import {
    userOrganizationsResolver,
    userOrganizationResolver,
    userOrganizationsByIDsResolver,
    userOrganizationsBySlugsResolver,
    userOrganizationByUniqRefResolver,
    userOrganizationByUniqRefsResolver,
    userOrganizationBySlugResolver,
    createUserOrganizationResolver,
    updateUserOrganizationResolver,
    deleteUserOrganizationResolver
} from './resolvers/UserOrganizationResolver.js';

import {
    inviteUserToOrganizationResolver,
    removeUserFromOrganizationResolver,
    updateUserRoleInOrganizationResolver,
    addUserToOrganizationResolver,
    listOrganizationMembersResolver,
    isUserInOrganizationResolver,    
    verifyInvitationTokenResolver,
    getUserOrganizationsResolver,
    removeInvitationResolver,

} from './resolvers/MemberOrganizationResolver.js';

import pkg from "lodash";
const { merge } = pkg;

import { default as ORGAContext } from "./resolvers/ORGAContextResolver.js";

const OrganizationResolvers = {
    Query: {
        organizations        : organizationsResolver,
        organization         : organizationResolver,
        organizationsByIDs   : organizationsByIDsResolver,
        organizationsBySlugs : organizationsBySlugsResolver,
        organizationByUniqRef: organizationByUniqRefResolver,
        organizationBySlug   : organizationBySlugResolver,
    },
    Mutation: {
        createOrganization: createOrganizationResolver,
        updateOrganization: updateOrganizationResolver,
        deleteOrganization: deleteOrganizationResolver,
    },
};

const OrganizationMediaResolvers = {
    Query: {
        organizationMedias        : organizationMediasResolver,
        organizationMedia         : organizationMediaResolver,
        organizationMediasByIDs   : organizationMediasByIDsResolver,
        organizationMediasBySlugs : organizationMediasBySlugsResolver,
        organizationMediaByUniqRef: organizationMediaByUniqRefResolver,
        organizationMediaBySlug   : organizationMediaBySlugResolver,
    },
    Mutation: {
        createOrganizationMedia: createOrganizationMediaResolver,
        updateOrganizationMedia: updateOrganizationMediaResolver,
        deleteOrganizationMedia: deleteOrganizationMediaResolver,
    },
};

const IndustryResolvers = {
    Query: {
        industrys        : industrysResolver,
        industry         : industryResolver,
        industrysByIDs   : industrysByIDsResolver,
        industrysBySlugs : industrysBySlugsResolver,
        industryByUniqRef: industryByUniqRefResolver,
        industryBySlug   : industryBySlugResolver,
    },
    Mutation: {
        createIndustry: createIndustryResolver,
        updateIndustry: updateIndustryResolver,
        deleteIndustry: deleteIndustryResolver,
    },
};

const TagOrganizationResolvers = {
    Query: {
        tagOrganizations        : tagOrganizationsResolver,
        tagOrganization         : tagOrganizationResolver,
        tagOrganizationsByIDs   : tagOrganizationsByIDsResolver,
        tagOrganizationsBySlugs : tagOrganizationsBySlugsResolver,
        tagOrganizationByUniqRef: tagOrganizationByUniqRefResolver,
        tagOrganizationBySlug   : tagOrganizationBySlugResolver,
    },
    Mutation: {
        createTagOrganization: createTagOrganizationResolver,
        updateTagOrganization: updateTagOrganizationResolver,
        deleteTagOrganization: deleteTagOrganizationResolver,
    },
};

const TopicOrganizationResolvers = {
    Query: {
        topicOrganizations        : topicOrganizationsResolver,
        topicOrganization         : topicOrganizationResolver,
        topicOrganizationsByIDs   : topicOrganizationsByIDsResolver,
        topicOrganizationsBySlugs : topicOrganizationsBySlugsResolver,
        topicOrganizationByUniqRef: topicOrganizationByUniqRefResolver,
        topicOrganizationBySlug   : topicOrganizationBySlugResolver,
    },
    Mutation: {
        createTopicOrganization: createTopicOrganizationResolver,
        updateTopicOrganization: updateTopicOrganizationResolver,
        deleteTopicOrganization: deleteTopicOrganizationResolver,
    },
};

const UserOrganizationResolvers = {
    Query: {
        userOrganizations        : userOrganizationsResolver,
        userOrganization         : userOrganizationResolver,
        userOrganizationsByIDs   : userOrganizationsByIDsResolver,
        userOrganizationBySlug   : userOrganizationBySlugResolver,
        userOrganizationsBySlugs : userOrganizationsBySlugsResolver,
        userOrganizationByUniqRef: userOrganizationByUniqRefResolver,
        userOrganizationByUniqRefs:userOrganizationByUniqRefsResolver,
    },
    Mutation: {
        createUserOrganization: createUserOrganizationResolver,
        updateUserOrganization: updateUserOrganizationResolver,
        deleteUserOrganization: deleteUserOrganizationResolver,
    },
};

const FaqOrganizationResolvers = {
    Query: {
        faqOrganizations        : faqOrganizationsResolver,
        faqOrganization         : faqOrganizationResolver,
        faqOrganizationsByIDs   : faqOrganizationsByIDsResolver,
        faqOrganizationsBySlugs : faqOrganizationsBySlugsResolver,
        faqOrganizationByUniqRef: faqOrganizationByUniqRefResolver,
        faqOrganizationBySlug   : faqOrganizationBySlugResolver,
    },
    Mutation: {
        createFaqOrganization: createFaqOrganizationResolver,
        updateFaqOrganization: updateFaqOrganizationResolver,
        deleteFaqOrganization: deleteFaqOrganizationResolver,
    },
};

const MemberOrganizationResolvers = {
  
    Query: {
        listOrganizationMembers     : listOrganizationMembersResolver,
        isUserInOrganization        : isUserInOrganizationResolver,
        getUserOrganizations        : getUserOrganizationsResolver

    },
      Mutation: {
        inviteUserToOrganization    : inviteUserToOrganizationResolver,
        removeUserFromOrganization  : removeUserFromOrganizationResolver,
        updateUserRoleInOrganization: updateUserRoleInOrganizationResolver,
        addUserToOrganization       : addUserToOrganizationResolver,
        verifyInvitationToken       : verifyInvitationTokenResolver,
        removeInvitation            : removeInvitationResolver,

    },
};


// Créer un tableau de tous les résolveurs
const resolversArray = [
    OrganizationResolvers,
    OrganizationMediaResolvers,
    IndustryResolvers,
    TagOrganizationResolvers,
    TopicOrganizationResolvers,
    UserOrganizationResolvers,
    FaqOrganizationResolvers,
    MemberOrganizationResolvers,
    ORGAContext,
  ];
  
  // Fusion des résolveurs en un seul objet
  const resolvers = resolversArray.reduce((acc, resolver) => {
    return merge(acc, resolver);
  }, {});
  
  export {
    IndustryResolvers,
    OrganizationResolvers,
    OrganizationMediaResolvers,
    TagOrganizationResolvers,
    TopicOrganizationResolvers,
    UserOrganizationResolvers,
    FaqOrganizationResolvers,
    MemberOrganizationResolvers,
    resolvers,
  }; // [ExportResolvers]