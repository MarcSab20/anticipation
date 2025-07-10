package authz

# Règle par défaut : refuser
default allow = false
default decision = {"allow": false, "reason": "Accès refusé - Aucune règle d'autorisation applicable"}

# Décision principale avec priorité des refus
allow if {
    not deny  # Vérifier d'abord qu'il n'y a pas de règle de refus explicite
    is_allowed  # Puis vérifier si une règle d'autorisation s'applique
}

# Règles de refus explicites prioritaires
deny_reasons = {
    "org_deletion_denied": "Accès refusé - Un propriétaire ne peut pas supprimer une organisation officielle",
    "outside_business_hours": "Accès refusé - Action sensible impossible en dehors des heures ouvrables",
    "high_risk_score": "Accès refusé - Score de risque trop élevé pour cette action sensible",
    "expired_contract": "Accès refusé - Contrat expiré, accès révoqué",
    "insufficient_clearance": "Accès refusé - Niveau d'habilitation insuffisant pour accéder à cette ressource confidentielle",
    "invalid_state_transition": "Accès refusé - Transition d'état non autorisée pour ce rôle",
    "external_ip": "Accès refusé - Adresse IP externe, connexion non autorisée pour cette action",
    "different_department": "Accès refusé - Accès limité aux ressources de votre département",
    "not_resource_owner": "Accès refusé - Seul le propriétaire peut effectuer cette action",
    "no_organization_role": "Accès refusé - Rôle d'organisation requis",
    "self_invitation": "Accès refusé - Impossible de s'inviter soi-même",
    "already_member": "Accès refusé - L'utilisateur est déjà membre de l'organisation",
    "too_many_invitations": "Accès refusé - Trop d'invitations en attente pour cette organisation"
}

# Raisons d'autorisation
allow_reasons = {
    "platform_admin": "Autorisé - Administrateur de plateforme",
    "platform_role": "Autorisé - Rôle de plateforme",
    "organization_role": "Autorisé - Rôle d'organisation",
    "resource_owner": "Autorisé - Propriétaire de ressource",
    "same_department": "Autorisé - Même département",
    "non_confidential": "Autorisé - Ressource non confidentielle",
    "sufficient_clearance": "Autorisé - Niveau d'habilitation suffisant",
    "internal_ip": "Autorisé - Connexion depuis IP interne",
    "valid_state_transition": "Autorisé - Transition d'état valide",
    "invitation_access": "Autorisé - Accès public pour vérification d'invitation",
    "self_organization_access": "Autorisé - Accès à ses propres organisations",
    "organization_member_access": "Autorisé - Membre de l'organisation"
}

# Déterminer la raison du refus
deny_reason = deny_reasons["org_deletion_denied"] if {
    is_owner_deleting_official_org
} else = deny_reasons["outside_business_hours"] if {
    is_outside_business_hours
    requires_business_hours
} else = deny_reasons["high_risk_score"] if {
    risk_score_too_high
} else = deny_reasons["expired_contract"] if {
    expired_contract
} else = deny_reasons["insufficient_clearance"] if {
    input.resource.attributes.confidential == true
    user_clearance := safe_number(input.user.attributes.clearanceLevel)
    required_clearance := safe_number(input.resource.attributes.requiredClearance)
    user_clearance < required_clearance
} else = deny_reasons["invalid_state_transition"] if {
    input.resource.attributes.state != null
    input.resource.attributes.targetState != null
    not valid_state_transition
} else = deny_reasons["external_ip"] if {
    sensitive_actions[input.action]
    not internal_ip_check
} else = deny_reasons["different_department"] if {
    input.action == "read"
    input.user.attributes.department != null
    input.resource.attributes.department != null
    input.user.attributes.department != input.resource.attributes.department
    not has_override_role
} else = deny_reasons["not_resource_owner"] if {
    not is_platform_admin
    input.action == "delete"
    not is_resource_owner
} else = deny_reasons["no_organization_role"] if {
    org_id := input.resource.organization_id
    org_id != null
    # Vérifier que l'utilisateur appartient à une organisation
    count(input.user.organization_ids) > 0
    
    # Aucune des organisations de l'utilisateur ne correspond
    not org_id_match
} else = deny_reasons["self_invitation"] if {
    input.action == "invite"
    input.resource.type == "organization"
    input.context.targetEmail == input.user.attributes.email
} else = deny_reasons["already_member"] if {
    input.action == "invite"
    input.resource.type == "organization"
    input.context.targetUserAlreadyMember == true
} else = deny_reasons["too_many_invitations"] if {
    input.action == "invite"
    input.resource.type == "organization"
    input.context.pendingInvitationsCount > 10
}

