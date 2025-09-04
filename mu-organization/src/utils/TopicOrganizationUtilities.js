// src/models/TopicOrganization.js

function topicOrganizationCreation(updatedTopicOrganization = {}, topicOrganization) {
  let newTopicOrganization = {};

  if (updatedTopicOrganization.state) {
    newTopicOrganization.state = topicOrganization.state;
  }

  if (topicOrganization.slug) {
    if (!updatedTopicOrganization.slug) {
      newTopicOrganization.slug = topicOrganization.slug;
    } else {
      newTopicOrganization.slug = updatedTopicOrganization.slug;
    }
  }

  if (topicOrganization.topicID) {
    newTopicOrganization.topicID = topicOrganization.topicID;
  }

  if (topicOrganization.organizationID) {
    newTopicOrganization.organizationID = topicOrganization.organizationID;
  }

  return newTopicOrganization;
}

const topicOrganizationUpdate = topicOrganizationCreation;
  export { topicOrganizationCreation, topicOrganizationUpdate };
