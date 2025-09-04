// test/graphql/resolvers/UserOrganization.test.js

import { jest } from "@jest/globals";
import { UserOrganization } from "../../../src/index.js";
import { UserOrganizationResolvers } from "../../../src/graphql/Resolvers.js";

// Début des tests
describe("Tests du UserOrganizationResolver", () => {
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
   * @property {Object} SMPEvents.Organization.UserOrganization - UserOrganization-related event types.
   * @property {string} SMPEvents.Organization.UserOrganization.listed - Event type for when a userOrganization is listed.
   * @property {string} SMPEvents.Organization.UserOrganization.visited - Event type for when a userOrganization is visited.
   * @property {string} SMPEvents.Organization.UserOrganization.created - Event type for when a userOrganization is created.
   * @property {string} SMPEvents.Organization.UserOrganization.updated - Event type for when a userOrganization is updated.
   * @property {string} SMPEvents.Organization.UserOrganization.deleted - Event type for when a userOrganization is deleted.
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
        UserOrganization: {
          listed: "USER_ORGANIZATION_LISTED_EVENT",
          visited: "USER_ORGANIZATION_VISITED_EVENT",
          created: "USER_ORGANIZATION_CREATED_EVENT",
          updated: "USER_ORGANIZATION_UPDATED_EVENT",
          deleted: "USER_ORGANIZATION_DELETED_EVENT",
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
    // Test pour userOrganizationsResolver
    describe("userOrganizationsResolver", () => {
      it("devrait retourner une liste de userOrganization", async () => {
        // Données simulées
        const mockUserOrganizations = [
          { userOrganizationID: 1, userOrganizationName: "Admin" },
          { userOrganizationID: 2, userOrganizationName: "User" },
        ];

        // Mock de UserOrganization.findAll pour retourner des données simulées
        jest.spyOn(UserOrganization, "findAll").mockResolvedValue(mockUserOrganizations);

        // Exécution de la fonction à tester
        const result = await UserOrganizationResolvers.Query.userOrganizations(
          null,
          {},
          mockContext,
          null
        );

        // Vérifications
        expect(UserOrganization.findAll).toHaveBeenCalledWith({
          limit: 10,
          logging: expect.any(Function),
          offset: 0,
          order: [],
          where: {
            deletedAt: expect.any(Object),
          },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.listed,
          mockUserOrganizations
        );
        expect(result).toEqual(mockUserOrganizations);
      });

      // Nouveau test : aucun userOrganization n'est disponible
      it("devrait retourner une liste vide si aucun userOrganization n'est trouvé", async () => {
        const mockUserOrganizations = [];

        jest.spyOn(UserOrganization, "findAll").mockResolvedValue(mockUserOrganizations);

        const result = await UserOrganizationResolvers.Query.userOrganizations(
          null,
          {},
          mockContext,
          null
        );

        expect(UserOrganization.findAll).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.listed,
          mockUserOrganizations
        );
        expect(result).toEqual(mockUserOrganizations);
      });

      // Nouveau test : erreur lors de la récupération des userOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des userOrganization", async () => {
        jest
          .spyOn(UserOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          UserOrganizationResolvers.Query.userOrganizations(null, {}, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganizations: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour userOrganizationResolver
    describe("userOrganizationResolver", () => {
      it("devrait retourner le userOrganization correspondant à l'ID fourni", async () => {
        const userOrganizationID = 1;
        const mockUserOrganization = { userOrganizationID, userOrganizationName: "Admin" };

        // Mock de UserOrganization.findByPk pour retourner un userOrganization simulé
        jest.spyOn(UserOrganization, "findByPk").mockResolvedValue(mockUserOrganization);

        const result = await UserOrganizationResolvers.Query.userOrganization(
          null,
          { userOrganizationID },
          mockContext,
          null
        );

        expect(UserOrganization.findByPk).toHaveBeenCalledWith(userOrganizationID);
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.visited,
          mockUserOrganization
        );
        expect(result).toEqual(mockUserOrganization);
      });

      // Nouveau test : userOrganization non trouvé
      it("devrait lever une erreur si le userOrganization n'est pas trouvé", async () => {
        const userOrganizationID = 999;

        jest.spyOn(UserOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          UserOrganizationResolvers.Query.userOrganization(null, { userOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization ID 999 not found"
        );
      });

      // Nouveau test : ID du userOrganization invalide
      it("devrait lever une erreur si l'ID du userOrganization est invalide", async () => {
        const userOrganizationID = "invalid-id";

        await expect(
          UserOrganizationResolvers.Query.userOrganization(null, { userOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization ID invalid-id not found"
        );
      });

      // Nouveau test : erreur lors de la récupération du userOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération du userOrganization", async () => {
        const userOrganizationID = 1;

        jest
          .spyOn(UserOrganization, "findByPk")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          UserOrganizationResolvers.Query.userOrganization(null, { userOrganizationID }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by ID: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour userOrganizationsByIDsResolver
    describe("userOrganizationsByIDsResolver", () => {
      it("devrait retourner les userOrganization correspondants aux IDs fournis", async () => {
        const userOrganizationIDs = [3, 4];
        const mockUserOrganizations = [
          { userOrganizationID: 3, userOrganizationName: "Manager" },
          { userOrganizationID: 4, userOrganizationName: "Editor" },
        ];

        jest.spyOn(UserOrganization, "findAll").mockResolvedValue(mockUserOrganizations);

        const result = await UserOrganizationResolvers.Query.userOrganizationsByIDs(
          null,
          { userOrganizationIDs },
          mockContext,
          null
        );

        expect(UserOrganization.findAll).toHaveBeenCalledWith({
          where: { userOrganizationID: userOrganizationIDs },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.listed,
          mockUserOrganizations
        );
        expect(result).toEqual(mockUserOrganizations);
      });

      // Nouveau test : aucun userOrganization trouvé pour les IDs fournis
      it("devrait lever une erreur si aucun userOrganization n'est trouvé pour les IDs fournis", async () => {
        const userOrganizationIDs = [999, 1000];

        jest.spyOn(UserOrganization, "findAll").mockResolvedValue([]);

        await expect(
          UserOrganizationResolvers.Query.userOrganizationsByIDs(null, { userOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: No userOrganizations found for provided IDs"
        );
      });

      // Nouveau test : IDs non fournis
      it("devrait lever une erreur si la liste d'IDs est vide ou non fournie", async () => {
        const userOrganizationIDs = [];

        await expect(
          UserOrganizationResolvers.Query.userOrganizationsByIDs(null, { userOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization IDs not provided or invalid format"
        );
      });

      // Nouveau test : erreur lors de la récupération des userOrganization
      it("devrait lever une erreur si une exception se produit lors de la récupération des userOrganization par IDs", async () => {
        const userOrganizationIDs = [1, 2];

        jest
          .spyOn(UserOrganization, "findAll")
          .mockRejectedValue(new Error("Database error"));

        await expect(
          UserOrganizationResolvers.Query.userOrganizationsByIDs(null, { userOrganizationIDs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganizations by IDs: DBaseAccesError: Database Acces Error navigateEntityList:: Error: Database error"
        );
      });
    });

    // Test pour userOrganizationsBySlugsResolver
    describe("userOrganizationsBySlugsResolver", () => {
      it("devrait retourner les userOrganization correspondants aux slugs fournis", async () => {
        const slugs = ["admin", "user"];
        const mockUserOrganizations = [
          { userOrganizationID: 1, userOrganizationName: "Admin", slug: "admin" },
          { userOrganizationID: 2, userOrganizationName: "User", slug: "user" },
        ];

        jest.spyOn(UserOrganization, "findAll").mockResolvedValue(mockUserOrganizations);

        const result = await UserOrganizationResolvers.Query.userOrganizationsBySlugs(
          null,
          { slugs },
          mockContext,
          null
        );

        expect(UserOrganization.findAll).toHaveBeenCalledWith({ where: { slug: slugs } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.listed,
          mockUserOrganizations
        );
        expect(result).toEqual(mockUserOrganizations);
      });

      // Nouveau test : slugs non fournis
      it("devrait lever une erreur si la liste de slugs est vide ou non fournie", async () => {
        const slugs = [];

        await expect(
          UserOrganizationResolvers.Query.userOrganizationsBySlugs(null, { slugs }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganizations by Slugs: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization Slugs not provided or empty"
        );
      });
    });

    // Test pour userOrganizationByUniqRefResolver
    describe("userOrganizationByUniqRefResolver", () => {
      it("devrait retourner le userOrganization correspondant au UniqRef fourni", async () => {
        const UniqRef = "unique-reference";
        const mockUserOrganization = { userOrganizationID: 1, userOrganizationName: "Admin", uniqRef: UniqRef };

        jest.spyOn(UserOrganization, "findOne").mockResolvedValue(mockUserOrganization);

        const result = await UserOrganizationResolvers.Query.userOrganizationByUniqRef(
          null,
          { UniqRef },
          mockContext,
          null
        );

        expect(UserOrganization.findOne).toHaveBeenCalledWith({
          where: { uniqRef: UniqRef },
        });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.visited,
          mockUserOrganization
        );
        expect(result).toEqual(mockUserOrganization);
      });

      // Nouveau test : userOrganization non trouvé pour le UniqRef fourni
      it("devrait lever une erreur si aucun userOrganization n'est trouvé pour le UniqRef fourni", async () => {
        const UniqRef = "unknown-uniqref";

        jest.spyOn(UserOrganization, "findOne").mockResolvedValue(null);

        await expect(
          UserOrganizationResolvers.Query.userOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization UniqRef unknown-uniqref not found"
        );
      });

      // Nouveau test : UniqRef non fourni
      it("devrait lever une erreur si le UniqRef n'est pas fourni", async () => {
        const UniqRef = null;

        await expect(
          UserOrganizationResolvers.Query.userOrganizationByUniqRef(
            null,
            { UniqRef },
            mockContext,
            null
          )
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by UniqRef: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization UniqRef not provided"
        );
      });
    });

    // Test pour userOrganizationBySlugResolver
    describe("userOrganizationBySlugResolver", () => {
      it("devrait retourner le userOrganization correspondant au slug fourni", async () => {
        const Slug = "admin";
        const mockUserOrganization = { userOrganizationID: 1, userOrganizationName: "Admin", slug: Slug };

        jest.spyOn(UserOrganization, "findOne").mockResolvedValue(mockUserOrganization);

        const result = await UserOrganizationResolvers.Query.userOrganizationBySlug(
          null,
          { Slug },
          mockContext,
          null
        );

        expect(UserOrganization.findOne).toHaveBeenCalledWith({ where: { slug: Slug } });
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.visited,
          mockUserOrganization
        );
        expect(result).toEqual(mockUserOrganization);
      });

      // Nouveau test : userOrganization non trouvé pour le slug fourni
      it("devrait lever une erreur si aucun userOrganization n'est trouvé pour le slug fourni", async () => {
        const Slug = "unknown-slug";

        jest.spyOn(UserOrganization, "findOne").mockResolvedValue(null);

        await expect(
          UserOrganizationResolvers.Query.userOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization Slug unknown-slug not found"
        );
      });

      // Nouveau test : slug non fourni
      it("devrait lever une erreur si le slug n'est pas fourni", async () => {
        const Slug = null;

        await expect(
          UserOrganizationResolvers.Query.userOrganizationBySlug(null, { Slug }, mockContext, null)
        ).rejects.toThrow(
          "Query::Error fetching userOrganization by Slug: DBaseAccesError: Database Acces Error navigateEntityList:: UserInputDataValidationError: UserOrganization Slug not provided"
        );
      });
    });
  });

  // ------------------------------------------------------------- Tests des MUTATIONS ------------------------------------------------------------

  describe("Mutations", () => {
    // Test pour createUserOrganizationResolver

    // Test pour createUserOrganizationResolver
    describe("createUserOrganizationResolver", () => {
      it("devrait créer un nouveau userOrganization", async () => {
        const input = {
          lastname: "New UserOrganization",
          description: "Test userOrganization",
          permissions: ["read", "write"],
        };
  
        const createdUserOrganization = {
          userOrganizationID: 1,
          lastname: "New UserOrganization",
          description: "Test userOrganization",
          permissions: ["read", "write"],
          authorID: 1,
        };
  
        // Mock de createUserOrganization pour retourner le userOrganization créé
        jest
          .spyOn(UserOrganizationResolvers.Mutation, "createUserOrganization")
          .mockResolvedValue(createdUserOrganization);
  
        const result = await UserOrganizationResolvers.Mutation.createUserOrganization(
          null,
          { input },
          mockContext,
          null
        );
  
        expect(UserOrganizationResolvers.Mutation.createUserOrganization).toHaveBeenCalledWith(
          null,
          { input },
          mockContext,
          null
        );
        expect(result).toEqual(createdUserOrganization);
      });
    });

    describe("updateUserOrganization Mutation", () => {
      it("should successfully update a userOrganization", async () => {
        const userOrganizationID = 1;
        const updateUserOrganizationInput = {
          userOrganizationName: "Admin",
        };

        // données simulées de UserOrganization
        const mockUserOrganizationData = {
          userOrganizationID,
          userOrganizationName: "FR",
        };

        //  `mockUserOrganizationData` pour créer `mockUserOrganization`
        const mockUserOrganization = {
          ...mockUserOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockUserOrganization, updateValues); // Mettre à jour mockUserOrganization avec les nouvelles valeurs
            return { ...mockUserOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });

      it("send a error because the a input is empty ", async () => {
        const userOrganizationID = 1;
        const updateUserOrganizationInput = {
          userOrganizationName: "",
        };

        // données simulées de UserOrganization
        const mockUserOrganizationData = {
          userOrganizationID,
          userOrganizationName: "FR",
        };

        //  `mockUserOrganizationData` pour créer `mockUserOrganization`
        const mockUserOrganization = {
          ...mockUserOrganizationData,
          update: jest.fn().mockImplementation((updateValues) => {
            Object.assign(mockUserOrganization, updateValues); // Mettre à jour mockUserOrganization avec les nouvelles valeurs
            return { ...mockUserOrganization, ...updateValues }; // Retourner un objet mis à jour
          }),
        };
      });
    });

    // Test pour deleteUserOrganizationResolver
    describe("deleteUserOrganizationResolver", () => {
      it("devrait supprimer un userOrganization avec succès", async () => {
        const userOrganizationID = 1;

        const mockUserOrganization = {
          destroy: jest.fn().mockResolvedValue(),
        };

        jest.spyOn(UserOrganization, "findByPk").mockResolvedValue(mockUserOrganization);

        const result = await UserOrganizationResolvers.Mutation.deleteUserOrganization(
          null,
          { userOrganizationID },
          mockContext,
          null
        );

        expect(UserOrganization.findByPk).toHaveBeenCalledWith(userOrganizationID);
        expect(mockUserOrganization.destroy).toHaveBeenCalled();
        expect(mockContext.event.publish).toHaveBeenCalledWith(
          mockContext.SMPEvents.Organization.UserOrganization.deleted,
          userOrganizationID
        );
        expect(result).toEqual({
          success: true,
          message: "UserOrganization deleted successfully",
        });
      });

      it("devrait lever une erreur si le userOrganization à supprimer n'existe pas", async () => {
        const userOrganizationID = 999;

        jest.spyOn(UserOrganization, "findByPk").mockResolvedValue(null);

        await expect(
          UserOrganizationResolvers.Mutation.deleteUserOrganization(null, { userOrganizationID }, mockContext, null)
        ).rejects.toThrow("UserOrganization not found");

        expect(UserOrganization.findByPk).toHaveBeenCalledWith(userOrganizationID);
      });

      it("devrait lever une erreur si une exception se produit lors de la suppression du userOrganization", async () => {
        const userOrganizationID = 1;

        const mockUserOrganization = {
          destroy: jest
            .fn()
            .mockRejectedValue(new Error("Erreur de base de données")),
        };

        jest.spyOn(UserOrganization, "findByPk").mockResolvedValue(mockUserOrganization);

        await expect(
          UserOrganizationResolvers.Mutation.deleteUserOrganization(null, { userOrganizationID }, mockContext, null)
        ).rejects.toThrow("Erreur de base de données");

        expect(mockUserOrganization.destroy).toHaveBeenCalled();
      });
    });
  });
});


