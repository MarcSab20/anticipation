// test/graphql/resolvers/TopicOrganization.test.js

import { jest } from "@jest/globals";
import { TopicOrganization } from "../../../src/index.js";
import { TopicOrganizationResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du TopicOrganizationResolver", () => {
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
   * @property {Object} SMPEvents.Organization.TopicOrganization - TopicOrganization-related event types.
   * @property {string} SMPEvents.Organization.TopicOrganization.listed - Event type for when a topicOrganization is listed.
   * @property {string} SMPEvents.Organization.TopicOrganization.visited - Event type for when a topicOrganization is visited.
   * @property {string} SMPEvents.Organization.TopicOrganization.created - Event type for when a topicOrganization is created.
   * @property {string} SMPEvents.Organization.TopicOrganization.updated - Event type for when a topicOrganization is updated.
   * @property {string} SMPEvents.Organization.TopicOrganization.deleted - Event type for when a topicOrganization is deleted.
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
        TopicOrganization: {
          listed: "TOPIC_ORGANIZATION_LISTED_EVENT",
          visited: "TOPIC_ORGANIZATION_VISITED_EVENT",
          created: "TOPIC_ORGANIZATION_CREATED_EVENT",
          updated: "TOPIC_ORGANIZATION_UPDATED_EVENT",
          deleted: "TOPIC_ORGANIZATION_DELETED_EVENT",
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
    // Test pour topicOrganizationsResolver
    describe("topicOrganizationsResolver", () => {
      it("devrait retourner une liste de topicOrganization", async () => {
        // Données simulées
        const mockTopicOrganizations = [
          { topicOrganizationID: 1, topicOrganizationName: "Admin" },
          { topicOrganizationID: 2, topicOrganizationName: "User" },
        ];

        // Mock de TopicOrganization.findAll pour retourner des données simulées
        jest.spyOn(TopicOrganization, "findAll").mockResolvedValue(mockTopicOrganizations);

        // Exécution de la fonction à tester
        const result = await TopicOrganizationResolvers.Query.topicOrganizations(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(TopicOrganization.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.listed,
          mockTopicOrganizations
        );
        expect(result).toEqual(mockTopicOrganizations);
      });

      // Nouveau test : aucun rôle n'est disponible
      it("devrait retourner une liste vide si aucun rôle n'est trouvé", async () => {
        const mockTopicOrganizations = [];

        jest.spyOn(TopicOrganization, "findAll").mockResolvedValue(mockTopicOrganizations);

        const result = await TopicOrganizationResolvers.Query.topicOrganizations(
          null,
          {},
          mockContext,
          null
        );

        expect(TopicOrganization.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.listed,
          mockTopicOrganizations
        );
        expect(result).toEqual(mockTopicOrganizations);
      });

      // Nouveau test : erreur lors de la récupération des topicOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des topicOrganization", async () => {
        jest
          .spyOn(TopicOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizations(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganizations: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour topicOrganizationResolver
    describe("topicOrganizationResolver", () => {
      it("devrait retourner le rôle correspondant à l'ID fourni", async () => {
        const topicOrganizationID = 1;
        const mockTopicOrganization = { topicOrganizationID, topicOrganizationName: "Admin" };

        // Mock de TopicOrganization.findByPk pour retourner un rôle simulé
        jest.spyOn(TopicOrganization, "findByPk").mockResolvedValue(mockTopicOrganization);

        const result = await TopicOrganizationResolvers.Query.topicOrganization(
          null,
          { topicOrganizationID },
          mockContext,
          null
        );

        expect(TopicOrganization.findByPk).toHaveBeenCalledWith(topicOrganizationID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.visited,
          mockTopicOrganization
        );
        expect(result).toEqual(mockTopicOrganization);
      });

      // Nouveau test : rôle non trouvé
      it("devrait lever une erreur si le rôle n'est pas trouvé", async () => {
        const topicOrganizationID = 999;

        jest.spyOn(TopicOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          TopicOrganizationResolvers.Query.topicOrganization(null, { topicOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization ID 999 not found"
        );
      });

      // Nouveau test : ID du rôle invalide
      it("devrait lever une erreur si l'ID du rôle est invalide", async () => {
        const topicOrganizationID = "invalid-id";

        await expect(
          TopicOrganizationResolvers.Query.topicOrganization(null, { topicOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du rôle
      it("devrait lever une erreur si une exception se produit lors de la récupération du rôle", async () => {
        const topicOrganizationID = 1;

        jest
          .spyOn(TopicOrganization, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          TopicOrganizationResolvers.Query.topicOrganization(null, { topicOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour topicOrganizationsByIDsResolver
    describe("topicOrganizationsByIDsResolver", () => {
      it("devrait retourner les topicOrganization correspondants aux IDs fournis", async () => {
        const topicOrganizationIDs = [3, 4];
        const mockTopicOrganizations = [
          { topicOrganizationID: 3, topicOrganizationName: "Manager" },
          { topicOrganizationID: 4, topicOrganizationName: "Editor" },
        ];

        jest.spyOn(TopicOrganization, "findAll").mockResolvedValue(mockTopicOrganizations);

        const result = await TopicOrganizationResolvers.Query.topicOrganizationsByIDs(
          null,
          { topicOrganizationIDs },
          mockContext,
          null
        );

        expect(TopicOrganization.findAll).toHaveBeenCalledWith({
          where: { topicOrganizationID: topicOrganizationIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.listed,
          mockTopicOrganizations
        );
        expect(result).toEqual(mockTopicOrganizations);
      });

      // Nouveau test : aucun rôle trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun rôle n'est trouvé pour les IDs fournis", async () => {
        const topicOrganizationIDs = [999, 1000];

        jest.spyOn(TopicOrganization, "findAll").mockResolvedValue([]);

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationsByIDs(null, { topicOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No topicOrganizations found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const topicOrganizationIDs = [];

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationsByIDs(null, { topicOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des topicOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des topicOrganization par IDs", async () => {
        const topicOrganizationIDs = [1, 2];

        jest
          .spyOn(TopicOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationsByIDs(null, { topicOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour topicOrganizationsBySlugsResolver
    describe("topicOrganizationsBySlugsResolver", () => {
      it("devrait retourner les topicOrganization correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockTopicOrganizations = [
          { topicOrganizationID: 1, topicOrganizationName: "Admin", slug: "admin" },
          { topicOrganizationID: 2, topicOrganizationName: "User", slug: "user" },
        ];

        jest.spyOn(TopicOrganization, "findAll").mockResolvedValue(mockTopicOrganizations);

        const result = await TopicOrganizationResolvers.Query.topicOrganizationsBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(TopicOrganization.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.listed,
          mockTopicOrganizations
        );
        expect(result).toEqual(mockTopicOrganizations);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationsBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganizations by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization Slugs not provided or empty"
        );
      });
    });

    // Test pour topicOrganizationByUniqRefResolver
    describe("topicOrganizationByUniqRefResolver", () => {
      it("devrait retourner le rôle correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockTopicOrganization = { topicOrganizationID: 1, topicOrganizationName: "Admin", uniqRef: UniqRef };

        jest.spyOn(TopicOrganization, "findOne").mockResolvedValue(mockTopicOrganization);

        const result = await TopicOrganizationResolvers.Query.topicOrganizationByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(TopicOrganization.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.visited,
          mockTopicOrganization
        );
        expect(result).toEqual(mockTopicOrganization);
      });

      // Nouveau test : rôle non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun rôle n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(TopicOrganization, "findOne").mockResolvedValue(null);

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization UniqRef not provided"
        );
      });
    });

    // Test pour topicOrganizationBySlugResolver
    describe("topicOrganizationBySlugResolver", () => {
      it("devrait retourner le rôle correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockTopicOrganization = { topicOrganizationID: 1, topicOrganizationName: "Admin", slug: Slug };

        jest.spyOn(TopicOrganization, "findOne").mockResolvedValue(mockTopicOrganization);

        const result = await TopicOrganizationResolvers.Query.topicOrganizationBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(TopicOrganization.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.visited,
          mockTopicOrganization
        );
        expect(result).toEqual(mockTopicOrganization);
      });

      // Nouveau test : rôle non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun rôle n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(TopicOrganization, "findOne").mockResolvedValue(null);

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          TopicOrganizationResolvers.Query.topicOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching topicOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TopicOrganization Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createTopicOrganizationResolver

    // Test pour createTopicOrganizationResolver
    describe("createTopicOrganizationResolver", () => {
      it("devrait créer un nouveau topicOrganization", async () => {
        const input = {
          lastname: "New TopicOrganization",
          description: "Test topicOrganization",
          permissions: ["read", "write"],
        };
  
        const createdTopicOrganization = {
          topicOrganizationID: 1,
          lastname: "New TopicOrganization",
          description: "Test topicOrganization",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createTopicOrganization pour retourner le topicOrganization créé
        jest
          .spyOn(TopicOrganizationResolvers.Mutation, "createTopicOrganization")
          .mockResolvedValue(createdTopicOrganization);
  
        const result = await TopicOrganizationResolvers.Mutation.createTopicOrganization(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(TopicOrganizationResolvers.Mutation.createTopicOrganization).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdTopicOrganization);
      });
    });

    describe("updateTopicOrganization Mutation", () => {
      it("should successfully update a topicOrganization", async () => {
        const topicOrganizationID = 1;
        const updateTopicOrganizationInput = {
          topicOrganizationName: "Admin",
        };

        // données simulées de TopicOrganization
        const mockTopicOrganizationData = {
          topicOrganizationID,
          topicOrganizationName: "FR",
        };

        //  `mockTopicOrganizationData` pour créer `mockTopicOrganization`
        const mockTopicOrganization = {
          ...mockTopicOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockTopicOrganization, updateValues); // Mettre à jour mockTopicOrganization avec les nouvelles valeurs
            return { ...mockTopicOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const topicOrganizationID = 1;
        const updateTopicOrganizationInput = {
          topicOrganizationName: "",
        };

        // données simulées de TopicOrganization
        const mockTopicOrganizationData = {
          topicOrganizationID,
          topicOrganizationName: "FR",
        };

        //  `mockTopicOrganizationData` pour créer `mockTopicOrganization`
        const mockTopicOrganization = {
          ...mockTopicOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockTopicOrganization, updateValues); // Mettre à jour mockTopicOrganization avec les nouvelles valeurs
            return { ...mockTopicOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteTopicOrganizationResolver
    describe("deleteTopicOrganizationResolver", () => {
      it("devrait supprimer un topicOrganization avec succès", async () => {
        const topicOrganizationID = 1;

        const mockTopicOrganization = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(TopicOrganization, "findByPk").mockResolvedValue(mockTopicOrganization);

        const result = await TopicOrganizationResolvers.Mutation.deleteTopicOrganization(
          null,
          { topicOrganizationID },
          mockContext,
          null
        );

        expect(TopicOrganization.findByPk).toHaveBeenCalledWith(topicOrganizationID);
        expect(mockTopicOrganization.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TopicOrganization.deleted,
          topicOrganizationID
        );
        expect(result).toEqual({
          success: true,
          message: "TopicOrganization deleted successfully",
        });
      });

      it("devrait lever une erreur si le topicOrganization à supprimer n'existe pas", async () => {
        const topicOrganizationID = 999;

        jest.spyOn(TopicOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          TopicOrganizationResolvers.Mutation.deleteTopicOrganization(null, { topicOrganizationID }, mockContext, null)
        ).rejects.toThrow("TopicOrganization not found");

        expect(TopicOrganization.findByPk).toHaveBeenCalledWith(topicOrganizationID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du topicOrganization", async () => {
        const topicOrganizationID = 1;

        const mockTopicOrganization = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(TopicOrganization, "findByPk").mockResolvedValue(mockTopicOrganization);

        await expect(
          TopicOrganizationResolvers.Mutation.deleteTopicOrganization(null, { topicOrganizationID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockTopicOrganization.destroy).toHaveBeenCalled();
      });
    });
  });
});