org_id_match if {
    org_id := input.resource.organization_id
    org_user_id := input.user.organization_ids[_]
    org_id == org_user_id
}

# Déterminer la raison de l'autorisation
allow_reason = allow_reasons["platform_admin"] if {
    is_platform_admin
} else = allow_reasons["platform_role"] if {
    has_platform_role_permission
} else = allow_reasons["organization_role"] if {
    has_org_role_permission
} else  = allow_reasons["resource_owner"] if {
    is_resource_owner
    not is_owner_deleting_official_org
} else = allow_reasons["same_department"] if {
    same_department
} else = allow_reasons["non_confidential"] if {
    non_confidential_read
} else = allow_reasons["sufficient_clearance"] if {
    sufficient_clearance
} else = allow_reasons["internal_ip"] if {
    internal_ip_check
} else = allow_reasons["valid_state_transition"] if {
    valid_state_transition
} else = allow_reasons["invitation_access"] if {
    input.action == "verify_invitation"
    input.resource.type == "organization"
} else = allow_reasons["self_organization_access"] if {
    input.action == "read"
    input.resource.type == "user"
    input.user.id == input.resource.id
} else = allow_reasons["organization_member_access"] if {
    input.resource.type == "user_organization"
    org_id_match
} 

deny if {
    is_owner_deleting_official_org
}

deny if {
    is_outside_business_hours
    requires_business_hours
}

deny if {
    risk_score_too_high
}

deny if {
    expired_contract
}

deny if {
    input.resource.attributes.confidential == true
    input.action == "read"
    user_clearance := safe_number(input.user.attributes.clearanceLevel)
    required_clearance := safe_number(input.resource.attributes.requiredClearance)
    user_clearance < required_clearance
    not (is_platform_admin)
}

deny if {
    sensitive_actions[input.action]
    not internal_ip_check
    not (is_platform_admin)
}

deny if {
    input.action == "invite"
    input.resource.type == "organization"
    input.context.targetEmail == input.user.attributes.email
}

deny if {
    input.action == "invite"
    input.resource.type == "organization"
    input.context.targetUserAlreadyMember == true
}


deny if {
    input.action == "invite"
    input.resource.type == "organization"
    input.context.pendingInvitationsCount > 10
}

# Règle spécifique: propriétaire ne peut pas supprimer une organisation officielle
is_owner_deleting_official_org if {
    input.action == "delete"
    input.resource.type == "Organization"
    input.resource.attributes.isOfficial == true
    input.user.id == input.resource.owner_id
}

is_owner_deleting_official_org if {
    input.action == "delete"
    input.resource.type == "Organization"
    input.resource.attributes.isOfficial == true
    input.user.id == input.resource.attributes.userId
}

# Vérification des rôles qui permettent de contourner certaines restrictions
has_override_role if {
    override_roles[r]
    r == input.user.roles[_]
}

override_roles = {
    "PLATFORM_ADMIN": true,
    "PLATFORM_SECURITY": true,
    "ORGANIZATION_OWNER": true,
    "ORGANIZATION_ADMIN": true
}

# Collection de toutes les règles d'autorisation
is_allowed if {
    rbac_rules
}

is_allowed if {
    abac_rules
}

is_allowed if {
    workflow_rules
}

# --- RÈGLES RBAC ---
rbac_rules if {
    is_platform_admin
}

rbac_rules if {
    has_platform_role_permission
}

rbac_rules if {
    has_org_role_permission
}

rbac_rules if {
    is_resource_owner
    not is_owner_deleting_official_org  # Vérification supplémentaire
}

# Règle: Administrateur de plateforme peut tout faire
is_platform_admin if {
    role_matches("PLATFORM_ADMIN", input.user.roles)
}

