import { Model, DataTypes } from "sequelize";
import { ObjectStatus, UserType } from "smp-core-schema"; // Assumons l'existence de ces énumérations

export default (db) => {
  class User extends Model {}

  User.init(
    {
      userID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      uniqRef: {
        type: DataTypes.STRING(36),
        unique: true,
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(255),
        unique: true,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING(16),
        unique: true,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      profileID: {
        type: DataTypes.INTEGER,
        unique: true,
      },
      userKind: {
        type: DataTypes.ENUM,
        values: Object.values(UserType), // Assumons UserType définit les types
      },
      lastLogin: {
        type: DataTypes.DATE,
      },
      state: {
        type: DataTypes.ENUM,
        values: Object.values(ObjectStatus), // Assumons ObjectStatus définit les états
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize: db,
      modelName: 'User',
      tableName: 'User',
      timestamps: true, // Assumons que Sequelize gère les timestamps
      paranoid: true, // Assumons que les enregistrements sont marqués comme supprimés plutôt que d'être effacés
    }
  );

  return User;
};
