// test/graphql/resolvers/OrganizationMedia.test.js

import { jest } from "@jest/globals";
import { OrganizationMedia } from "../../../src/index.js";
import { OrganizationMediaResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du OrganizationMediaResolver", () => {
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
   * @property {Object} SMPEvents.Organization.OrganizationMedia - OrganizationMedia-related event types.
   * @property {string} SMPEvents.Organization.OrganizationMedia.listed - Event type for when a organizationMedia is listed.
   * @property {string} SMPEvents.Organization.OrganizationMedia.visited - Event type for when a organizationMedia is visited.
   * @property {string} SMPEvents.Organization.OrganizationMedia.created - Event type for when a organizationMedia is created.
   * @property {string} SMPEvents.Organization.OrganizationMedia.updated - Event type for when a organizationMedia is updated.
   * @property {string} SMPEvents.Organization.OrganizationMedia.deleted - Event type for when a organizationMedia is deleted.
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
        OrganizationMedia: {
          listed: "ORGANIZATION_MEDIA_LISTED_EVENT",
          visited: "ORGANIZATION_MEDIA_VISITED_EVENT",
          created: "ORGANIZATION_MEDIA_CREATED_EVENT",
          updated: "ORGANIZATION_MEDIA_UPDATED_EVENT",
          deleted: "ORGANIZATION_MEDIA_DELETED_EVENT",
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
    // Test pour organizationMediasResolver
    describe("organizationMediasResolver", () => {
      it("devrait retourner une liste de organizationMedia", async () => {
        // Données simulées
        const mockOrganizationMedias = [
          { organizationMediaID: 1, organizationMediaName: "Admin" },
          { organizationMediaID: 2, organizationMediaName: "User" },
        ];

        // Mock de OrganizationMedia.findAll pour retourner des données simulées
        jest.spyOn(OrganizationMedia, "findAll").mockResolvedValue(mockOrganizationMedias);

        // Exécution de la fonction à tester
        const result = await OrganizationMediaResolvers.Query.organizationMedias(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(OrganizationMedia.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.listed,
          mockOrganizationMedias
        );
        expect(result).toEqual(mockOrganizationMedias);
      });

      // Nouveau test : aucun organization n'est disponible
      it("devrait retourner une liste vide si aucun organization n'est trouvé", async () => {
        const mockOrganizationMedias = [];

        jest.spyOn(OrganizationMedia, "findAll").mockResolvedValue(mockOrganizationMedias);

        const result = await OrganizationMediaResolvers.Query.organizationMedias(
          null,
          {},
          mockContext,
          null
        );

        expect(OrganizationMedia.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.listed,
          mockOrganizationMedias
        );
        expect(result).toEqual(mockOrganizationMedias);
      });

      // Nouveau test : erreur lors de la récupération des organizationMedia
      it("devrait lever une erreur si une exception se produit lors de la récupération des organizationMedia", async () => {
        jest
          .spyOn(OrganizationMedia, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          OrganizationMediaResolvers.Query.organizationMedias(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedias: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour organizationMediaResolver
    describe("organizationMediaResolver", () => {
      it("devrait retourner le organization correspondant à l'ID fourni", async () => {
        const organizationMediaID = 1;
        const mockOrganizationMedia = { organizationMediaID, organizationMediaName: "Admin" };

        // Mock de OrganizationMedia.findByPk pour retourner un organization simulé
        jest.spyOn(OrganizationMedia, "findByPk").mockResolvedValue(mockOrganizationMedia);

        const result = await OrganizationMediaResolvers.Query.organizationMedia(
          null,
          { organizationMediaID },
          mockContext,
          null
        );

        expect(OrganizationMedia.findByPk).toHaveBeenCalledWith(organizationMediaID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.visited,
          mockOrganizationMedia
        );
        expect(result).toEqual(mockOrganizationMedia);
      });

      // Nouveau test : organization non trouvé
      it("devrait lever une erreur si le organization n'est pas trouvé", async () => {
        const organizationMediaID = 999;

        jest.spyOn(OrganizationMedia, "findByPk").mockResolvedValue(null);

        await expect(
          OrganizationMediaResolvers.Query.organizationMedia(null, { organizationMediaID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia ID 999 not found"
        );
      });

      // Nouveau test : ID du organization invalide
      it("devrait lever une erreur si l'ID du organization est invalide", async () => {
        const organizationMediaID = "invalid-id";

        await expect(
          OrganizationMediaResolvers.Query.organizationMedia(null, { organizationMediaID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du organization
      it("devrait lever une erreur si une exception se produit lors de la récupération du organization", async () => {
        const organizationMediaID = 1;

        jest
          .spyOn(OrganizationMedia, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          OrganizationMediaResolvers.Query.organizationMedia(null, { organizationMediaID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour organizationMediasByIDsResolver
    describe("organizationMediasByIDsResolver", () => {
      it("devrait retourner les organizationMedia correspondants aux IDs fournis", async () => {
        const organizationMediaIDs = [3, 4];
        const mockOrganizationMedias = [
          { organizationMediaID: 3, organizationMediaName: "Manager" },
          { organizationMediaID: 4, organizationMediaName: "Editor" },
        ];

        jest.spyOn(OrganizationMedia, "findAll").mockResolvedValue(mockOrganizationMedias);

        const result = await OrganizationMediaResolvers.Query.organizationMediasByIDs(
          null,
          { organizationMediaIDs },
          mockContext,
          null
        );

        expect(OrganizationMedia.findAll).toHaveBeenCalledWith({
          where: { organizationMediaID: organizationMediaIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.listed,
          mockOrganizationMedias
        );
        expect(result).toEqual(mockOrganizationMedias);
      });

      // Nouveau test : aucun organization trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun organization n'est trouvé pour les IDs fournis", async () => {
        const organizationMediaIDs = [999, 1000];

        jest.spyOn(OrganizationMedia, "findAll").mockResolvedValue([]);

        await expect(
          OrganizationMediaResolvers.Query.organizationMediasByIDs(null, { organizationMediaIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedias by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No organizationMedias found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const organizationMediaIDs = [];

        await expect(
          OrganizationMediaResolvers.Query.organizationMediasByIDs(null, { organizationMediaIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedias by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des organizationMedia
      it("devrait lever une erreur si une exception se produit lors de la récupération des organizationMedia par IDs", async () => {
        const organizationMediaIDs = [1, 2];

        jest
          .spyOn(OrganizationMedia, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          OrganizationMediaResolvers.Query.organizationMediasByIDs(null, { organizationMediaIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedias by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour organizationMediasBySlugsResolver
    describe("organizationMediasBySlugsResolver", () => {
      it("devrait retourner les organizationMedia correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockOrganizationMedias = [
          { organizationMediaID: 1, organizationMediaName: "Admin", slug: "admin" },
          { organizationMediaID: 2, organizationMediaName: "User", slug: "user" },
        ];

        jest.spyOn(OrganizationMedia, "findAll").mockResolvedValue(mockOrganizationMedias);

        const result = await OrganizationMediaResolvers.Query.organizationMediasBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(OrganizationMedia.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.listed,
          mockOrganizationMedias
        );
        expect(result).toEqual(mockOrganizationMedias);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          OrganizationMediaResolvers.Query.organizationMediasBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedias by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia Slugs not provided or empty"
        );
      });
    });

    // Test pour organizationMediaByUniqRefResolver
    describe("organizationMediaByUniqRefResolver", () => {
      it("devrait retourner le organization correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockOrganizationMedia = { organizationMediaID: 1, organizationMediaName: "Admin", uniqRef: UniqRef };

        jest.spyOn(OrganizationMedia, "findOne").mockResolvedValue(mockOrganizationMedia);

        const result = await OrganizationMediaResolvers.Query.organizationMediaByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(OrganizationMedia.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.visited,
          mockOrganizationMedia
        );
        expect(result).toEqual(mockOrganizationMedia);
      });

      // Nouveau test : organization non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun organization n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(OrganizationMedia, "findOne").mockResolvedValue(null);

        await expect(
          OrganizationMediaResolvers.Query.organizationMediaByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          OrganizationMediaResolvers.Query.organizationMediaByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia UniqRef not provided"
        );
      });
    });

    // Test pour organizationMediaBySlugResolver
    describe("organizationMediaBySlugResolver", () => {
      it("devrait retourner le organization correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockOrganizationMedia = { organizationMediaID: 1, organizationMediaName: "Admin", slug: Slug };

        jest.spyOn(OrganizationMedia, "findOne").mockResolvedValue(mockOrganizationMedia);

        const result = await OrganizationMediaResolvers.Query.organizationMediaBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(OrganizationMedia.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.visited,
          mockOrganizationMedia
        );
        expect(result).toEqual(mockOrganizationMedia);
      });

      // Nouveau test : organization non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun organization n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(OrganizationMedia, "findOne").mockResolvedValue(null);

        await expect(
          OrganizationMediaResolvers.Query.organizationMediaBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          OrganizationMediaResolvers.Query.organizationMediaBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching organizationMedia by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: OrganizationMedia Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createOrganizationMediaResolver

    // Test pour createOrganizationMediaResolver
    describe("createOrganizationMediaResolver", () => {
      it("devrait créer un nouveau organizationMedia", async () => {
        const input = {
          lastname: "New OrganizationMedia",
          description: "Test organizationMedia",
          permissions: ["read", "write"],
        };
  
        const createdOrganizationMedia = {
          organizationMediaID: 1,
          lastname: "New OrganizationMedia",
          description: "Test organizationMedia",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createOrganizationMedia pour retourner le organizationMedia créé
        jest
          .spyOn(OrganizationMediaResolvers.Mutation, "createOrganizationMedia")
          .mockResolvedValue(createdOrganizationMedia);
  
        const result = await OrganizationMediaResolvers.Mutation.createOrganizationMedia(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(OrganizationMediaResolvers.Mutation.createOrganizationMedia).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdOrganizationMedia);
      });
    });

    describe("updateOrganizationMedia Mutation", () => {
      it("should successfully update a organizationMedia", async () => {
        const organizationMediaID = 1;
        const updateOrganizationMediaInput = {
          organizationMediaName: "Admin",
        };

        // données simulées de OrganizationMedia
        const mockOrganizationMediaData = {
          organizationMediaID,
          organizationMediaName: "FR",
        };

        //  `mockOrganizationMediaData` pour créer `mockOrganizationMedia`
        const mockOrganizationMedia = {
          ...mockOrganizationMediaData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockOrganizationMedia, updateValues); // Mettre à jour mockOrganizationMedia avec les nouvelles valeurs
            return { ...mockOrganizationMedia, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const organizationMediaID = 1;
        const updateOrganizationMediaInput = {
          organizationMediaName: "",
        };

        // données simulées de OrganizationMedia
        const mockOrganizationMediaData = {
          organizationMediaID,
          organizationMediaName: "FR",
        };

        //  `mockOrganizationMediaData` pour créer `mockOrganizationMedia`
        const mockOrganizationMedia = {
          ...mockOrganizationMediaData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockOrganizationMedia, updateValues); // Mettre à jour mockOrganizationMedia avec les nouvelles valeurs
            return { ...mockOrganizationMedia, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteOrganizationMediaResolver
    describe("deleteOrganizationMediaResolver", () => {
      it("devrait supprimer un organizationMedia avec succès", async () => {
        const organizationMediaID = 1;

        const mockOrganizationMedia = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(OrganizationMedia, "findByPk").mockResolvedValue(mockOrganizationMedia);

        const result = await OrganizationMediaResolvers.Mutation.deleteOrganizationMedia(
          null,
          { organizationMediaID },
          mockContext,
          null
        );

        expect(OrganizationMedia.findByPk).toHaveBeenCalledWith(organizationMediaID);
        expect(mockOrganizationMedia.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.OrganizationMedia.deleted,
          organizationMediaID
        );
        expect(result).toEqual({
          success: true,
          message: "OrganizationMedia deleted successfully",
        });
      });

      it("devrait lever une erreur si le organizationMedia à supprimer n'existe pas", async () => {
        const organizationMediaID = 999;

        jest.spyOn(OrganizationMedia, "findByPk").mockResolvedValue(null);

        await expect(
          OrganizationMediaResolvers.Mutation.deleteOrganizationMedia(null, { organizationMediaID }, mockContext, null)
        ).rejects.toThrow("OrganizationMedia not found");

        expect(OrganizationMedia.findByPk).toHaveBeenCalledWith(organizationMediaID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du organizationMedia", async () => {
        const organizationMediaID = 1;

        const mockOrganizationMedia = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(OrganizationMedia, "findByPk").mockResolvedValue(mockOrganizationMedia);

        await expect(
          OrganizationMediaResolvers.Mutation.deleteOrganizationMedia(null, { organizationMediaID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockOrganizationMedia.destroy).toHaveBeenCalled();
      });
    });
  });
});


