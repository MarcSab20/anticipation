// src/models/TagOrganization.js

function tagOrganizationCreation(updatedTagOrganization = {}, tagOrganization) {
    let newTagOrganization = {};
  
    if (updatedTagOrganization.state) {
      newTagOrganization.state = tagOrganization.state;
    }
  
    if (tagOrganization.slug) {
      if (!updatedTagOrganization.slug) {
        newTagOrganization.slug = tagOrganization.slug;
      } else {
        newTagOrganization.slug = updatedTagOrganization.slug;
      }
    }
  
    if (tagOrganization.organizationID) {
      newTagOrganization.organizationID = tagOrganization.organizationID;
    }
  
    if (tagOrganization.tagID) {
      newTagOrganization.tagID = tagOrganization.tagID;
    }
  
    return newTagOrganization;
  }
  
  const tagOrganizationUpdate = tagOrganizationCreation;
  export { tagOrganizationCreation, tagOrganizationUpdate };  