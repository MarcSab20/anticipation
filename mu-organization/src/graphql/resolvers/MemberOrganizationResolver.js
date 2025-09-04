import jwt from "jsonwebtoken";
import { Organization, User, UserOrganization, Role, Profile, Media, OrganizationMedia } from "./../../index.js"; 
import { 
    SMPEvents,
    appConfig, SMPError, cacheKey, verifyHashTokenWithBCrypt
} from "smp-core-tools";
import {UserOrganizationResolvers} from "./../Resolvers.js";

const JWT_SECRET = process.env.JWT_SECRET; 
const INVITATION_EXPIRATION = 7 * 24 * 60 * 60; // 7 jours en secondes

// --- Core logic for organizationInvitations ---

// Fonction utilitaire pour gérer les invitations expirées
async function handleExpiredInvitation(organization, email, context) {
    let advancedAttributes = {};
    try {
        advancedAttributes = typeof organization.advancedAttributes === "string"
            ? JSON.parse(organization.advancedAttributes)
            : organization.advancedAttributes || {};
    } catch (error) {
        console.error("Error parsing advancedAttributes:", error);
        advancedAttributes = {};
    }

    // Supprimer l'invitation expirée
    if (advancedAttributes.invitations && advancedAttributes.invitations[email]) {
        delete advancedAttributes.invitations[email];
        organization.advancedAttributes = JSON.stringify(advancedAttributes);
        await organization.save();
        context.logger.info(`Removed expired invitation for ${email} from organization ${organization.organizationID}`);
        return true;
    }
    return false;
}

/**
 * Mutation pour inviter un utilisateur à rejoindre une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'email, le message et l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services (notification, logger, etc.).
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec de l'invitation.
 */
export async function inviteUserToOrganization(parent, { input }, context) {
    const { email, message, organizationID, firstName, lastName } = input;
  
    // Vérifier si l'organisation existe
    const organization = await Organization.findByPk(organizationID);
    if (!organization) {
      throw new Error("Organization not found");
    }
  
    // Récupérer et parser advancedAttributes
    let advancedAttributes = {};
    try {
      advancedAttributes = typeof organization.advancedAttributes === "string"
        ? JSON.parse(organization.advancedAttributes)
        : organization.advancedAttributes || {};
    } catch (error) {
      console.error("Error parsing advancedAttributes:", error);
      advancedAttributes = {};
    }
  
    // Vérifier si une invitation existe déjà pour cet email
    const invitations = advancedAttributes.invitations || {};
    if (invitations[email]) {
      const isExpired = isInvitationExpired(invitations[email].expiresAt);
      if (!isExpired) {
        throw new Error("An active invitation already exists for this email.");
      } else {
        // Si l'invitation est expirée, la supprimer
        await handleExpiredInvitation(organization, email, context);
      }
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ where: { email } });
    const userID = existingUser ? existingUser.userID : null;
  
    // Générer un JWT pour l'invitation
    const token = jwt.sign(
      { email, organizationID, firstName, lastName, userID },
      JWT_SECRET,
      { expiresIn: INVITATION_EXPIRATION }
    );
  
    // Ajouter ou mettre à jour l'invitation
    invitations[email] = {
      token,
      expiresAt: new Date(Date.now() + INVITATION_EXPIRATION * 1000).toISOString(),
      firstName,
      lastName,
      userID
    };
    advancedAttributes.invitations = invitations;
  
    // Sauvegarder advancedAttributes dans la base de données
    try {
      await organization.update({
        advancedAttributes: JSON.stringify(advancedAttributes),
      });
    } catch (error) {
      console.error("Error updating advancedAttributes in the database:", error);
      throw new Error("Failed to save invitation data.");
    }
  
    // Préparer les données pour envoyer un email
    const eventData = {
      userIDs: null,
      email,
      data: {
        organizationName: organization.brand,
        invitationToken: token,
        message,
        firstName,
        lastName
      },
    };
    // Publier un événement pour envoyer l'email
    try {
      context.event.publish(SMPEvents.Organization.MemberOrganization.invited, eventData);
    } catch (error) {
      console.error("Error publishing event:", error);
      throw new Error("Failed to send invitation email.");
    }
  
    // Retourner une réponse positive
    return {
      success: true,
      message: "Invitation sent successfully.",
    };
}
  
  
// Fonction annexe pour vérifier si une invitation a expiré
function isInvitationExpired(expiresAt) {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  return expirationDate < now; // Retourne true si l'invitation a expiré
}