# Règle: Autorisation basée sur les rôles de plateforme
has_platform_role_permission if {
    role := input.user.roles[_]
    platform_rules[input.resource.type][input.action][role]
}

# Règle: Autorisation basée sur les rôles d'organisation
has_org_role_permission if {
    org_id := input.resource.organization_id
    org_id != null
    
    org_id == input.user.organization_ids[_]
    
    role := input.user.roles[_]
    org_rules[input.resource.type][input.action][role]
}

# Règle: Propriétaire de ressource
is_resource_owner if {
    input.user.id == input.resource.owner_id
}

is_resource_owner if {
    input.user.id == input.resource.attributes.userId
}

# --- RÈGLES ABAC ---
abac_rules if {
    same_department
}

abac_rules if {
    non_confidential_read
}

abac_rules if {
    sufficient_clearance
}

abac_rules if {
    internal_ip_check
}

# Règle: Même département
same_department if {
    input.action == "read"  # Uniquement pour l'action read
    
    user_dept := input.user.attributes.department
    res_dept := input.resource.attributes.department
    
    user_dept != null
    res_dept != null
    
    user_dept == res_dept
}

# Règle: Document non confidentiel en lecture
non_confidential_read if {
    input.resource.attributes.confidential == false
    input.action == "read"
}

# Règle: Niveau de sécurité suffisant
sufficient_clearance if {
    input.resource.attributes.confidential == true
    input.action == "read"
    
    user_clearance := safe_number(input.user.attributes.clearanceLevel)
    required_clearance := safe_number(input.resource.attributes.requiredClearance)
    
    required_clearance > 0
    user_clearance >= required_clearance
}

# Règle: IP interne
internal_ip_check if {
    context_ip := input.context.ip
    startswith(context_ip, "127.0.0.")
}

internal_ip_check if {
    context_ip := input.context.ip
    startswith(context_ip, "10.")
}

# Règle: Contrat expiré
expired_contract if {
    user_contract_expiry := input.user.attributes.contractExpiryDate
    user_contract_expiry != null
    
    context_date := input.context.currentDate
    context_date != null
    
    user_contract_expiry < context_date
}

# Règle: En dehors des heures ouvrables
is_outside_business_hours if {
    input.context.businessHours == false
}

# Actions qui nécessitent d'être pendant les heures ouvrables
requires_business_hours if {
    input.action == "create"
    sensitive_resource_types[input.resource.type]
}

requires_business_hours if {
    input.action == "delete"
}

requires_business_hours if {
    input.action == "update"
    sensitive_resource_types[input.resource.type]
}

requires_business_hours if {
    sensitive_actions[input.action]
}

# Types de ressources sensibles
sensitive_resource_types = {
    "Organization": true,
    "Service": true,
    "User": true,
    "PaymentConfig": true,
    "Order": true,
    "Transaction": true
}

# Règle: Score de risque trop élevé
risk_score_too_high if {
    risk_score := input.context.riskScore
    risk_score != null
    
    risk_threshold := 70  # Seuil de risque configurable
    
    risk_score > risk_threshold
    
    sensitive_actions[input.action]
}

# Actions sensibles
sensitive_actions = {
    "delete": true,
    "markPaid": true,
    "confirmOrder": true,
    "updatePolicy": true,
    "cancelOrder": true,
    "confirmBooking": true,
    "cancelBooking": true
}

# --- RÈGLES DE WORKFLOW ---
workflow_rules if {
    valid_state_transition
}

# Règle: Transition d'état valide
valid_state_transition if {
    input.resource.attributes.state != null
    input.resource.attributes.targetState != null
    
    current_state := input.resource.attributes.state
    target_state := input.resource.attributes.targetState
    
    # Vérifier si la transition est valide
    state_transition_allowed(input.resource.type, current_state, target_state, input.user.roles[_])
}

# Fonction: Transition d'état autorisée
state_transition_allowed(res_type, current, target, role) if {
    transitions_matrix[res_type][current][target][role]
}

# Fonction utilitaire: correspondance de rôle
role_matches(required_role, user_roles) if {
    user_roles[_] == required_role
}

