// src/models/Industry.js

function industryCreation (updatedIndustry = {}, industry) {
    let newIndustry = {}
  
    if (updatedIndustry.state) {
      newIndustry.state = industry.state
    }
  
    if (industry.slug) {
      if (!updatedIndustry.slug) {
        newIndustry.slug = industry.slug
      } else {
        newIndustry.slug = updatedIndustry.slug
      }
    }
  
    if (industry.authorID ) {
      newIndustry.authorID = industry.authorID;
    }
   
    if (industry.title) {
      newIndustry.title = industry.title;
    }
    
    if (industry.description) {
      newIndustry.description = industry.description;
    }
    
    if (industry.level) {
      newIndustry.level = industry.level;
    }
    
    if (industry.parentIndustryID) {
      newIndustry.parentIndustryID = industry.parentIndustryID;
    }
    
    
  
    return newIndustry;
  };
  
  
  const industryUpdate = industryCreation;
  export { industryCreation, industryUpdate };