/**
 * Ajoute un utilisateur à une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur, l'ID de l'organisation et le rôle.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec.
 */
export async function addUserToOrganization(parent, { input }, context) {
    const { userID, organizationID, roleID = 3 } = input; // roleID 3 = Member par défaut 
  
    try {
        // Vérifier si l'utilisateur existe
        const user = await User.findByPk(userID);
        if (!user) {
            throw new Error("User not found");
        }
    
        // Vérifier si l'organisation existe
        const organization = await Organization.findByPk(organizationID);
        if (!organization) {
            throw new Error("Organization not found");
        }

        // Vérifier si l'utilisateur est déjà membre de l'organisation
        const existingMembership = await UserOrganization.findOne({
            where: {
                userID,
                organizationID
            }
        });

        // Gérer l'invitation si elle existe, même si l'utilisateur est déjà membre
        const advancedAttributes = organization.advancedAttributes ? JSON.parse(organization.advancedAttributes) : {};
        if (advancedAttributes.invitations && advancedAttributes.invitations[user.email]) {
            // Supprimer l'invitation
            delete advancedAttributes.invitations[user.email];
            organization.advancedAttributes = JSON.stringify(advancedAttributes);
            await organization.save();
            context.logger.info(`Removed invitation for ${user.email} from organization ${organizationID}`);
        }

        if (existingMembership) {
            return {
                success: true,
                message: "User is already a member of this organization",
                userOrganization: existingMembership
            };
        }

        // Préparer l'input pour createUserOrganization
        const userOrganizationInput = {
            userID,
            organizationID,
            roleID,
            state: "online",
            legend: `${user.username} est un membre de ${organization.name}`
        };

        // Utiliser le resolver createUserOrganization
        const userOrganization = await UserOrganizationResolvers.Mutation.createUserOrganization(
            null,
            { input: userOrganizationInput },
            context,
            {}
        );

        return {
            success: true,
            message: "User added to organization successfully.",
            userOrganization
        };
    } catch (error) {
        context.logger.error(`Error in addUserToOrganization: ${error.message}`);
        throw new Error(`Failed to add user to organization: ${error.message}`);
    }
}


  /**
 * Supprime un utilisateur d'une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur et l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec.
 */
  export async function removeUserFromOrganization(parent, { input }, context) {
    const { userID, organizationID } = input;
  
    // Vérifier si l'utilisateur est membre de l'organisation
    const userOrganization = await UserOrganization.findOne({
      where: { userID, organizationID },
    });
    if (!userOrganization) {
      throw new Error("User is not a member of this organization");
    }
  
    // Supprimer l'entrée de la table UserOrganization
    await userOrganization.destroy();
  
    // Publier un événement pour notifier la suppression
    context.event.publish(SMPEvents.Organization.UserOrganization.deleted, userOrganization);
   
  
    return {
      success: true,
      message: "User removed from organization successfully.",
    };
  }

  /**
 * Met à jour le rôle d'un utilisateur dans une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur, l'ID de l'organisation et le nouveau rôle.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec.
 */
  export async function updateUserRoleInOrganization(parent, { input }, context) {
    const { userID, organizationID, newRoleID } = input;
    console.log("updateUserRoleInOrganization", input);
  
    // Vérifier si l'utilisateur est membre de l'organisation
    const userOrganization = await UserOrganization.findOne({
      where: { userID, organizationID },
    });
    if (!userOrganization) {
      throw new Error("User is not a member of this organization");
    }
  
    // Mettre à jour le rôle
    userOrganization.roleID = newRoleID;
    console.log("userOrganization", userOrganization.roleID);
    await userOrganization.save();
  
    // Publier un événement pour notifier la mise à jour
    context.event.publish(SMPEvents.Organization.UserOrganization.updated, userOrganization);
  
    return {
      success: true,
      message: "User role updated successfully.",
      userOrganization,
    };
  }

/**
 * Formate les médias d'un profil utilisateur
 * @param {Object} profile - Le profil utilisateur
 * @returns {Object} - Le profil avec les médias formatés
 */
function formatProfileMedia(profile) {
  if (!profile) return null;

  const formattedProfile = profile.toJSON ? profile.toJSON() : profile;
  
  if (formattedProfile.profilePicture) {
    return {
      url: formattedProfile.profilePicture.url,

    };
  }

  return null;
}

