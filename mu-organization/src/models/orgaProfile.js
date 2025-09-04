import { Model, DataTypes } from "sequelize";
import { ProfileGender } from "smp-core-schema"; // Assumons l'existence de cette énumération

export default (db) => {
  class Profile extends Model {}

  Profile.init(
    {
      profileID: {
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
      firstName: {
        type: DataTypes.STRING(64),
      },
      lastName: {
        type: DataTypes.STRING(64),
      },
      dateOfBirth: {
        type: DataTypes.DATEONLY,
      },
      gender: {
        type: DataTypes.ENUM,
        values: Object.values(ProfileGender), // Adapté en supposant que ProfileGender est défini
      },
      nationality: {
        type: DataTypes.STRING(32),
      },
      phoneNumber: {
        type: DataTypes.STRING(32),
      },
      locationID: {
        type: DataTypes.INTEGER,
      },
      userID: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      profilePictureID: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      idCardNumber: {
        type: DataTypes.STRING(32),
      },
      passportNumber: {
        type: DataTypes.STRING(32),
      },
      socialSecurityNumber: {
        type: DataTypes.STRING(16),
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
      deletedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize: db,
      modelName: 'Profile',
      tableName: 'Profile',
      timestamps: true,
      paranoid: true, // Permet la suppression logique plutôt que la suppression physique
    }
  );

  return Profile;
};
