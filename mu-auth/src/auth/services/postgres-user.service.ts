// mu-auth/src/auth/services/postgres-user.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface PostgresUser {
  id: string;
  keycloakId?: string | null;
  username: string;
  email: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
  enabled: boolean;
  department?: string | null;
  clearanceLevel: number;
  contractExpiryDate?: Date | null;
  managerId?: string | null;
  jobTitle?: string | null;
  businessUnit?: string | null;
  territorialJurisdiction?: string | null;
  technicalExpertise: string[];
  hierarchyLevel: number;
  workLocation?: string | null;
  employmentType: string;
  verificationStatus: string;
  riskScore: number;
  certifications: string[];
  phoneNumber?: string | null;
  nationality?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  state: string;
  createdTimestamp: Date;
  updatedTimestamp: Date;
  lastLogin?: Date | null;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  customAttributes?: any;
}

export interface PostgresUserWithRoles extends PostgresUser {
  roles: string[];
  organization_ids: string[];
  custom_attributes: any;
}

export interface UserSearchOptions {
  searchTerm?: string;
  departments?: string[];
  states?: string[];
  verificationStatus?: string[];
  clearanceLevels?: number[];
  employmentTypes?: string[];
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UserCreationData {
  username: string;
  email: string;
  emailVerified?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  enabled?: boolean;
  keycloakId?: string | null;
  department?: string | null;
  clearanceLevel?: number;
  contractExpiryDate?: Date | null;
  managerId?: string | null;
  jobTitle?: string | null;
  businessUnit?: string | null;
  territorialJurisdiction?: string | null;
  technicalExpertise?: string[];
  hierarchyLevel?: number;
  workLocation?: string | null;
  employmentType?: string;
  verificationStatus?: string;
  riskScore?: number;
  certifications?: string[];
  phoneNumber?: string | null;
  nationality?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  state?: string;
  customAttributes?: Record<string, any>;
}

@Injectable()
export class PostgresUserService implements OnModuleInit {
  private readonly logger = new Logger(PostgresUserService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    this.logger.log('✅ PostgresUserService initialized');
  }

  // ============================================================================
  // GESTION DES UTILISATEURS - CRUD DE BASE
  // ============================================================================

  async createUser(userData: UserCreationData): Promise<PostgresUser> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Créer l'utilisateur principal
        const user = await tx.user.create({
          data: {
            username: userData.username,
            email: userData.email,
            emailVerified: userData.emailVerified || false,
            firstName: userData.firstName,
            lastName: userData.lastName,
            enabled: userData.enabled !== false,
            keycloakId: userData.keycloakId,
            
            // Données métier
            department: userData.department,
            clearanceLevel: userData.clearanceLevel || 1,
            contractExpiryDate: userData.contractExpiryDate,
            managerId: userData.managerId,
            jobTitle: userData.jobTitle,
            businessUnit: userData.businessUnit,
            territorialJurisdiction: userData.territorialJurisdiction,
            technicalExpertise: userData.technicalExpertise || [],
            hierarchyLevel: userData.hierarchyLevel || 1,
            workLocation: userData.workLocation,
            employmentType: userData.employmentType || 'PERMANENT',
            verificationStatus: userData.verificationStatus || 'PENDING',
            riskScore: userData.riskScore || 0,
            certifications: userData.certifications || [],
            phoneNumber: userData.phoneNumber,
            nationality: userData.nationality,
            dateOfBirth: userData.dateOfBirth,
            gender: userData.gender,
            state: userData.state || 'ACTIVE',
            
            // Attributs personnalisés
            customAttributes: userData.customAttributes || {}
          }
        });

        // Créer les attributs étendus si nécessaire
        if (userData.customAttributes) {
          await this.createUserAttributes(tx, user.id, userData.customAttributes);
        }