export async function listOrganizationMembers(parent, { organizationID }, context) {
  const organization = await Organization.findByPk(organizationID);
  
  if (!organization) {
    throw new Error("Organization not found");
  }

  // Récupérer d'abord les membres avec leurs utilisateurs
  const members = await UserOrganization.findAll({
    where: { organizationID },
    include: [
      { 
        model: User,
        as: 'user',
      },
      { model: Role, as: 'role' }
    ],
  });

  // Récupérer tous les profileIDs
  const profileIDs = members.map(m => m.user?.profileID).filter(Boolean);
  
  // Récupérer les profils avec leurs médias
  const profiles = await Profile.findAll({
    where: { profileID: profileIDs },
    include: [
      {
        model: Media,
        as: 'profilePicture',
        required: false
      }
    ]
  });

  // Créer un map des profils pour un accès facile
  const profileMap = profiles.reduce((acc, profile) => {
    acc[profile.profileID] = profile;
    return acc;
  }, {});

  const SMPToLocalRole = {
    SMP_OWNER: "Owner",
    SMP_ADMIN: "Admin",
    SMP_EMPLOYEE: "Member"
  };

  const formattedMembers = members.map((member) => {
    const profile = profileMap[member.user?.profileID];

    return {
      userID: member.userID,
      username: member.user.username,
      email: member.user.email,
      name: profile?.firstName || "Services",
      lastname: profile?.lastName || "User",
      role: SMPToLocalRole[member.role?.roleName] || "Unknown",
      joinedAt: member.createdAt,
      profilePicture: profile?.profilePicture?.url || null,
      userOrganization: member
    };
  });

  let invitationMembers = [];
  if (organization.advancedAttributes) {
    try {
      const advancedAttributes = JSON.parse(organization.advancedAttributes);
      if (advancedAttributes.invitations) {
        invitationMembers = Object.entries(advancedAttributes.invitations).map(
          ([email, invitation]) => ({
            userID: `invitation_${email}`,
            email: email,
            username: email.split('@')[0],
            name: invitation.firstName || "Invitation",
            lastname: invitation.lastName || "Pending",
            role: "Member",
            joinedAt: new Date().toISOString(),
            profilePicture: null,
            userOrganization: null
          })
        );
      }
    } catch (error) {
      console.error("Error parsing advancedAttributes:", error);
    }
  }

  const allMembers = [...formattedMembers, ...invitationMembers];
  const totalMembers = allMembers.length;

  return {
    members: allMembers,
    totalMembers
  };
}
  

  


/**
 * Récupère les organisations auxquelles appartient un utilisateur,
 * ainsi que son rôle dans chaque organisation.
 */
export async function getUserOrganizations(parent, { userID }, context) {
  const user = await User.findByPk(userID);
  if (!user) {
    throw new Error("User not found");
  }

  const userOrganizations = await UserOrganization.findAll({
    where: { userID },
    include: [
      {
        model: Organization,
        as: "organization",
        include: [
          {
            model: OrganizationMedia,
            as: 'organizationMedia',
            include: [
              {
                model: Media,
                as: 'media'
              }
            ],
            required: false
          }
        ]
      },
      {
        model: Role,
        as: "role"
      }
    ]
  });

  const formattedOrganizations = userOrganizations.map((userOrg) => {
    // Trouver le média correspondant au smallLogo
    const smallLogoMedia = userOrg.organization?.organizationMedia?.find(
      m => m.organizationMediaID === userOrg.organization.smallLogo
    );

    return {
      organizationID: userOrg.organization?.organizationID || "Unknown",
      organizationName: userOrg.organization?.brand || userOrg.organization?.legalName || "Unknown",
      smallLogoUrl: smallLogoMedia?.media?.url || null,
      userRole: {
        roleID: userOrg.role?.roleID || "Unknown",
        roleName: userOrg.role?.roleName || "Unknown",
      },
    };
  });

  return formattedOrganizations;
}

  /**
   * Vérifie un token d'invitation et extrait les informations nécessaires.
   * 
   * @param {Object} parent - Parent resolver object.
   * @param {Object} args - Arguments contenant le token d'invitation.
   * @param {string} args.token - Token JWT à vérifier.
   * @param {Object} context - Contexte GraphQL avec accès aux services.
   * @returns {Promise<Object>} - Réponse indiquant si le token est valide, l'email, l'ID de l'organisation, et si l'utilisateur existe.
   */


