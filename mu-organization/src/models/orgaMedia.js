import { Model, DataTypes } from 'sequelize';
import { MediaType, ObjectStatus } from "smp-core-schema";

export default (db) => {
  class Media extends Model {}; 

  Media.init({
    mediaID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    authorID: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mediaType: {
      type: DataTypes.ENUM(Object.values(MediaType)),
      allowNull: false,
    },
    url: DataTypes.STRING(255),
    legend: DataTypes.STRING(64),
    state: {
      type: DataTypes.ENUM(Object.values(ObjectStatus)),
    },
  }, {
    sequelize: db,
    modelName: 'Media',
    tableName: 'Media',
    timestamps: false 
  });

  return Media;
};

