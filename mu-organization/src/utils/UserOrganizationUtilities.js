// src/models/UserOrganization.js

function userOrganizationCreation(updatedUserOrganization = {}, userOrganization) {
  let newUserOrganization = {};

  if (updatedUserOrganization.state) {
    newUserOrganization.state = userOrganization.state;
  }

  if (userOrganization.slug) {
    if (!updatedUserOrganization.slug) {
      newUserOrganization.slug = userOrganization.slug;
    } else {
      newUserOrganization.slug = updatedUserOrganization.slug;
    }
  }

  if (userOrganization.legend) {
    newUserOrganization.legend = userOrganization.legend;
  }

  if (userOrganization.authorID) {
    newUserOrganization.authorID = userOrganization.authorID;
  }

  if (userOrganization.userID) {
    newUserOrganization.userID = userOrganization.userID;
  }

  if (userOrganization.roleID) {
    newUserOrganization.roleID = userOrganization.roleID;
  }

  if (userOrganization.organizationID) {
    newUserOrganization.organizationID = userOrganization.organizationID;
  }

  return newUserOrganization;
}

const userOrganizationUpdate = userOrganizationCreation;
  export { userOrganizationCreation, userOrganizationUpdate };