export async function verifyInvitationToken(parent, { input }, context) {
  console.log("verifyInvitationToken");
  try {
    const { token } = input;
    const decoded = jwt.verify(token, JWT_SECRET);
    const { email, organizationID, userID, exp, firstName, lastName } = decoded;

    const now = Math.floor(Date.now() / 1000);
    if (now > exp) {
      // Si le token est expiré, supprimer l'invitation des advancedAttributes
      const organization = await Organization.findByPk(organizationID);
      if (organization) {
        await handleExpiredInvitation(organization, email, context);
      }

      return {
        success: false,
        message: "Token has expired.",
        email: "",
        organizationID: "",
        userExists: false,
        userID: null,
        firstName: "",
        lastName: ""
      };
    }

    if (!email || !organizationID) {
      return {
        success: false,
        message: "Invalid token data.",
        email: "",
        organizationID: "",
        userExists: false,
        userID: null,
        firstName: "",
        lastName: ""
      };
    }

    // Vérifier si l'organisation existe et si le token est toujours dans les invitations
    const organization = await Organization.findByPk(organizationID);
    if (!organization) {
      return {
        success: false,
        message: "Organization not found.",
        email: "",
        organizationID: "",
        userExists: false,
        userID: null,
        firstName: "",
        lastName: ""
      };
    }

    // Vérifier si le token existe toujours dans les invitations
    let advancedAttributes = {};
    try {
      advancedAttributes = typeof organization.advancedAttributes === "string"
        ? JSON.parse(organization.advancedAttributes)
        : organization.advancedAttributes || {};
    } catch (error) {
      console.error("Error parsing advancedAttributes:", error);
      return {
        success: false,
        message: "Invalid organization data.",
        email: "",
        organizationID: "",
        userExists: false,
        userID: null,
        firstName: "",
        lastName: ""
      };
    }

    // Si l'invitation n'existe plus, le token n'est plus valide
    if (!advancedAttributes.invitations || !advancedAttributes.invitations[email] || advancedAttributes.invitations[email].token !== token) {
      return {
        success: false,
        message: "Invitation no longer valid.",
        email: "",
        organizationID: "",
        userExists: false,
        userID: null,
        firstName: "",
        lastName: ""
      };
    }

    const existingUser = await User.findOne({ where: { email } });
    const userExists = !!existingUser;

    return {
      success: true,
      message: userExists ? "User already exists." : "Token is valid.",
      email,
      organizationID: String(organizationID),
      userExists,
      userID: userID || (existingUser ? existingUser.userID : null),
      firstName,
      lastName
    };
  } catch (error) {
    console.error("Error verifying invitation token:", error);

    return {
      success: false,
      message: "Invalid or expired token.",
      email: "",
      organizationID: "",
      userExists: false,
      userID: null,
      firstName: "",
      lastName: ""
    };
  }
}

  /**
 * Vérifie si un utilisateur appartient à une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur et l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @returns {Promise<Boolean>} - Booléen indiquant si l'utilisateur appartient à l'organisation.
 */
  export async function isUserInOrganization(parent, { userID, organizationID }, context) {
    const userOrganization = await UserOrganization.findOne({
      where: { userID, organizationID },
    });
    return !!userOrganization; 
  }

// --- GRAPHQL RESOLVERS ---

/**
 * Resolver pour inviter un utilisateur à rejoindre une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'email, le message et l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services (notification, logger, etc.).
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec de l'invitation.
 */
export async function inviteUserToOrganizationResolver(parent, { input }, context, info) {
return inviteUserToOrganization(parent, { input }, context);
}

/**
 * Resolver pour ajouter un utilisateur à une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur, l'ID de l'organisation et le rôle.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec.
 */
export async function addUserToOrganizationResolver(parent, { input }, context, info) {
return addUserToOrganization(parent, { input }, context);
}

/**
 * Resolver pour supprimer un utilisateur d'une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur et l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec.
 */
export async function removeUserFromOrganizationResolver(parent, { input }, context, info) {
return removeUserFromOrganization(parent, { input }, context);
}

/** 
 * Resolver pour mettre à jour le rôle d'un utilisateur dans une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur, l'ID de l'organisation et le nouveau rôle.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Object>} - Réponse indiquant le succès ou l'échec.
 */
export async function updateUserRoleInOrganizationResolver(parent, { input }, context, info) {
return updateUserRoleInOrganization(parent, { input }, context);
}

/**
 * Resolver pour lister les membres d'une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Array>} - Liste des membres de l'organisation.
 */
