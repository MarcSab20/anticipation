// src/models/Organization.js

function organizationCreation (updatedOrganization = {}, organization) {
  let newOrganization = {}

  if (updatedOrganization.state) {
    newOrganization.state = organization.state
  }

  if (organization.slug) {
    if (!updatedOrganization.slug) {
      newOrganization.slug = organization.slug
    } else {
      newOrganization.slug = updatedOrganization.slug
    }
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


const organizationUpdate = organizationCreation;
  export { organizationCreation, organizationUpdate };