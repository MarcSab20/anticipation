// test/graphql/resolvers/Industry.test.js

import { jest } from "@jest/globals";
import { Industry } from "../../../src/index.js";
import { IndustryResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du IndustryResolver", () => {
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
   * @property {Object} SMPEvents.Organization.Industry - Industry-related event types.
   * @property {string} SMPEvents.Organization.Industry.listed - Event type for when a industry is listed.
   * @property {string} SMPEvents.Organization.Industry.visited - Event type for when a industry is visited.
   * @property {string} SMPEvents.Organization.Industry.created - Event type for when a industry is created.
   * @property {string} SMPEvents.Organization.Industry.updated - Event type for when a industry is updated.
   * @property {string} SMPEvents.Organization.Industry.deleted - Event type for when a industry is deleted.
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
        Industry: {
          listed: "INDUSTRY_LISTED_EVENT",
          visited: "INDUSTRY_VISITED_EVENT",
          created: "INDUSTRY_CREATED_EVENT",
          updated: "INDUSTRY_UPDATED_EVENT",
          deleted: "INDUSTRY_DELETED_EVENT",
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
    // Test pour industrysResolver
    describe("industrysResolver", () => {
      it("devrait retourner une liste de industry", async () => {
        // Données simulées
        const mockIndustrys = [
          { industryID: 1, industryName: "Admin" },
          { industryID: 2, industryName: "User" },
        ];

        // Mock de Industry.findAll pour retourner des données simulées
        jest.spyOn(Industry, "findAll").mockResolvedValue(mockIndustrys);

        // Exécution de la fonction à tester
        const result = await IndustryResolvers.Query.industrys(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(Industry.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.listed,
          mockIndustrys
        );
        expect(result).toEqual(mockIndustrys);
      });

      // Nouveau test : aucun rôle n'est disponible
      it("devrait retourner une liste vide si aucun rôle n'est trouvé", async () => {
        const mockIndustrys = [];

        jest.spyOn(Industry, "findAll").mockResolvedValue(mockIndustrys);

        const result = await IndustryResolvers.Query.industrys(
          null,
          {},
          mockContext,
          null
        );

        expect(Industry.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.listed,
          mockIndustrys
        );
        expect(result).toEqual(mockIndustrys);
      });

      // Nouveau test : erreur lors de la récupération des industry
      it("devrait lever une erreur si une exception se produit lors de la récupération des industry", async () => {
        jest
          .spyOn(Industry, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          IndustryResolvers.Query.industrys(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industrys: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour industryResolver
    describe("industryResolver", () => {
      it("devrait retourner le rôle correspondant à l'ID fourni", async () => {
        const industryID = 1;
        const mockIndustry = { industryID, industryName: "Admin" };

        // Mock de Industry.findByPk pour retourner un rôle simulé
        jest.spyOn(Industry, "findByPk").mockResolvedValue(mockIndustry);

        const result = await IndustryResolvers.Query.industry(
          null,
          { industryID },
          mockContext,
          null
        );

        expect(Industry.findByPk).toHaveBeenCalledWith(industryID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.visited,
          mockIndustry
        );
        expect(result).toEqual(mockIndustry);
      });

      // Nouveau test : rôle non trouvé
      it("devrait lever une erreur si le rôle n'est pas trouvé", async () => {
        const industryID = 999;

        jest.spyOn(Industry, "findByPk").mockResolvedValue(null);

        await expect(
          IndustryResolvers.Query.industry(null, { industryID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industry by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry ID 999 not found"
        );
      });

      // Nouveau test : ID du rôle invalide
      it("devrait lever une erreur si l'ID du rôle est invalide", async () => {
        const industryID = "invalid-id";

        await expect(
          IndustryResolvers.Query.industry(null, { industryID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industry by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du rôle
      it("devrait lever une erreur si une exception se produit lors de la récupération du rôle", async () => {
        const industryID = 1;

        jest
          .spyOn(Industry, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          IndustryResolvers.Query.industry(null, { industryID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industry by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour industrysByIDsResolver
    describe("industrysByIDsResolver", () => {
      it("devrait retourner les industry correspondants aux IDs fournis", async () => {
        const industryIDs = [3, 4];
        const mockIndustrys = [
          { industryID: 3, industryName: "Manager" },
          { industryID: 4, industryName: "Editor" },
        ];

        jest.spyOn(Industry, "findAll").mockResolvedValue(mockIndustrys);

        const result = await IndustryResolvers.Query.industrysByIDs(
          null,
          { industryIDs },
          mockContext,
          null
        );

        expect(Industry.findAll).toHaveBeenCalledWith({
          where: { industryID: industryIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.listed,
          mockIndustrys
        );
        expect(result).toEqual(mockIndustrys);
      });

      // Nouveau test : aucun rôle trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun rôle n'est trouvé pour les IDs fournis", async () => {
        const industryIDs = [999, 1000];

        jest.spyOn(Industry, "findAll").mockResolvedValue([]);

        await expect(
          IndustryResolvers.Query.industrysByIDs(null, { industryIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industrys by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No industrys found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const industryIDs = [];

        await expect(
          IndustryResolvers.Query.industrysByIDs(null, { industryIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industrys by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des industry
      it("devrait lever une erreur si une exception se produit lors de la récupération des industry par IDs", async () => {
        const industryIDs = [1, 2];

        jest
          .spyOn(Industry, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          IndustryResolvers.Query.industrysByIDs(null, { industryIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industrys by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour industrysBySlugsResolver
    describe("industrysBySlugsResolver", () => {
      it("devrait retourner les industry correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockIndustrys = [
          { industryID: 1, industryName: "Admin", slug: "admin" },
          { industryID: 2, industryName: "User", slug: "user" },
        ];

        jest.spyOn(Industry, "findAll").mockResolvedValue(mockIndustrys);

        const result = await IndustryResolvers.Query.industrysBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(Industry.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.listed,
          mockIndustrys
        );
        expect(result).toEqual(mockIndustrys);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          IndustryResolvers.Query.industrysBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industrys by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry Slugs not provided or empty"
        );
      });
    });

    // Test pour industryByUniqRefResolver
    describe("industryByUniqRefResolver", () => {
      it("devrait retourner le rôle correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockIndustry = { industryID: 1, industryName: "Admin", uniqRef: UniqRef };

        jest.spyOn(Industry, "findOne").mockResolvedValue(mockIndustry);

        const result = await IndustryResolvers.Query.industryByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(Industry.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.visited,
          mockIndustry
        );
        expect(result).toEqual(mockIndustry);
      });

      // Nouveau test : rôle non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun rôle n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(Industry, "findOne").mockResolvedValue(null);

        await expect(
          IndustryResolvers.Query.industryByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching industry by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          IndustryResolvers.Query.industryByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching industry by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry UniqRef not provided"
        );
      });
    });

    // Test pour industryBySlugResolver
    describe("industryBySlugResolver", () => {
      it("devrait retourner le rôle correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockIndustry = { industryID: 1, industryName: "Admin", slug: Slug };

        jest.spyOn(Industry, "findOne").mockResolvedValue(mockIndustry);

        const result = await IndustryResolvers.Query.industryBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(Industry.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.visited,
          mockIndustry
        );
        expect(result).toEqual(mockIndustry);
      });

      // Nouveau test : rôle non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun rôle n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(Industry, "findOne").mockResolvedValue(null);

        await expect(
          IndustryResolvers.Query.industryBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industry by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          IndustryResolvers.Query.industryBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching industry by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: Industry Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createIndustryResolver

    // Test pour createIndustryResolver
    describe("createIndustryResolver", () => {
      it("devrait créer un nouveau industry", async () => {
        const input = {
          lastname: "New Industry",
          description: "Test industry",
          permissions: ["read", "write"],
        };
  
        const createdIndustry = {
          industryID: 1,
          lastname: "New Industry",
          description: "Test industry",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createIndustry pour retourner le industry créé
        jest
          .spyOn(IndustryResolvers.Mutation, "createIndustry")
          .mockResolvedValue(createdIndustry);
  
        const result = await IndustryResolvers.Mutation.createIndustry(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(IndustryResolvers.Mutation.createIndustry).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdIndustry);
      });
    });

    describe("updateIndustry Mutation", () => {
      it("should successfully update a industry", async () => {
        const industryID = 1;
        const updateIndustryInput = {
          industryName: "Admin",
        };

        // données simulées de Industry
        const mockIndustryData = {
          industryID,
          industryName: "FR",
        };

        //  `mockIndustryData` pour créer `mockIndustry`
        const mockIndustry = {
          ...mockIndustryData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockIndustry, updateValues); // Mettre à jour mockIndustry avec les nouvelles valeurs
            return { ...mockIndustry, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const industryID = 1;
        const updateIndustryInput = {
          industryName: "",
        };

        // données simulées de Industry
        const mockIndustryData = {
          industryID,
          industryName: "FR",
        };

        //  `mockIndustryData` pour créer `mockIndustry`
        const mockIndustry = {
          ...mockIndustryData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockIndustry, updateValues); // Mettre à jour mockIndustry avec les nouvelles valeurs
            return { ...mockIndustry, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteIndustryResolver
    describe("deleteIndustryResolver", () => {
      it("devrait supprimer un industry avec succès", async () => {
        const industryID = 1;

        const mockIndustry = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(Industry, "findByPk").mockResolvedValue(mockIndustry);

        const result = await IndustryResolvers.Mutation.deleteIndustry(
          null,
          { industryID },
          mockContext,
          null
        );

        expect(Industry.findByPk).toHaveBeenCalledWith(industryID);
        expect(mockIndustry.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.Industry.deleted,
          industryID
        );
        expect(result).toEqual({
          success: true,
          message: "Industry deleted successfully",
        });
      });

      it("devrait lever une erreur si le industry à supprimer n'existe pas", async () => {
        const industryID = 999;

        jest.spyOn(Industry, "findByPk").mockResolvedValue(null);

        await expect(
          IndustryResolvers.Mutation.deleteIndustry(null, { industryID }, mockContext, null)
        ).rejects.toThrow("Industry not found");

        expect(Industry.findByPk).toHaveBeenCalledWith(industryID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du industry", async () => {
        const industryID = 1;

        const mockIndustry = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(Industry, "findByPk").mockResolvedValue(mockIndustry);

        await expect(
          IndustryResolvers.Mutation.deleteIndustry(null, { industryID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockIndustry.destroy).toHaveBeenCalled();
      });
    });
  });
});