export async function listOrganizationMembersResolver(parent, { organizationID }, context, info) {
return listOrganizationMembers(parent, { organizationID }, context);
}   

/**
 * Resolver pour vérifier si un utilisateur appartient à une organisation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant l'ID de l'utilisateur et l'ID de l'organisation.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Boolean>} - Booléen indiquant si l'utilisateur appartient à l'organisation.
 */
 export async function isUserInOrganizationResolver(parent, { userID, organizationID }, context, info) {
return isUserInOrganization(parent, { userID, organizationID }, context);
}


/**
 * Resolver pour vérifier un token d'invitation.
 * @param {Object} parent - Parent resolver object.
 * @param {Object} args - Arguments contenant le token d'invitation.
 * @param {Object} context - Contexte GraphQL avec accès aux services.
 * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
 * @returns {Promise<Object>} - Réponse indiquant si le token est valide, l'email, l'ID de l'organisation, et si l'utilisateur existe.
 */
export async function verifyInvitationTokenResolver(parent, { input }, context, info) {
    return verifyInvitationToken(parent, { input }, context);
  }

  /**
   * Resolver pour récupérer les organisations auxquelles appartient un utilisateur.
   * @param {Object} parent - Parent resolver object.
   * @param {Object} args - Arguments contenant l'ID de l'utilisateur.
   * @param {Object} context - Contexte GraphQL avec accès aux services
   * @param {Object} info - Informations supplémentaires sur la requête GraphQL.
   * @returns {Promise<Array>} - Liste des organisations de l'utilisateur.
   * @throws {Error} - Erreur si l'utilisateur n'existe pas.
   * @throws {Error} - Erreur si la récupération des organisations échoue.
   * 
    */
    export async function getUserOrganizationsResolver(parent, { userID }, context, info) {
      console.log("getUserOrganizationsResolver", userID);
        return getUserOrganizations(parent, { userID }, context);
      }



/**
 * Assigne automatiquement le rôle de superAdmin au créateur d'une organisation.
 *
 * Cette fonction doit être appelée dans le resolver de création d'organisation.
 *
 * @param {string} organizationID - L'identifiant de l'organisation nouvellement créée.
 * @param {string} authorID - L'identifiant de l'utilisateur créateur de l'organisation.
 * @param {Object} context - Le contexte GraphQL.
 * @returns {Promise<Object>} - L'objet userOrganization créé.
 */
export async function assignSuperAdminToOrganization(organizationID, authorID, context) {

  const input = {
    state: "online",
    userID: authorID,
    organizationID,
    roleID: 4,
    legende: "Propriétaire de l'organisation",
  };

  return await UserOrganizationResolvers.Mutation.createUserOrganization(null, { input }, context, {});
}

export async function removeInvitation(parent, { input }, context) {
  if (!input) {
    return {
      success: false,
      message: "Input is required"
    };
  }

  const { email, organizationID } = input;

  if (!email || !organizationID) {
    return {
      success: false,
      message: "Email and organizationID are required"
    };
  }

  const organization = await Organization.findByPk(organizationID);
  if (!organization) {
    return {
      success: false,
      message: "Organization not found"
    };
  }

  let advancedAttributes = {};
  try {
    advancedAttributes = typeof organization.advancedAttributes === "string"
      ? JSON.parse(organization.advancedAttributes)
      : organization.advancedAttributes || {};
  } catch (error) {
    console.error("Error parsing advancedAttributes:", error);
    return {
      success: false,
      message: "Failed to process organization data"
    };
  }

  const invitations = advancedAttributes.invitations || {};
  if (!invitations[email]) {
    return {
      success: false,
      message: "No invitation found for this email"
    };
  }

  delete invitations[email];
  advancedAttributes.invitations = invitations;

  try {
    await organization.update({
      advancedAttributes: JSON.stringify(advancedAttributes),
    });
  } catch (error) {
    console.error("Error updating advancedAttributes:", error);
    return {
      success: false,
      message: "Failed to remove invitation"
    };
  }

  return {
    success: true,
    message: "Invitation removed successfully"
  };
}

export async function removeInvitationResolver(parent, { input }, context) {
  try {
    const result = await removeInvitation(parent, { input }, context);
    return result;
  } catch (error) {
    console.error("Error in removeInvitation resolver:", error);
    return {
      success: false,
      message: error.message || "Failed to remove invitation"
    };
  }
}
