// test/graphql/resolvers/Organization.test.js

import { jest } from "@jest/globals";
import { Organization } from "../../../src/index.js";
import { OrganizationResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du OrganizationResolver", () => {
  // Contexte mock pour les tests
  /**
   * Mock context object used for testing GraphQL resolvers.
   *
   * @property {Object} config - Configuration settings.
   * @property {number} config.sensitiveCachedDataDuration - Duration for caching sensitive data in seconds.
   *
   * @property {Object} event - Event handling object.
   * @property {Function} event.publish - Mock function to publish events.
   *
   * @property {Object} SMPEvents - Object containing event types for Organization.
   * @property {Object} SMPEvents.Organization - Organization event types.
   * @property {Object} SMPEvents.Organization.Organization - Organization-related event types.
   * @property {string} SMPEvents.Organization.Organization.listed - Event type for when a organization is listed.
   * @property {string} SMPEvents.Organization.Organization.visited - Event type for when a organization is visited.
   * @property {string} SMPEvents.Organization.Organization.created - Event type for when a organization is created.
   * @property {string} SMPEvents.Organization.Organization.updated - Event type for when a organization is updated.
   * @property {string} SMPEvents.Organization.Organization.deleted - Event type for when a organization is deleted.
   *
   * @property {Object} logger - Logger object for logging messages.
   * @property {Function} logger.error - Mock function to log error messages.
   * @property {Function} logger.info - Mock function to log informational messages.
   * @property {Function} logger.debug - Mock function to log debug messages.
   */
  const mockContext = {
    config: {
      sensitiveCachedDataDuration: 3600,
    },
    event: {
      publish: jest.fn(),
    },
    SMPEvents: {
      Organization: {
        Organization: {
          listed: "ORGANIZATION_LISTED_EVENT",
          visited: "ORGANIZATION_VISITED_EVENT",
          created: "ORGANIZATION_CREATED_EVENT",
          updated: "ORGANIZATION_UPDATED_EVENT",
          deleted: "ORGANIZATION_DELETED_EVENT",
        },
      },
    },
    logger: {
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------- Tests des QUERIES ------------------------------------------------------------
  describe("Requêtes (Queries)", () => {
    // Test pour organizationsResolver
    describe("organizationsResolver", () => {
      it("devrait retourner une liste de organization", async () => {
        // Données simulées
        const mockOrganizations = [
          { organizationID: 1, organizationName: "Admin" },
          { organizationID: 2, organizationName: "User" },
        ];

        // Mock de Organization.findAll pour retourner des données simulées
        jest.spyOn(Organization, "findAll").mockResolvedValue(mockOrganizations);

        // Exécution de la fonction à tester
        const result = await OrganizationResolvers.Query.organizations(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(Organization.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.listed,
          mockOrganizations
        );
        expect(result).toEqual(mockOrganizations);
      });

      // Nouveau test : aucun organization n'est disponible
      it("devrait retourner une liste vide si aucun organization n'est trouvé", async () => {
        const mockOrganizations = [];

        jest.spyOn(Organization, "findAll").mockResolvedValue(mockOrganizations);

        const result = await OrganizationResolvers.Query.organizations(
          null,
          {},
          mockContext,
          null
        );

        expect(Organization.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.listed,
          mockOrganizations
        );
        expect(result).toEqual(mockOrganizations);
      });

      // Nouveau test : erreur lors de la récupération des organization
      it("devrait lever une erreur si une exception se produit lors de la récupération des organization", async () => {
        jest
          .spyOn(Organization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          OrganizationResolvers.Query.organizations(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizations: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour organizationResolver
    describe("organizationResolver", () => {
      it("devrait retourner le organization correspondant à l'ID fourni", async () => {
        const organizationID = 1;
        const mockOrganization = { organizationID, organizationName: "Admin" };

        // Mock de Organization.findByPk pour retourner un organization simulé
        jest.spyOn(Organization, "findByPk").mockResolvedValue(mockOrganization);

        const result = await OrganizationResolvers.Query.organization(
          null,
          { organizationID },
          mockContext,
          null
        );

        expect(Organization.findByPk).toHaveBeenCalledWith(organizationID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.visited,
          mockOrganization
        );
        expect(result).toEqual(mockOrganization);
      });

      // Nouveau test : organization non trouvé
      it("devrait lever une erreur si le organization n'est pas trouvé", async () => {
        const organizationID = 999;

        jest.spyOn(Organization, "findByPk").mockResolvedValue(null);

        await expect(
          OrganizationResolvers.Query.organization(null, { organizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization ID 999 not found"
        );
      });

      // Nouveau test : ID du organization invalide
      it("devrait lever une erreur si l'ID du organization est invalide", async () => {
        const organizationID = "invalid-id";

        await expect(
          OrganizationResolvers.Query.organization(null, { organizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du organization
      it("devrait lever une erreur si une exception se produit lors de la récupération du organization", async () => {
        const organizationID = 1;

        jest
          .spyOn(Organization, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          OrganizationResolvers.Query.organization(null, { organizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour organizationsByIDsResolver
    describe("organizationsByIDsResolver", () => {
      it("devrait retourner les organization correspondants aux IDs fournis", async () => {
        const organizationIDs = [3, 4];
        const mockOrganizations = [
          { organizationID: 3, organizationName: "Manager" },
          { organizationID: 4, organizationName: "Editor" },
        ];

        jest.spyOn(Organization, "findAll").mockResolvedValue(mockOrganizations);

        const result = await OrganizationResolvers.Query.organizationsByIDs(
          null,
          { organizationIDs },
          mockContext,
          null
        );

        expect(Organization.findAll).toHaveBeenCalledWith({
          where: { organizationID: organizationIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.listed,
          mockOrganizations
        );
        expect(result).toEqual(mockOrganizations);
      });

      // Nouveau test : aucun organization trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun organization n'est trouvé pour les IDs fournis", async () => {
        const organizationIDs = [999, 1000];

        jest.spyOn(Organization, "findAll").mockResolvedValue([]);

        await expect(
          OrganizationResolvers.Query.organizationsByIDs(null, { organizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No organizations found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const organizationIDs = [];

        await expect(
          OrganizationResolvers.Query.organizationsByIDs(null, { organizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des organization
      it("devrait lever une erreur si une exception se produit lors de la récupération des organization par IDs", async () => {
        const organizationIDs = [1, 2];

        jest
          .spyOn(Organization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          OrganizationResolvers.Query.organizationsByIDs(null, { organizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour organizationsBySlugsResolver
    describe("organizationsBySlugsResolver", () => {
      it("devrait retourner les organization correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockOrganizations = [
          { organizationID: 1, organizationName: "Admin", slug: "admin" },
          { organizationID: 2, organizationName: "User", slug: "user" },
        ];

        jest.spyOn(Organization, "findAll").mockResolvedValue(mockOrganizations);

        const result = await OrganizationResolvers.Query.organizationsBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(Organization.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.listed,
          mockOrganizations
        );
        expect(result).toEqual(mockOrganizations);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          OrganizationResolvers.Query.organizationsBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizations by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization Slugs not provided or empty"
        );
      });
    });

    // Test pour organizationByUniqRefResolver
    describe("organizationByUniqRefResolver", () => {
      it("devrait retourner le organization correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockOrganization = { organizationID: 1, organizationName: "Admin", uniqRef: UniqRef };

        jest.spyOn(Organization, "findOne").mockResolvedValue(mockOrganization);

        const result = await OrganizationResolvers.Query.organizationByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(Organization.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.visited,
          mockOrganization
        );
        expect(result).toEqual(mockOrganization);
      });

      // Nouveau test : organization non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun organization n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(Organization, "findOne").mockResolvedValue(null);

        await expect(
          OrganizationResolvers.Query.organizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching organization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          OrganizationResolvers.Query.organizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching organization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization UniqRef not provided"
        );
      });
    });

    // Test pour organizationBySlugResolver
    describe("organizationBySlugResolver", () => {
      it("devrait retourner le organization correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockOrganization = { organizationID: 1, organizationName: "Admin", slug: Slug };

        jest.spyOn(Organization, "findOne").mockResolvedValue(mockOrganization);

        const result = await OrganizationResolvers.Query.organizationBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(Organization.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.visited,
          mockOrganization
        );
        expect(result).toEqual(mockOrganization);
      });

      // Nouveau test : organization non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun organization n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(Organization, "findOne").mockResolvedValue(null);

        await expect(
          OrganizationResolvers.Query.organizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          OrganizationResolvers.Query.organizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Organization Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createOrganizationResolver

    // Test pour createOrganizationResolver
    describe("createOrganizationResolver", () => {
      it("devrait créer un nouveau organization", async () => {
        const input = {
          lastname: "New Organization",
          description: "Test organization",
          permissions: ["read", "write"],
        };
  
        const createdOrganization = {
          organizationID: 1,
          lastname: "New Organization",
          description: "Test organization",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createOrganization pour retourner le organization créé
        jest
          .spyOn(OrganizationResolvers.Mutation, "createOrganization")
          .mockResolvedValue(createdOrganization);
  
        const result = await OrganizationResolvers.Mutation.createOrganization(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(OrganizationResolvers.Mutation.createOrganization).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdOrganization);
      });
    });

    describe("updateOrganization Mutation", () => {
      it("should successfully update a organization", async () => {
        const organizationID = 1;
        const updateOrganizationInput = {
          organizationName: "Admin",
        };

        // données simulées de Organization
        const mockOrganizationData = {
          organizationID,
          organizationName: "FR",
        };

        //  `mockOrganizationData` pour créer `mockOrganization`
        const mockOrganization = {
          ...mockOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockOrganization, updateValues); // Mettre à jour mockOrganization avec les nouvelles valeurs
            return { ...mockOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const organizationID = 1;
        const updateOrganizationInput = {
          organizationName: "",
        };

        // données simulées de Organization
        const mockOrganizationData = {
          organizationID,
          organizationName: "FR",
        };

        //  `mockOrganizationData` pour créer `mockOrganization`
        const mockOrganization = {
          ...mockOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockOrganization, updateValues); // Mettre à jour mockOrganization avec les nouvelles valeurs
            return { ...mockOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteOrganizationResolver
    describe("deleteOrganizationResolver", () => {
      it("devrait supprimer un organization avec succès", async () => {
        const organizationID = 1;

        const mockOrganization = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(Organization, "findByPk").mockResolvedValue(mockOrganization);

        const result = await OrganizationResolvers.Mutation.deleteOrganization(
          null,
          { organizationID },
          mockContext,
          null
        );

        expect(Organization.findByPk).toHaveBeenCalledWith(organizationID);
        expect(mockOrganization.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Organization.deleted,
          organizationID
        );
        expect(result).toEqual({
          success: true,
          message: "Organization deleted successfully",
        });
      });

      it("devrait lever une erreur si le organization à supprimer n'existe pas", async () => {
        const organizationID = 999;

        jest.spyOn(Organization, "findByPk").mockResolvedValue(null);

        await expect(
          OrganizationResolvers.Mutation.deleteOrganization(null, { organizationID }, mockContext, null)
        ).rejects.toThrow("Organization not found");

        expect(Organization.findByPk).toHaveBeenCalledWith(organizationID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du organization", async () => {
        const organizationID = 1;

        const mockOrganization = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(Organization, "findByPk").mockResolvedValue(mockOrganization);

        await expect(
          OrganizationResolvers.Mutation.deleteOrganization(null, { organizationID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockOrganization.destroy).toHaveBeenCalled();
      });
    });
  });
});