# Fonction utilitaire: conversion sécurisée en nombre
safe_number(val) = num if {
    val != null
    is_number(val)
    num = val
} else = num if {
    val != null
    is_string(val)
    num = to_number(val)
} else = 0

# Mise à jour des règles plateforme
platform_rules = {
    "Asset": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_MODERATOR": true, "PLATFORM_SECURITY": true},
        "create": {"PLATFORM_ADMIN": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_MODERATOR": true},
        "delete": {"PLATFORM_ADMIN": true}
    },
    "Comment": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_MODERATOR": true, "PLATFORM_DATA_ANALYST": true},
        "create": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_MODERATOR": true},
        "delete": {"PLATFORM_ADMIN": true, "PLATFORM_MODERATOR": true}
    },
    "Organization": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_MODERATOR": true, "PLATFORM_COMPLIANCE": true},
        "create": {"PLATFORM_ADMIN": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "delete": {"PLATFORM_ADMIN": true},
        "invite": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
        "add_member": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
        "remove_member": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
        "update_member": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
        "manage_invitation": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
        "verify_invitation": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true, "GUEST": true},
        "list": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true, "TEAM_LEADER": true}
    },
    "User": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_SECURITY": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "delete": {"PLATFORM_ADMIN": true}
    },
    "Service": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_MODERATOR": true},
        "create": {"PLATFORM_ADMIN": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "delete": {"PLATFORM_ADMIN": true}
    },
    "Order": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "confirmOrder": {"PLATFORM_ADMIN": true},
        "cancelOrder": {"PLATFORM_ADMIN": true},
        "markPaid": {"PLATFORM_ADMIN": true},
        "markDelivered": {"PLATFORM_ADMIN": true}
    },
    "Booking": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "update": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "confirmBooking": {"PLATFORM_ADMIN": true},
        "cancelBooking": {"PLATFORM_ADMIN": true},
        "markCompleted": {"PLATFORM_ADMIN": true}
    },
    "Transaction": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_SECURITY": true, "PLATFORM_COMPLIANCE": true},
        "update": {"PLATFORM_ADMIN": true}
    },
    "PaymentConfig": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SECURITY": true, "PLATFORM_COMPLIANCE": true},
        "update": {"PLATFORM_ADMIN": true}
    },
    "PaymentMethod": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true, "PLATFORM_SECURITY": true},
        "update": {"PLATFORM_ADMIN": true}
    },
    "Profile": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "update": {"PLATFORM_ADMIN": true}
    },
    "UserPreferences": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "update": {"PLATFORM_ADMIN": true}
    },
    "Availability": {
        "read": {"PLATFORM_ADMIN": true, "PLATFORM_SUPPORT": true},
        "update": {"PLATFORM_ADMIN": true},
        "create": {"PLATFORM_ADMIN": true},
        "delete": {"PLATFORM_ADMIN": true},
        "cancelAvailability": {"PLATFORM_ADMIN": true}
    }
}

# Mise à jour des règles organisation
org_rules = {
    "Asset": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true, "TEAM_LEADER": true},
        "create": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "TEAM_LEADER": true},
        "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "TEAM_LEADER": true},
        "delete": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true}
    },
    "Comment": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true, "CONTRIBUTOR": true},
        "create": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true, "CONTRIBUTOR": true},
        "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "TEAM_LEADER": true},
        "delete": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true}
    },
    "Service": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true, "SALES_AGENT": true, "STANDARD_MEMBER": true},
        "create": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_MANAGER": true},
        "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_MANAGER": true, "CONTENT_CREATOR": true},
        "delete": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true}
    },
    "Order": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true, "SALES_AGENT": true, "FINANCE_MANAGER": true},
        "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SALES_AGENT": true},
        "confirmOrder": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_MANAGER": true, "SALES_AGENT": true},
        "cancelOrder": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_MANAGER": true},
        "markPaid": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "FINANCE_MANAGER": true},
        "markDelivered": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "LOGISTICS_MANAGER": true}
    },
    "Booking": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true},
        "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true},
        "confirmBooking": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true},
        "cancelBooking": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_MANAGER": true},
        "markCompleted": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true}
    },
    "Availability": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true, "STANDARD_MEMBER": true},
        "create": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true},
        "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true},
        "delete": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_MANAGER": true},
        "cancelAvailability": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "SERVICE_PROVIDER": true, "SERVICE_MANAGER": true}
    },
    "Transaction": {
        "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "FINANCE_MANAGER": true},
        "update": {"ORGANIZATION_OWNER": true, "FINANCE_MANAGER": true}
    },
    "user_organization": {
    "read": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true, "TEAM_LEADER": true},
    "create": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
    "update": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
    "delete": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true},
    "list": {"ORGANIZATION_OWNER": true, "ORGANIZATION_ADMIN": true, "STANDARD_MEMBER": true}
}
}

