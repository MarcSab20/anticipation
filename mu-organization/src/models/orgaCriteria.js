import { Model ,DataTypes} from 'sequelize'; 
import { ObjectStatus } from "smp-core-schema";

export default (db) => {
    class Criteria extends Model {}
  
    Criteria.init({
      criteriaID: {
        type: DataTypes.INTEGER,
      },
      uniqRef: {
        type: DataTypes.STRING(36),
        unique: true,
        allowNull: false
      },
      slug: {
        type: DataTypes.STRING(255),
        unique: true,
        allowNull: false
      },
      authorID: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(255) 
      },
      criteriaDescription: {
        type: DataTypes.TEXT 
      },
      targetedEntityCriteria: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      state: {
        type: DataTypes.ENUM(Object.values(ObjectStatus)),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE, 
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE 
      }
    }, {
      sequelize: db,
      modelName: 'Criteria',
      tableName: 'Criteria',
      timestamps: true // Active les timestamps pour gérer createdAt et updatedAt automatiquement
    });
  
    return Criteria;
  };
  