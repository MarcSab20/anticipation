import { PlaceKind, ObjectStatus } from "smp-core-schema";
import { Model, DataTypes } from "sequelize";

export default (db) => {
  class Place extends Model {}
  console.log(process.env)
  
console.log(Model);
  Place.init(
    {
      placeID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      uniqRef: {
        type: DataTypes.STRING(36),
        unique: true,
      },
      slug: {
        type: DataTypes.STRING(255),
        unique: true,
      },
      country: {
        type: DataTypes.STRING(32),

      },
      region: {
        type: DataTypes.STRING(64),
      },
      pstate: {
        type: DataTypes.STRING(64),
      },
      city: {
        type: DataTypes.STRING(32),
      },
      postalCode: {
        type: DataTypes.STRING(16),
      },
      placeKind: {
        type: DataTypes.ENUM(Object.values(PlaceKind)),
        defaultValue: PlaceKind.UNKNOWN,
      },
      addressLine1: {
        type: DataTypes.STRING(255),
      },
      coordinates: {
        type: DataTypes.GEOMETRY("POINT"),
      },
      state: {
        type: DataTypes.ENUM(Object.values(ObjectStatus)),
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize: db,
      modelName: "Place",
      tableName: "Place",
      timestamps: true,
      paranoid: true,
    }
  );

  return Place;
};