# Matrice des transitions d'état
transitions_matrix = {
    "Order": {
        "DRAFT": {
            "CONFIRMED": {
                "BUSINESS_CONSUMER": true,
                "ENTERPRISE_CLIENT": true,
                "ORDER_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_MANAGER": true,
                "SALES_AGENT": true
            },
            "CANCELLED": {
                "BUSINESS_CONSUMER": true,
                "ENTERPRISE_CLIENT": true,
                "ORDER_ADMINISTRATOR": true,
                "SUPPORT_MANAGER": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_MANAGER": true
            }
        },
        "CONFIRMED": {
            "PAID": {
                "FINANCE_MANAGER": true,
                "PAYMENT_PROCESSOR": true,
                "ORDER_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true
            },
            "CANCELLED": {
                "ENTERPRISE_CLIENT": true,
                "BUSINESS_CONSUMER": true,
                "ORDER_ADMINISTRATOR": true,
                "SUPPORT_MANAGER": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_MANAGER": true
            }
        },
        "PAID": {
            "DELIVERED": {
                "LOGISTICS_MANAGER": true,
                "DELIVERY_AGENT": true,
                "ORDER_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_PROVIDER": true
            },
            "CANCELLED": {
                "ORDER_ADMINISTRATOR": true,
                "SUPPORT_MANAGER": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true
            }
        }
    },
    "Booking": {
        "PENDING": {
            "CONFIRMED": {
                "PROVIDER_USER": true,
                "PROVIDER_MANAGER": true,
                "SCHEDULING_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_PROVIDER": true,
                "SERVICE_MANAGER": true
            },
            "CANCELLED": {
                "CLIENT_USER": true,
                "CLIENT_MANAGER": true,
                "PROVIDER_MANAGER": true,
                "SUPPORT_MANAGER": true,
                "SCHEDULING_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_MANAGER": true
            }
        },
        "CONFIRMED": {
            "COMPLETED": {
                "PROVIDER_USER": true,
                "PROVIDER_MANAGER": true,
                "SCHEDULING_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_PROVIDER": true,
                "SERVICE_MANAGER": true
            },
            "CANCELLED": {
                "CLIENT_USER": true,
                "CLIENT_MANAGER": true,
                "PROVIDER_MANAGER": true,
                "SUPPORT_MANAGER": true,
                "SCHEDULING_ADMINISTRATOR": true,
                "ORGANIZATION_OWNER": true,
                "ORGANIZATION_ADMIN": true,
                "SERVICE_MANAGER": true
            }
        },
        "COMPLETED": {
            "REVIEWED": {
                "CLIENT_USER": true,
                "CLIENT_MANAGER": true
            }
        }
    }
}

# --- STRUCTURE DE DÉCISION COMPLÈTE ---
decision = {
    "allow": allow,
    "reason": deny_reason
} if {
    deny
} else = {
    "allow": allow,
    "reason": allow_reason
} if {
    allow
} else = {
    "allow": false,
    "reason": "Accès refusé - Aucune règle d'autorisation applicable"
}

is_allowed if {
    input.action == "verify_invitation"
    input.resource.type == "organization"
    # Pas besoin de vérification d'organisation pour la vérification de token
}

# Règle spéciale : Lecture de ses propres organisations utilisateur
is_allowed if {
    input.action == "read"
    input.resource.type == "user"
    input.user.id == input.resource.id
    # L'utilisateur peut toujours lire ses propres organisations
}

# Règle spéciale : Accès aux relations user_organization pour ses propres données
is_allowed if {
    input.resource.type == "user_organization"
    input.action in {"read", "list"}

}