// src/models/FaqOrganization.js

function faqOrganizationCreation(updatedFaqOrganization = {}, faqOrganization) {
    let newFaqOrganization = {};
  
    if (updatedFaqOrganization.state) {
      newFaqOrganization.state = faqOrganization.state;
    }
  
    if (faqOrganization.slug) {
      if (!updatedFaqOrganization.slug) {
        newFaqOrganization.slug = faqOrganization.slug;
      } else {
        newFaqOrganization.slug = updatedFaqOrganization.slug;
      }
    }

    if (faqOrganization.authorID) {
      newFaqOrganization.authorID = faqOrganization.authorID;
    }

    if (faqOrganization.organizationID) {
      newFaqOrganization.organizationID = faqOrganization.organizationID;
    }

    if (faqOrganization.faqQuestionID) {
      newFaqOrganization.faqQuestionID = faqOrganization.faqQuestionID;
    }

    if (faqOrganization.faqAnswerID) {
      newFaqOrganization.faqAnswerID = faqOrganization.faqAnswerID;
    }
    if (faqOrganization.order) {
      newFaqOrganization.order = faqOrganization.order;
    }
   
  
    return newFaqOrganization;
  }
  
  const faqOrganizationUpdate = faqOrganizationCreation;
  export { faqOrganizationCreation, faqOrganizationUpdate };
  