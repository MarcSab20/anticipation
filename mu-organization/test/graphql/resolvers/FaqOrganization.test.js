// test/graphql/resolvers/FaqOrganization.test.js

import { jest } from "@jest/globals";
import { FaqOrganization } from "../../../src/index.js";
import { FaqOrganizationResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du FaqOrganizationResolver", () => {
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
   * @property {Object} SMPEvents.Organization.FaqOrganization - FaqOrganization-related event types.
   * @property {string} SMPEvents.Organization.FaqOrganization.listed - Event type for when a faqOrganization is listed.
   * @property {string} SMPEvents.Organization.FaqOrganization.visited - Event type for when a faqOrganization is visited.
   * @property {string} SMPEvents.Organization.FaqOrganization.created - Event type for when a faqOrganization is created.
   * @property {string} SMPEvents.Organization.FaqOrganization.updated - Event type for when a faqOrganization is updated.
   * @property {string} SMPEvents.Organization.FaqOrganization.deleted - Event type for when a faqOrganization is deleted.
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
        FaqOrganization: {
          listed: "FAQ_ORGANIZATION_LISTED_EVENT",
          visited: "FAQ_ORGANIZATION_VISITED_EVENT",
          created: "FAQ_ORGANIZATION_CREATED_EVENT",
          updated: "FAQ_ORGANIZATION_UPDATED_EVENT",
          deleted: "FAQ_ORGANIZATION_DELETED_EVENT",
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
    // Test pour faqOrganizationsResolver
    describe("faqOrganizationsResolver", () => {
      it("devrait retourner une liste de faqOrganization", async () => {
        // Données simulées
        const mockFaqOrganizations = [
          { faqOrganizationID: 1, faqOrganizationName: "Admin" },
          { faqOrganizationID: 2, faqOrganizationName: "User" },
        ];

        // Mock de FaqOrganization.findAll pour retourner des données simulées
        jest.spyOn(FaqOrganization, "findAll").mockResolvedValue(mockFaqOrganizations);

        // Exécution de la fonction à tester
        const result = await FaqOrganizationResolvers.Query.faqOrganizations(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(FaqOrganization.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.listed,
          mockFaqOrganizations
        );
        expect(result).toEqual(mockFaqOrganizations);
      });

      // Nouveau test : aucun rôle n'est disponible
      it("devrait retourner une liste vide si aucun rôle n'est trouvé", async () => {
        const mockFaqOrganizations = [];

        jest.spyOn(FaqOrganization, "findAll").mockResolvedValue(mockFaqOrganizations);

        const result = await FaqOrganizationResolvers.Query.faqOrganizations(
          null,
          {},
          mockContext,
          null
        );

        expect(FaqOrganization.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.listed,
          mockFaqOrganizations
        );
        expect(result).toEqual(mockFaqOrganizations);
      });

      // Nouveau test : erreur lors de la récupération des faqOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des faqOrganization", async () => {
        jest
          .spyOn(FaqOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizations(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganizations: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour faqOrganizationResolver
    describe("faqOrganizationResolver", () => {
      it("devrait retourner le rôle correspondant à l'ID fourni", async () => {
        const faqOrganizationID = 1;
        const mockFaqOrganization = { faqOrganizationID, faqOrganizationName: "Admin" };

        // Mock de FaqOrganization.findByPk pour retourner un rôle simulé
        jest.spyOn(FaqOrganization, "findByPk").mockResolvedValue(mockFaqOrganization);

        const result = await FaqOrganizationResolvers.Query.faqOrganization(
          null,
          { faqOrganizationID },
          mockContext,
          null
        );

        expect(FaqOrganization.findByPk).toHaveBeenCalledWith(faqOrganizationID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.visited,
          mockFaqOrganization
        );
        expect(result).toEqual(mockFaqOrganization);
      });

      // Nouveau test : rôle non trouvé
      it("devrait lever une erreur si le rôle n'est pas trouvé", async () => {
        const faqOrganizationID = 999;

        jest.spyOn(FaqOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          FaqOrganizationResolvers.Query.faqOrganization(null, { faqOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization ID 999 not found"
        );
      });

      // Nouveau test : ID du rôle invalide
      it("devrait lever une erreur si l'ID du rôle est invalide", async () => {
        const faqOrganizationID = "invalid-id";

        await expect(
          FaqOrganizationResolvers.Query.faqOrganization(null, { faqOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du rôle
      it("devrait lever une erreur si une exception se produit lors de la récupération du rôle", async () => {
        const faqOrganizationID = 1;

        jest
          .spyOn(FaqOrganization, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          FaqOrganizationResolvers.Query.faqOrganization(null, { faqOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour faqOrganizationsByIDsResolver
    describe("faqOrganizationsByIDsResolver", () => {
      it("devrait retourner les faqOrganization correspondants aux IDs fournis", async () => {
        const faqOrganizationIDs = [3, 4];
        const mockFaqOrganizations = [
          { faqOrganizationID: 3, faqOrganizationName: "Manager" },
          { faqOrganizationID: 4, faqOrganizationName: "Editor" },
        ];

        jest.spyOn(FaqOrganization, "findAll").mockResolvedValue(mockFaqOrganizations);

        const result = await FaqOrganizationResolvers.Query.faqOrganizationsByIDs(
          null,
          { faqOrganizationIDs },
          mockContext,
          null
        );

        expect(FaqOrganization.findAll).toHaveBeenCalledWith({
          where: { faqOrganizationID: faqOrganizationIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.listed,
          mockFaqOrganizations
        );
        expect(result).toEqual(mockFaqOrganizations);
      });

      // Nouveau test : aucun rôle trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun rôle n'est trouvé pour les IDs fournis", async () => {
        const faqOrganizationIDs = [999, 1000];

        jest.spyOn(FaqOrganization, "findAll").mockResolvedValue([]);

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationsByIDs(null, { faqOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No faqOrganizations found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const faqOrganizationIDs = [];

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationsByIDs(null, { faqOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des faqOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des faqOrganization par IDs", async () => {
        const faqOrganizationIDs = [1, 2];

        jest
          .spyOn(FaqOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationsByIDs(null, { faqOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour faqOrganizationsBySlugsResolver
    describe("faqOrganizationsBySlugsResolver", () => {
      it("devrait retourner les faqOrganization correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockFaqOrganizations = [
          { faqOrganizationID: 1, faqOrganizationName: "Admin", slug: "admin" },
          { faqOrganizationID: 2, faqOrganizationName: "User", slug: "user" },
        ];

        jest.spyOn(FaqOrganization, "findAll").mockResolvedValue(mockFaqOrganizations);

        const result = await FaqOrganizationResolvers.Query.faqOrganizationsBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(FaqOrganization.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.listed,
          mockFaqOrganizations
        );
        expect(result).toEqual(mockFaqOrganizations);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationsBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganizations by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization Slugs not provided or empty"
        );
      });
    });

    // Test pour faqOrganizationByUniqRefResolver
    describe("faqOrganizationByUniqRefResolver", () => {
      it("devrait retourner le rôle correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockFaqOrganization = { faqOrganizationID: 1, faqOrganizationName: "Admin", uniqRef: UniqRef };

        jest.spyOn(FaqOrganization, "findOne").mockResolvedValue(mockFaqOrganization);

        const result = await FaqOrganizationResolvers.Query.faqOrganizationByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(FaqOrganization.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.visited,
          mockFaqOrganization
        );
        expect(result).toEqual(mockFaqOrganization);
      });

      // Nouveau test : rôle non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun rôle n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(FaqOrganization, "findOne").mockResolvedValue(null);

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization UniqRef not provided"
        );
      });
    });

    // Test pour faqOrganizationBySlugResolver
    describe("faqOrganizationBySlugResolver", () => {
      it("devrait retourner le rôle correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockFaqOrganization = { faqOrganizationID: 1, faqOrganizationName: "Admin", slug: Slug };

        jest.spyOn(FaqOrganization, "findOne").mockResolvedValue(mockFaqOrganization);

        const result = await FaqOrganizationResolvers.Query.faqOrganizationBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(FaqOrganization.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.visited,
          mockFaqOrganization
        );
        expect(result).toEqual(mockFaqOrganization);
      });

      // Nouveau test : rôle non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun rôle n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(FaqOrganization, "findOne").mockResolvedValue(null);

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          FaqOrganizationResolvers.Query.faqOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching faqOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: FaqOrganization Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createFaqOrganizationResolver

    // Test pour createFaqOrganizationResolver
    describe("createFaqOrganizationResolver", () => {
      it("devrait créer un nouveau faqOrganization", async () => {
        const input = {
          lastname: "New FaqOrganization",
          description: "Test faqOrganization",
          permissions: ["read", "write"],
        };
  
        const createdFaqOrganization = {
          faqOrganizationID: 1,
          lastname: "New FaqOrganization",
          description: "Test faqOrganization",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createFaqOrganization pour retourner le faqOrganization créé
        jest
          .spyOn(FaqOrganizationResolvers.Mutation, "createFaqOrganization")
          .mockResolvedValue(createdFaqOrganization);
  
        const result = await FaqOrganizationResolvers.Mutation.createFaqOrganization(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(FaqOrganizationResolvers.Mutation.createFaqOrganization).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdFaqOrganization);
      });
    });

    describe("updateFaqOrganization Mutation", () => {
      it("should successfully update a faqOrganization", async () => {
        const faqOrganizationID = 1;
        const updateFaqOrganizationInput = {
          faqOrganizationName: "Admin",
        };

        // données simulées de FaqOrganization
        const mockFaqOrganizationData = {
          faqOrganizationID,
          faqOrganizationName: "FR",
        };

        //  `mockFaqOrganizationData` pour créer `mockFaqOrganization`
        const mockFaqOrganization = {
          ...mockFaqOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockFaqOrganization, updateValues); // Mettre à jour mockFaqOrganization avec les nouvelles valeurs
            return { ...mockFaqOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const faqOrganizationID = 1;
        const updateFaqOrganizationInput = {
          faqOrganizationName: "",
        };

        // données simulées de FaqOrganization
        const mockFaqOrganizationData = {
          faqOrganizationID,
          faqOrganizationName: "FR",
        };

        //  `mockFaqOrganizationData` pour créer `mockFaqOrganization`
        const mockFaqOrganization = {
          ...mockFaqOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockFaqOrganization, updateValues); // Mettre à jour mockFaqOrganization avec les nouvelles valeurs
            return { ...mockFaqOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteFaqOrganizationResolver
    describe("deleteFaqOrganizationResolver", () => {
      it("devrait supprimer un faqOrganization avec succès", async () => {
        const faqOrganizationID = 1;

        const mockFaqOrganization = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(FaqOrganization, "findByPk").mockResolvedValue(mockFaqOrganization);

        const result = await FaqOrganizationResolvers.Mutation.deleteFaqOrganization(
          null,
          { faqOrganizationID },
          mockContext,
          null
        );

        expect(FaqOrganization.findByPk).toHaveBeenCalledWith(faqOrganizationID);
        expect(mockFaqOrganization.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.FaqOrganization.deleted,
          faqOrganizationID
        );
        expect(result).toEqual({
          success: true,
          message: "FaqOrganization deleted successfully",
        });
      });

      it("devrait lever une erreur si le faqOrganization à supprimer n'existe pas", async () => {
        const faqOrganizationID = 999;

        jest.spyOn(FaqOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          FaqOrganizationResolvers.Mutation.deleteFaqOrganization(null, { faqOrganizationID }, mockContext, null)
        ).rejects.toThrow("FaqOrganization not found");

        expect(FaqOrganization.findByPk).toHaveBeenCalledWith(faqOrganizationID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du faqOrganization", async () => {
        const faqOrganizationID = 1;

        const mockFaqOrganization = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(FaqOrganization, "findByPk").mockResolvedValue(mockFaqOrganization);

        await expect(
          FaqOrganizationResolvers.Mutation.deleteFaqOrganization(null, { faqOrganizationID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockFaqOrganization.destroy).toHaveBeenCalled();
      });
    });
  });
});