        this.logger.debug(`✅ User created: ${userData.username} (${user.id})`);
        return user;
      });
    } catch (error) {
      this.logger.error(`❌ Failed to create user ${userData.username}:`, error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<PostgresUserWithRoles | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          roles: {
            include: {
              role: true
            }
          },
          organizations: {
            include: {
              organization: true
            }
          },
          attributes: true
        }
      });

      if (!user) return null;

      return this.mapToPostgresUserWithRoles(user);
    } catch (error) {
      this.logger.error(`❌ Failed to get user by ID ${id}:`, error);
      return null;
    }
  }

  async getUserByUsername(username: string): Promise<PostgresUserWithRoles | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
        include: {
          roles: {
            include: {
              role: true
            }
          },
          organizations: {
            include: {
              organization: true
            }
          },
          attributes: true
        }
      });

      if (!user) return null;

      return this.mapToPostgresUserWithRoles(user);
    } catch (error) {
      this.logger.error(`❌ Failed to get user by username ${username}:`, error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<PostgresUserWithRoles | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          roles: {
            include: {
              role: true
            }
          },
          organizations: {
            include: {
              organization: true
            }
          },
          attributes: true
        }
      });

      if (!user) return null;

      return this.mapToPostgresUserWithRoles(user);
    } catch (error) {
      this.logger.error(`❌ Failed to get user by email ${email}:`, error);
      return null;
    }
  }

  async getUserByKeycloakId(keycloakId: string): Promise<PostgresUserWithRoles | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { keycloakId },
        include: {
          roles: {
            include: {
              role: true
            }
          },
          organizations: {
            include: {
              organization: true
            }
          },
          attributes: true
        }
      });

      if (!user) return null;

      return this.mapToPostgresUserWithRoles(user);
    } catch (error) {
      this.logger.error(`❌ Failed to get user by Keycloak ID ${keycloakId}:`, error);
      return null;
    }
  }

  async updateUser(id: string, updates: Partial<UserCreationData>): Promise<PostgresUser> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Extraire les attributs personnalisés
        const { customAttributes, ...userData } = updates;

        // Mettre à jour les données principales
        const updatedUser = await tx.user.update({
          where: { id },
          data: {
            ...userData,
            updatedTimestamp: new Date()
          }
        });

        // Mettre à jour les attributs personnalisés si fournis
        if (customAttributes !== undefined) {
          // Supprimer les anciens attributs
          await tx.userAttribute.deleteMany({
            where: { userId: id }
          });

          // Créer les nouveaux attributs
          if (Object.keys(customAttributes).length > 0) {
            await this.createUserAttributes(tx, id, customAttributes);
          }

          // Mettre à jour le JSON des attributs personnalisés
          await tx.user.update({
            where: { id },
            data: { customAttributes }
          });
        }

        this.logger.debug(`✅ User updated: ${id}`);
        return updatedUser;
      });
    } catch (error) {
      this.logger.error(`❌ Failed to update user ${id}:`, error);
      throw error;
    }
  }

  async deleteUser(id: string, softDelete: boolean = true): Promise<boolean> {
    try {
      if (softDelete) {
        // Suppression logique
        await this.prisma.user.update({
          where: { id },
          data: {
            state: 'DELETED',
            enabled: false,
            updatedTimestamp: new Date()
          }
        });
      } else {
        // Suppression physique (avec cascade)
        await this.prisma.user.delete({
          where: { id }
        });
      }

      this.logger.debug(`✅ User ${softDelete ? 'soft-' : ''}deleted: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to delete user ${id}:`, error);
      return false;
    }
  }

  // ============================================================================
  // RECHERCHE ET FILTRAGE AVANCÉS
  // ============================================================================

  async searchUsers(options: UserSearchOptions = {}): Promise<{
    users: PostgresUserWithRoles[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const {
        searchTerm,
        departments,
        states,
        verificationStatus,
        clearanceLevels,
        employmentTypes,
        limit = 50,
        offset = 0,
        sortBy = 'updatedTimestamp',
        sortOrder = 'desc'
      } = options;

      // Construire les conditions WHERE
      const where: Prisma.UserWhereInput = {
        AND: [
          // Recherche textuelle
          searchTerm ? {
            OR: [
              { username: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { firstName: { contains: searchTerm, mode: 'insensitive' } },
              { lastName: { contains: searchTerm, mode: 'insensitive' } },
              { jobTitle: { contains: searchTerm, mode: 'insensitive' } },
              { department: { contains: searchTerm, mode: 'insensitive' } }
            ]
          } : {},

          // Filtres spécifiques
          departments?.length ? { department: { in: departments } } : {},
          states?.length ? { state: { in: states } } : {},
          verificationStatus?.length ? { verificationStatus: { in: verificationStatus } } : {},
          clearanceLevels?.length ? { clearanceLevel: { in: clearanceLevels } } : {},
          employmentTypes?.length ? { employmentType: { in: employmentTypes } } : {}
        ]
      };

      // Compter le total
      const total = await this.prisma.user.count({ where });

      // Récupérer les utilisateurs
      const users = await this.prisma.user.findMany({
        where,
        include: {
          roles: { include: { role: true } },
          organizations: { include: { organization: true } },
          attributes: true
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset
      });

      const mappedUsers = users.map(user => this.mapToPostgresUserWithRoles(user));

      return {
        users: mappedUsers,
        total,
        hasMore: offset + users.length < total
      };
    } catch (error) {
      this.logger.error('❌ Failed to search users:', error);
      throw error;
    }
  }

  // ============================================================================
  // GESTION DES RÔLES
  // ============================================================================

  async assignRoleToUser(userId: string, roleName: string, assignedBy?: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Obtenir ou créer le rôle
        const role = await tx.role.upsert({
          where: { name: roleName },
          update: {},
          create: { name: roleName }
        });

        // Vérifier si l'assignation existe déjà
        const existingAssignment = await tx.userRole.findUnique({
          where: {
            userId_roleId: {
              userId,
              roleId: role.id
            }
          }
        });

        if (existingAssignment) {
          return false; // Déjà assigné
        }

        // Créer l'assignation
        await tx.userRole.create({
          data: {
            userId,
            roleId: role.id,
            assignedBy: assignedBy || 'SYSTEM'
          }
        });

        this.logger.debug(`✅ Role ${roleName} assigned to user ${userId}`);
        return true;
      });
    } catch (error) {
      this.logger.error(`❌ Failed to assign role ${roleName} to user ${userId}:`, error);
      return false;
    }
  }

  async removeRoleFromUser(userId: string, roleName: string): Promise<boolean> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Trouver le rôle
        const role = await tx.role.findUnique({
          where: { name: roleName }
        });

        if (!role) {
          return false;
        }

        // Supprimer l'assignation
        const deleted = await tx.userRole.deleteMany({
          where: {
            userId,
            roleId: role.id
          }
        });

        return deleted.count > 0;
      });

      if (result) {
        this.logger.debug(`✅ Role ${roleName} removed from user ${userId}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to remove role ${roleName} from user ${userId}:`, error);
      return false;
    }
  }

  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true }
      });

      return userRoles.map(ur => ur.role.name);
    } catch (error) {
      this.logger.error(`❌ Failed to get roles for user ${userId}:`, error);
      return [];
    }
  }

  async updateUserRoles(userId: string, roleNames: string[], assignedBy?: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Supprimer tous les rôles existants
        await tx.userRole.deleteMany({
          where: { userId }
        });

        // Assigner les nouveaux rôles
        for (const roleName of roleNames) {
          const role = await tx.role.upsert({
            where: { name: roleName },
            update: {},
            create: { name: roleName }
          });

          await tx.userRole.create({
            data: {
              userId,
              roleId: role.id,
              assignedBy: assignedBy || 'SYSTEM'
            }
          });
        }

        this.logger.debug(`✅ Updated roles for user ${userId}: ${roleNames.join(', ')}`);
        return true;
      });
    } catch (error) {
      this.logger.error(`❌ Failed to update roles for user ${userId}:`, error);
      return false;
    }
  }

  // ============================================================================
  // GESTION DES ORGANISATIONS
  // ============================================================================

  async assignUserToOrganization(userId: string, organizationName: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Obtenir ou créer l'organisation
        const organization = await tx.organization.upsert({
          where: { name: organizationName },
          update: {},
          create: { name: organizationName }
        });

        // Vérifier si l'assignation existe déjà
        const existingAssignment = await tx.userOrganization.findUnique({
          where: {
            userId_organizationId: {
              userId,
              organizationId: organization.id
            }
          }
        });

        if (existingAssignment) {
          return false; // Déjà assigné
        }

        // Créer l'assignation
        await tx.userOrganization.create({
          data: {
            userId,
            organizationId: organization.id
          }
        });

        this.logger.debug(`✅ User ${userId} assigned to organization ${organizationName}`);
        return true;
      });
    } catch (error) {
      this.logger.error(`❌ Failed to assign user ${userId} to organization ${organizationName}:`, error);
      return false;
    }
  }

  // ============================================================================
  // GESTION DES ATTRIBUTS PERSONNALISÉS
  // ============================================================================

  async getUserAttributes(userId: string): Promise<Record<string, string>> {
    try {
      const attributes = await this.prisma.userAttribute.findMany({
        where: { userId }
      });

      const result: Record<string, string> = {};
      attributes.forEach(attr => {
        result[attr.attributeName] = attr.attributeValue;
      });

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to get attributes for user ${userId}:`, error);
      return {};
    }
  }

  async setUserAttribute(userId: string, name: string, value: string): Promise<boolean> {
    try {
      await this.prisma.userAttribute.upsert({
        where: {
          userId_attributeName: {
            userId,
            attributeName: name
          }
        },
        update: { attributeValue: value },
        create: {
          userId,
          attributeName: name,
          attributeValue: value
        }
      });

      this.logger.debug(`✅ Attribute ${name} set for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to set attribute ${name} for user ${userId}:`, error);
      return false;
    }
  }

  // ============================================================================
  // VALIDATION ET SÉCURITÉ
  // ============================================================================

  async isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
    try {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {})
        }
      });

      return !existingUser;
    } catch (error) {
      this.logger.error(`❌ Failed to check username availability: ${error.message}`);
      return false;
    }
  }

  async isEmailAvailable(email: string, excludeUserId?: string): Promise<boolean> {
    try {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {})
        }
      });

      return !existingUser;
    } catch (error) {
      this.logger.error(`❌ Failed to check email availability: ${error.message}`);
      return false;
    }
  }

  async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastLogin: new Date(),
          failedLoginAttempts: 0 // Reset sur connexion réussie
        }
      });
    } catch (error) {
      this.logger.error(`❌ Failed to update last login for user ${userId}:`, error);
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES UTILITAIRES
  // ============================================================================

  private async createUserAttributes(tx: any, userId: string, attributes: Record<string, any>): Promise<void> {
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) {
        await tx.userAttribute.create({
          data: {
            userId,
            attributeName: name,
            attributeValue: typeof value === 'string' ? value : JSON.stringify(value)
          }
        });
      }
    }
  }

  private mapToPostgresUserWithRoles(user: any): PostgresUserWithRoles {
    return {
      ...user,
      roles: user.roles?.map((ur: any) => ur.role.name) || [],
      organization_ids: user.organizations?.map((uo: any) => uo.organization.id) || [],
      custom_attributes: user.customAttributes || {}
    };
  }
}