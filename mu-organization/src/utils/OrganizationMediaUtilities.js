// src/models/OrganizationMedia.js

function organizationMediaCreation(updatedOrganizationMedia = {}, organizationMedia) {
  let newOrganizationMedia = {};

  if (updatedOrganizationMedia.state) {
    newOrganizationMedia.state = organizationMedia.state;
  }

  if (organizationMedia.slug) {
    if (!updatedOrganizationMedia.slug) {
      newOrganizationMedia.slug = organizationMedia.slug;
    } else {
      newOrganizationMedia.slug = updatedOrganizationMedia.slug;
    }
  }

  if (organizationMedia.authorID) {
    newOrganizationMedia.authorID = organizationMedia.authorID;
  }
  if (organizationMedia.organizationID) {
    newOrganizationMedia.organizationID = organizationMedia.organizationID;
  }

  if (organizationMedia.authorID) {
    newOrganizationMedia.authorID = organizationMedia.authorID;
  }


  if (organizationMedia.legend) {
    newOrganizationMedia.legend = organizationMedia.legend;
  }

  if (organizationMedia.mediaID) {
    newOrganizationMedia.mediaID = organizationMedia.mediaID;
  }

  if (organizationMedia.listingPosition) {
    newOrganizationMedia.listingPosition = organizationMedia.listingPosition;
  }

  return newOrganizationMedia;
}

const organizationMediaUpdate = organizationMediaCreation;
  export { organizationMediaCreation, organizationMediaUpdate };
