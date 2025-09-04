// test/graphql/resolvers/TagOrganization.test.js

import { jest } from "@jest/globals";
import { TagOrganization } from "../../../src/index.js";
import { TagOrganizationResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du TagOrganizationResolver", () => {
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
   * @property {Object} SMPEvents.Organization.TagOrganization - TagOrganization-related event types.
   * @property {string} SMPEvents.Organization.TagOrganization.listed - Event type for when a tagOrganization is listed.
   * @property {string} SMPEvents.Organization.TagOrganization.visited - Event type for when a tagOrganization is visited.
   * @property {string} SMPEvents.Organization.TagOrganization.created - Event type for when a tagOrganization is created.
   * @property {string} SMPEvents.Organization.TagOrganization.updated - Event type for when a tagOrganization is updated.
   * @property {string} SMPEvents.Organization.TagOrganization.deleted - Event type for when a tagOrganization is deleted.
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
        TagOrganization: {
          listed: "TAG_ORGANIZATION_LISTED_EVENT",
          visited: "TAG_ORGANIZATION_VISITED_EVENT",
          created: "TAG_ORGANIZATION_CREATED_EVENT",
          updated: "TAG_ORGANIZATION_UPDATED_EVENT",
          deleted: "TAG_ORGANIZATION_DELETED_EVENT",
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
    // Test pour tagOrganizationsResolver
    describe("tagOrganizationsResolver", () => {
      it("devrait retourner une liste de tagOrganization", async () => {
        // Données simulées
        const mockTagOrganizations = [
          { tagOrganizationID: 1, tagOrganizationName: "Admin" },
          { tagOrganizationID: 2, tagOrganizationName: "User" },
        ];

        // Mock de TagOrganization.findAll pour retourner des données simulées
        jest.spyOn(TagOrganization, "findAll").mockResolvedValue(mockTagOrganizations);

        // Exécution de la fonction à tester
        const result = await TagOrganizationResolvers.Query.tagOrganizations(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(TagOrganization.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.listed,
          mockTagOrganizations
        );
        expect(result).toEqual(mockTagOrganizations);
      });

      // Nouveau test : aucun tagOrganization n'est disponible
      it("devrait retourner une liste vide si aucun tagOrganization n'est trouvé", async () => {
        const mockTagOrganizations = [];

        jest.spyOn(TagOrganization, "findAll").mockResolvedValue(mockTagOrganizations);

        const result = await TagOrganizationResolvers.Query.tagOrganizations(
          null,
          {},
          mockContext,
          null
        );

        expect(TagOrganization.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.listed,
          mockTagOrganizations
        );
        expect(result).toEqual(mockTagOrganizations);
      });

      // Nouveau test : erreur lors de la récupération des tagOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des tagOrganization", async () => {
        jest
          .spyOn(TagOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          TagOrganizationResolvers.Query.tagOrganizations(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganizations: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour tagOrganizationResolver
    describe("tagOrganizationResolver", () => {
      it("devrait retourner le tagOrganization correspondant à l'ID fourni", async () => {
        const tagOrganizationID = 1;
        const mockTagOrganization = { tagOrganizationID, tagOrganizationName: "Admin" };

        // Mock de TagOrganization.findByPk pour retourner un tagOrganization simulé
        jest.spyOn(TagOrganization, "findByPk").mockResolvedValue(mockTagOrganization);

        const result = await TagOrganizationResolvers.Query.tagOrganization(
          null,
          { tagOrganizationID },
          mockContext,
          null
        );

        expect(TagOrganization.findByPk).toHaveBeenCalledWith(tagOrganizationID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.visited,
          mockTagOrganization
        );
        expect(result).toEqual(mockTagOrganization);
      });

      // Nouveau test : tagOrganization non trouvé
      it("devrait lever une erreur si le tagOrganization n'est pas trouvé", async () => {
        const tagOrganizationID = 999;

        jest.spyOn(TagOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          TagOrganizationResolvers.Query.tagOrganization(null, { tagOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization ID 999 not found"
        );
      });

      // Nouveau test : ID du tagOrganization invalide
      it("devrait lever une erreur si l'ID du tagOrganization est invalide", async () => {
        const tagOrganizationID = "invalid-id";

        await expect(
          TagOrganizationResolvers.Query.tagOrganization(null, { tagOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du tagOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération du tagOrganization", async () => {
        const tagOrganizationID = 1;

        jest
          .spyOn(TagOrganization, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          TagOrganizationResolvers.Query.tagOrganization(null, { tagOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour tagOrganizationsByIDsResolver
    describe("tagOrganizationsByIDsResolver", () => {
      it("devrait retourner les tagOrganization correspondants aux IDs fournis", async () => {
        const tagOrganizationIDs = [3, 4];
        const mockTagOrganizations = [
          { tagOrganizationID: 3, tagOrganizationName: "Manager" },
          { tagOrganizationID: 4, tagOrganizationName: "Editor" },
        ];

        jest.spyOn(TagOrganization, "findAll").mockResolvedValue(mockTagOrganizations);

        const result = await TagOrganizationResolvers.Query.tagOrganizationsByIDs(
          null,
          { tagOrganizationIDs },
          mockContext,
          null
        );

        expect(TagOrganization.findAll).toHaveBeenCalledWith({
          where: { tagOrganizationID: tagOrganizationIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.listed,
          mockTagOrganizations
        );
        expect(result).toEqual(mockTagOrganizations);
      });

      // Nouveau test : aucun tagOrganization trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun tagOrganization n'est trouvé pour les IDs fournis", async () => {
        const tagOrganizationIDs = [999, 1000];

        jest.spyOn(TagOrganization, "findAll").mockResolvedValue([]);

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationsByIDs(null, { tagOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No tagOrganizations found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const tagOrganizationIDs = [];

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationsByIDs(null, { tagOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des tagOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des tagOrganization par IDs", async () => {
        const tagOrganizationIDs = [1, 2];

        jest
          .spyOn(TagOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationsByIDs(null, { tagOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour tagOrganizationsBySlugsResolver
    describe("tagOrganizationsBySlugsResolver", () => {
      it("devrait retourner les tagOrganization correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockTagOrganizations = [
          { tagOrganizationID: 1, tagOrganizationName: "Admin", slug: "admin" },
          { tagOrganizationID: 2, tagOrganizationName: "User", slug: "user" },
        ];

        jest.spyOn(TagOrganization, "findAll").mockResolvedValue(mockTagOrganizations);

        const result = await TagOrganizationResolvers.Query.tagOrganizationsBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(TagOrganization.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.listed,
          mockTagOrganizations
        );
        expect(result).toEqual(mockTagOrganizations);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationsBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganizations by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization Slugs not provided or empty"
        );
      });
    });

    // Test pour tagOrganizationByUniqRefResolver
    describe("tagOrganizationByUniqRefResolver", () => {
      it("devrait retourner le tagOrganization correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockTagOrganization = { tagOrganizationID: 1, tagOrganizationName: "Admin", uniqRef: UniqRef };

        jest.spyOn(TagOrganization, "findOne").mockResolvedValue(mockTagOrganization);

        const result = await TagOrganizationResolvers.Query.tagOrganizationByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(TagOrganization.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.visited,
          mockTagOrganization
        );
        expect(result).toEqual(mockTagOrganization);
      });

      // Nouveau test : tagOrganization non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun tagOrganization n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(TagOrganization, "findOne").mockResolvedValue(null);

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization UniqRef not provided"
        );
      });
    });

    // Test pour tagOrganizationBySlugResolver
    describe("tagOrganizationBySlugResolver", () => {
      it("devrait retourner le tagOrganization correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockTagOrganization = { tagOrganizationID: 1, tagOrganizationName: "Admin", slug: Slug };

        jest.spyOn(TagOrganization, "findOne").mockResolvedValue(mockTagOrganization);

        const result = await TagOrganizationResolvers.Query.tagOrganizationBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(TagOrganization.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.visited,
          mockTagOrganization
        );
        expect(result).toEqual(mockTagOrganization);
      });

      // Nouveau test : tagOrganization non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun tagOrganization n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(TagOrganization, "findOne").mockResolvedValue(null);

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          TagOrganizationResolvers.Query.tagOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching tagOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: TagOrganization Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createTagOrganizationResolver

    // Test pour createTagOrganizationResolver
    describe("createTagOrganizationResolver", () => {
      it("devrait créer un nouveau tagOrganization", async () => {
        const input = {
          lastname: "New TagOrganization",
          description: "Test tagOrganization",
          permissions: ["read", "write"],
        };
  
        const createdTagOrganization = {
          tagOrganizationID: 1,
          lastname: "New TagOrganization",
          description: "Test tagOrganization",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createTagOrganization pour retourner le tagOrganization créé
        jest
          .spyOn(TagOrganizationResolvers.Mutation, "createTagOrganization")
          .mockResolvedValue(createdTagOrganization);
  
        const result = await TagOrganizationResolvers.Mutation.createTagOrganization(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(TagOrganizationResolvers.Mutation.createTagOrganization).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdTagOrganization);
      });
    });

    describe("updateTagOrganization Mutation", () => {
      it("should successfully update a tagOrganization", async () => {
        const tagOrganizationID = 1;
        const updateTagOrganizationInput = {
          tagOrganizationName: "Admin",
        };

        // données simulées de TagOrganization
        const mockTagOrganizationData = {
          tagOrganizationID,
          tagOrganizationName: "FR",
        };

        //  `mockTagOrganizationData` pour créer `mockTagOrganization`
        const mockTagOrganization = {
          ...mockTagOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockTagOrganization, updateValues); // Mettre à jour mockTagOrganization avec les nouvelles valeurs
            return { ...mockTagOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const tagOrganizationID = 1;
        const updateTagOrganizationInput = {
          tagOrganizationName: "",
        };

        // données simulées de TagOrganization
        const mockTagOrganizationData = {
          tagOrganizationID,
          tagOrganizationName: "FR",
        };

        //  `mockTagOrganizationData` pour créer `mockTagOrganization`
        const mockTagOrganization = {
          ...mockTagOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockTagOrganization, updateValues); // Mettre à jour mockTagOrganization avec les nouvelles valeurs
            return { ...mockTagOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteTagOrganizationResolver
    describe("deleteTagOrganizationResolver", () => {
      it("devrait supprimer un tagOrganization avec succès", async () => {
        const tagOrganizationID = 1;

        const mockTagOrganization = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(TagOrganization, "findByPk").mockResolvedValue(mockTagOrganization);

        const result = await TagOrganizationResolvers.Mutation.deleteTagOrganization(
          null,
          { tagOrganizationID },
          mockContext,
          null
        );

        expect(TagOrganization.findByPk).toHaveBeenCalledWith(tagOrganizationID);
        expect(mockTagOrganization.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.TagOrganization.deleted,
          tagOrganizationID
        );
        expect(result).toEqual({
          success: true,
          message: "TagOrganization deleted successfully",
        });
      });

      it("devrait lever une erreur si le tagOrganization à supprimer n'existe pas", async () => {
        const tagOrganizationID = 999;

        jest.spyOn(TagOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          TagOrganizationResolvers.Mutation.deleteTagOrganization(null, { tagOrganizationID }, mockContext, null)
        ).rejects.toThrow("TagOrganization not found");

        expect(TagOrganization.findByPk).toHaveBeenCalledWith(tagOrganizationID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du tagOrganization", async () => {
        const tagOrganizationID = 1;

        const mockTagOrganization = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(TagOrganization, "findByPk").mockResolvedValue(mockTagOrganization);

        await expect(
          TagOrganizationResolvers.Mutation.deleteTagOrganization(null, { tagOrganizationID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockTagOrganization.destroy).toHaveBeenCalled();
      });
    });
  });
});


