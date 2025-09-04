// src/modelsOrga/orgaTag.js.js
import { Model,DataTypes } from 'sequelize'; 
import { ObjectStatus } from 'smp-core-schema';

export default (db) => {
    class Tag extends Model {}
  
    Tag.init({
      tagID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
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
      value: {
        type: DataTypes.STRING(32)
      },
      topicID: {
        type: DataTypes.INTEGER,
        allowNull: true, 
        
      },
      state: {
        type: DataTypes.ENUM(Object.values(ObjectStatus)), 
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE, 
        allowNull: false,
        defaultValue: DataTypes.NOW 
      },
      updatedAt: {
        type: DataTypes.DATE, 
      }
    }, {
      sequelize:db,
      modelName: 'Tag',
      tableName: 'Tag',
      timestamps: true, // Active la gestion automatique de 'createdAt' et 'updatedAt' par Sequelize
    });
  
    return Tag;
  };
   